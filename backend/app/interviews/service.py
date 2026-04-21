import asyncio
import logging
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.interview_agent.service import (
    evaluate_answer_only,
    generate_devils_advocate_challenge_question,
    generate_first_question,
    get_max_questions,
)
from app.interview_agent.tts import synthesize_question_audio_data_uri
from app.interviews.models import build_interview_document, build_response_document
from app.interviews.schemas import StartInterviewRequest, SubmitAnswerRequest
from app.interviews.contradiction import detect_contradiction


logger = logging.getLogger(__name__)


def _coerce_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _sanitize_contradiction_result(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None

    required_keys = {
        "contradiction",
        "confidence",
        "topic",
        "previous_claim",
        "current_claim",
        "explanation",
        "severity",
    }
    if not required_keys.issubset(set(raw.keys())):
        return None

    try:
        confidence = float(raw.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0

    return {
        "contradiction": bool(raw.get("contradiction", False)),
        "confidence": max(0.0, min(1.0, confidence)),
        "topic": str(raw.get("topic") or "").strip(),
        "previous_claim": str(raw.get("previous_claim") or "").strip(),
        "current_claim": str(raw.get("current_claim") or "").strip(),
        "explanation": str(raw.get("explanation") or "").strip(),
        "severity": str(raw.get("severity") or "low").strip().lower() or "low",
    }


def _normalize_timeline_items(raw_items: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_items, list):
        return []

    normalized: list[dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        timestamp = item.get("timestamp")
        try:
            timestamp_float = float(timestamp)
        except (TypeError, ValueError):
            continue

        normalized.append(
            {
                "timestamp": max(0.0, timestamp_float),
                "label": str(item.get("label") or "").strip() or None,
                "payload": item.get("payload") if isinstance(item.get("payload"), dict) else {},
            }
        )

    return normalized


def _normalize_persona(persona: str | None) -> str:
    return (persona or "").strip().lower().replace("-", "_").replace(" ", "_").replace("'", "")


def _is_devils_advocate(persona: str | None) -> bool:
    normalized = _normalize_persona(persona)
    return normalized in {"devils_advocate", "devil_advocate"}


def _detect_uncertainty_reasons(
    *,
    answer: str,
    evaluation: dict[str, Any],
    contradiction_result: dict[str, Any] | None,
) -> list[str]:
    reasons: list[str] = []

    lowered_answer = answer.lower()
    uncertainty_markers = [
        "i think",
        "maybe",
        "not sure",
        "i guess",
        "probably",
        "kind of",
        "sort of",
        "might be",
        "i don't know",
    ]
    if any(marker in lowered_answer for marker in uncertainty_markers):
        reasons.append("verbal uncertainty markers")

    score = _coerce_int(evaluation.get("score"), 5)
    if score <= 5:
        reasons.append("low answer score")

    feedback_text = str(evaluation.get("feedback") or "").lower()
    weak_feedback_markers = [
        "unclear",
        "vague",
        "not enough detail",
        "insufficient",
        "uncertain",
        "contradict",
        "inconsistent",
    ]
    if any(marker in feedback_text for marker in weak_feedback_markers):
        reasons.append("evaluation flagged weak clarity")

    if contradiction_result and contradiction_result.get("contradiction"):
        confidence = float(contradiction_result.get("confidence") or 0.0)
        if confidence >= 0.55:
            reasons.append("high-confidence contradiction")

    # Preserve order while removing duplicates.
    return list(dict.fromkeys(reasons))


def get_interviews_collection(db: AsyncIOMotorDatabase) -> AsyncIOMotorCollection:
    return db["interviews"]


def get_responses_collection(db: AsyncIOMotorDatabase) -> AsyncIOMotorCollection:
    return db["responses"]


async def ensure_interview_indexes(db: AsyncIOMotorDatabase) -> None:
    logger.info("Ensuring interview indexes")
    interviews = get_interviews_collection(db)
    responses = get_responses_collection(db)

    await interviews.create_index("user_id", name="idx_interviews_user_id")
    await responses.create_index("user_id", name="idx_responses_user_id")
    await responses.create_index([("interview_id", 1), ("created_at", 1)], name="idx_responses_interview_created_at")
    logger.info("Interview indexes ensured")


def _parse_object_id(raw_id: str, *, field_name: str) -> ObjectId:
    try:
        return ObjectId(raw_id)
    except InvalidId as exc:
        logger.error("Invalid ObjectId received", extra={"field_name": field_name, "raw_id": raw_id})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name}",
        ) from exc


def _serialize_interview(interview: dict[str, Any]) -> dict[str, Any]:
    questions_bank = interview.get("questions_bank") or []
    return {
        "id": str(interview["_id"]),
        "user_id": interview["user_id"],
        "role": interview["role"],
        "difficulty": interview["difficulty"],
        "persona": interview["persona"],
        "status": interview["status"],
        "created_at": interview["created_at"],
        "questions_bank": questions_bank,
        "total_questions": len(questions_bank),
        "session_analysis": interview.get("session_analysis"),
    }


def _serialize_response(response: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(response["_id"]),
        "interview_id": str(response["interview_id"]),
        "user_id": response["user_id"],
        "question": response["question"],
        "answer": response["answer"],
        "score": response.get("score"),
        "feedback": response.get("feedback"),
        "strengths": response.get("strengths"),
        "weaknesses": response.get("weaknesses"),
        "contradiction_analysis": response.get("contradiction_analysis"),
        "created_at": response["created_at"],
    }


async def start_interview(db: AsyncIOMotorDatabase, payload: StartInterviewRequest, user_id: str) -> dict[str, Any]:
    logger.info(
        "Starting interview",
        extra={"user_id": user_id, "role": payload.role, "difficulty": payload.difficulty, "persona": payload.persona},
    )
    interviews = get_interviews_collection(db)

    max_questions = get_max_questions()

    # Generate the full question bank upfront (25 questions)
    first = await generate_first_question(
        db=db,
        user_id=user_id,
        role=payload.role,
        difficulty=payload.difficulty,
        persona=payload.persona,
        max_questions=max_questions,
    )
    first_question = first["question"]
    questions_bank = first.get("questions_bank", [first_question])
    logger.info(
        "Question bank generated",
        extra={"user_id": user_id, "bank_size": len(questions_bank), "first_question_length": len(first_question)},
    )

    interview_doc = build_interview_document(
        user_id=user_id,
        role=payload.role,
        difficulty=first.get("difficulty", payload.difficulty),
        persona=payload.persona,
        current_question=first_question,
        max_questions=len(questions_bank),
        questions_bank=questions_bank,
    )
    created = await interviews.insert_one(interview_doc)
    logger.info("Interview document inserted", extra={"interview_id": str(created.inserted_id), "user_id": user_id})
    first_question_audio_data_uri = await asyncio.to_thread(synthesize_question_audio_data_uri, first_question)
    logger.info(
        "First question TTS generation completed",
        extra={"interview_id": str(created.inserted_id), "audio_generated": first_question_audio_data_uri is not None},
    )

    return {
        "interview_id": str(created.inserted_id),
        "first_question": first_question,
        "first_question_audio_data_uri": first_question_audio_data_uri,
        "questions_bank": questions_bank,
        "total_questions": len(questions_bank),
        "status": "ongoing",
    }


async def submit_answer(db: AsyncIOMotorDatabase, payload: SubmitAnswerRequest, user_id: str) -> dict[str, Any]:
    logger.info("Submitting interview answer", extra={"user_id": user_id, "interview_id": payload.interview_id, "answer_length": len(payload.answer)})
    interview_id = _parse_object_id(payload.interview_id, field_name="interview_id")
    interviews = get_interviews_collection(db)
    responses = get_responses_collection(db)

    interview = await interviews.find_one({"_id": interview_id})
    if not interview:
        logger.warning("Interview not found during submit", extra={"interview_id": str(interview_id), "user_id": user_id})
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    if interview["user_id"] != user_id:
        logger.warning(
            "Interview ownership mismatch",
            extra={"interview_id": str(interview_id), "request_user_id": user_id, "owner_user_id": interview.get("user_id")},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to access this interview",
        )

    if interview["status"] == "completed":
        logger.warning("Submit attempted on completed interview", extra={"interview_id": str(interview_id), "user_id": user_id})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Interview is already completed",
        )

    past_responses = await responses.find({"interview_id": interview_id}).sort("created_at", 1).to_list(length=100)
    answered_count = len(past_responses)
    questions_bank = interview.get("questions_bank") or []
    
    # Handle legacy interviews that started before the question bank update
    if not questions_bank:
        logger.info("Questions bank missing (legacy interview); generating on the fly", extra={"interview_id": str(interview_id)})
        from app.interview_agent.service import generate_question_bank
        questions_bank = await generate_question_bank(
            db=db,
            user_id=user_id,
            role=interview["role"],
            difficulty=interview["difficulty"],
            persona=interview["persona"],
            max_questions=int(interview.get("max_questions") or get_max_questions())
        )
        await interviews.update_one({"_id": interview_id}, {"$set": {"questions_bank": questions_bank}})
        
    max_questions = len(questions_bank)
    if max_questions <= 0:
        logger.error("Questions bank empty after generation", extra={"interview_id": str(interview_id)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Questions bank is empty",
        )

    current_question_index = _coerce_int(interview.get("current_question_index"), answered_count)
    if current_question_index < 0:
        current_question_index = 0

    if current_question_index >= max_questions:
        current_question_index = max_questions - 1

    logger.info(
        "Interview progress before submit",
        extra={
            "interview_id": str(interview_id),
            "answered_count": answered_count,
            "max_questions": max_questions,
            "current_question_index": current_question_index,
        },
    )
    if answered_count >= max_questions:
        await interviews.update_one({"_id": interview_id}, {"$set": {"status": "completed"}})
        logger.warning("Interview exhausted questions; marked completed", extra={"interview_id": str(interview_id)})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Interview has no remaining questions",
        )

    current_question = str(interview.get("current_question") or "").strip()
    if not current_question:
        logger.error("Interview current_question missing", extra={"interview_id": str(interview_id)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Interview current question is missing",
        )

    # Evaluate the answer only (no question generation — questions come from the bank)
    try:
        agent_result = await evaluate_answer_only(
            db=db,
            interview_id=interview_id,
            user_id=user_id,
            role=interview["role"],
            difficulty=interview["difficulty"],
            persona=interview["persona"],
            question=current_question,
            answer=payload.answer,
        )
        evaluation = agent_result["evaluation"]
    except Exception:
        logger.exception("Answer evaluation failed, using fallback evaluation", extra={"interview_id": str(interview_id)})
        evaluation = {
            "score": 5,
            "feedback": "Evaluation temporarily unavailable. Your answer was saved successfully.",
            "strengths": [],
            "weaknesses": [],
        }
    logger.info(
        "Interview agent returned evaluation",
        extra={
            "interview_id": str(interview_id),
            "score": evaluation.get("score"),
        },
    )

    # Contradiction detection
    memory_parts = []
    for doc in past_responses:
        memory_parts.append(f"Q: {doc['question']}\nA: {doc['answer']}")
    memory = "\n\n".join(memory_parts)

    try:
        contradiction_result = _sanitize_contradiction_result(await detect_contradiction(memory, payload.answer))
    except Exception:
        logger.exception("Contradiction detection failed; skipping contradiction payload", extra={"interview_id": str(interview_id)})
        contradiction_result = None

    response_doc = build_response_document(
        interview_id=interview_id,
        user_id=user_id,
        question=current_question,
        answer=payload.answer,
        evaluation=evaluation,
        contradiction_analysis=contradiction_result,
    )
    await responses.insert_one(response_doc)
    logger.info("Interview response document inserted", extra={"interview_id": str(interview_id), "user_id": user_id})

    # Determine next question from the bank
    next_question_index = current_question_index + 1
    if next_question_index >= max_questions:
        # Interview complete — no more questions in the bank
        await interviews.update_one(
            {"_id": interview_id},
            {
                "$set": {
                    "status": "completed",
                    "current_question": None,
                    "current_question_index": max_questions,
                    "last_score": evaluation["score"],
                }
            },
        )
        logger.info("Interview completed after submit", extra={"interview_id": str(interview_id), "final_score": evaluation.get("score")})
        return {
            "interview_id": str(interview_id),
            "evaluation": evaluation,
            "next_question": None,
            "next_question_audio_data_uri": None,
            "status": "completed",
            "contradiction_analysis": contradiction_result,
        }

    # Get the next question from the pre-generated bank
    next_question = questions_bank[next_question_index] if next_question_index < len(questions_bank) else None

    if _is_devils_advocate(str(interview.get("persona") or "")):
        uncertainty_reasons = _detect_uncertainty_reasons(
            answer=payload.answer,
            evaluation=evaluation,
            contradiction_result=contradiction_result,
        )
        if uncertainty_reasons:
            logger.info(
                "Uncertainty detected for Devil's Advocate persona; generating pressure follow-up",
                extra={
                    "interview_id": str(interview_id),
                    "reasons": uncertainty_reasons,
                },
            )
            history_for_challenge = [
                {
                    "question": str(doc.get("question") or ""),
                    "answer": str(doc.get("answer") or ""),
                    "score": _coerce_int(doc.get("score"), 5),
                    "feedback": str(doc.get("feedback") or ""),
                }
                for doc in past_responses
            ]
            history_for_challenge.append(
                {
                    "question": current_question,
                    "answer": payload.answer,
                    "score": _coerce_int(evaluation.get("score"), 5),
                    "feedback": str(evaluation.get("feedback") or ""),
                }
            )

            next_question = await generate_devils_advocate_challenge_question(
                role=interview["role"],
                difficulty=interview["difficulty"],
                last_question=current_question,
                last_answer=payload.answer,
                history=history_for_challenge,
                trigger_reasons=uncertainty_reasons,
            )

    if not next_question:
        logger.error("Questions bank exhausted unexpectedly", extra={"interview_id": str(interview_id), "index": next_question_index})
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Questions bank exhausted unexpectedly",
        )

    await interviews.update_one(
        {"_id": interview_id},
        {
            "$set": {
                "current_question": next_question,
                "current_question_index": next_question_index,
                "last_score": evaluation["score"],
            }
        },
    )
    logger.info("Interview state updated with next question from bank", extra={"interview_id": str(interview_id), "question_index": next_question_index})

    next_question_audio_data_uri = await asyncio.to_thread(synthesize_question_audio_data_uri, next_question)
    logger.info(
        "Next question TTS generation completed",
        extra={"interview_id": str(interview_id), "audio_generated": next_question_audio_data_uri is not None},
    )

    return {
        "interview_id": str(interview_id),
        "evaluation": evaluation,
        "next_question": next_question,
        "next_question_audio_data_uri": next_question_audio_data_uri,
        "status": "ongoing",
        "contradiction_analysis": contradiction_result,
    }


async def get_interview_details(db: AsyncIOMotorDatabase, interview_id_raw: str, user_id: str) -> dict[str, Any]:
    logger.info("Fetching interview details", extra={"user_id": user_id, "interview_id": interview_id_raw})
    interview_id = _parse_object_id(interview_id_raw, field_name="id")
    interviews = get_interviews_collection(db)
    responses = get_responses_collection(db)

    interview = await interviews.find_one({"_id": interview_id})
    if not interview:
        logger.warning("Interview not found when fetching details", extra={"interview_id": str(interview_id), "user_id": user_id})
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    if interview["user_id"] != user_id:
        logger.warning(
            "Interview detail ownership mismatch",
            extra={"interview_id": str(interview_id), "request_user_id": user_id, "owner_user_id": interview.get("user_id")},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to access this interview",
        )

    response_docs = await responses.find({"interview_id": interview_id}).sort("created_at", 1).to_list(length=1000)
    logger.info(
        "Interview details assembled",
        extra={"interview_id": str(interview_id), "response_count": len(response_docs)},
    )
    return {
        "interview": _serialize_interview(interview),
        "responses": [_serialize_response(doc) for doc in response_docs],
    }


async def save_session_analysis(db: AsyncIOMotorDatabase, interview_id_raw: str, user_id: str, session_analysis: dict[str, Any]) -> dict[str, Any]:
    """Save voice/video session analysis data to the interview document."""
    logger.info("Saving session analysis", extra={"user_id": user_id, "interview_id": interview_id_raw})
    interview_id = _parse_object_id(interview_id_raw, field_name="interview_id")
    interviews = get_interviews_collection(db)

    interview = await interviews.find_one({"_id": interview_id})
    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    if interview["user_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to access this interview",
        )

    # Fill in robust defaults for missing fields
    video_timeline = _normalize_timeline_items(session_analysis.get("video_timeline"))
    voice_timeline = _normalize_timeline_items(session_analysis.get("voice_timeline"))

    sanitized = {
        "voice_summary": session_analysis.get("voice_summary"),
        "key_moments": session_analysis.get("key_moments") or [],
        "confidence": session_analysis.get("confidence"),
        "clarity": session_analysis.get("clarity"),
        "nervousness": session_analysis.get("nervousness"),
        "posture_score": session_analysis.get("posture_score"),
        "gaze_score": session_analysis.get("gaze_score"),
        "fidgeting_score": session_analysis.get("fidgeting_score"),
        "dominant_emotion": session_analysis.get("dominant_emotion"),
        "duration_seconds": session_analysis.get("duration_seconds"),
        "video_timeline": video_timeline,
        "voice_timeline": voice_timeline,
    }

    await interviews.update_one(
        {"_id": interview_id},
        {"$set": {"session_analysis": sanitized}},
    )
    logger.info("Session analysis saved", extra={"interview_id": str(interview_id), "has_voice_summary": sanitized.get("voice_summary") is not None})
    return {"status": "ok", "interview_id": str(interview_id)}
