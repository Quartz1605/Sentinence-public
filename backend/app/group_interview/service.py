from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.interview_agent.llm import invoke_llm_json
from app.meeting_room.speech_service import synthesize_text_to_data_uri, transcribe_audio_base64


logger = logging.getLogger(__name__)


INTERVIEWERS: list[dict[str, str]] = [
    {"id": "panel-tech", "name": "Aarav", "track": "technical"},
    {"id": "panel-hr", "name": "Sana", "track": "hr"},
    {"id": "panel-mixed", "name": "Kabir", "track": "mixed"},
]


def get_group_interviews_collection(db: AsyncIOMotorDatabase) -> AsyncIOMotorCollection:
    return db["group_interviews"]


async def ensure_group_interview_indexes(db: AsyncIOMotorDatabase) -> None:
    collection = get_group_interviews_collection(db)
    await collection.create_index("user_id", name="idx_group_interviews_user_id")
    await collection.create_index(
        [("user_id", 1), ("status", 1)],
        name="idx_group_interviews_user_status",
    )


def _parse_object_id(value: str, field_name: str) -> ObjectId:
    try:
        return ObjectId(value)
    except InvalidId as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name}",
        ) from exc


def _total_turns() -> int:
    raw = os.getenv("GROUP_INTERVIEW_TOTAL_TURNS", "9")
    try:
        value = int(raw)
    except ValueError:
        value = 9
    return max(3, min(18, value))


def _next_interviewer(turn_number: int) -> dict[str, str]:
    return INTERVIEWERS[turn_number % len(INTERVIEWERS)]


def _format_context(turns: list[dict[str, Any]]) -> str:
    if not turns:
        return "No prior interviewer turns yet."
    lines: list[str] = []
    for idx, turn in enumerate(turns[-6:], start=1):
        evaluation = turn.get("evaluation") or {}
        lines.append(
            (
                f"Turn {idx} | {turn.get('interviewer_name')} ({turn.get('interviewer_track')})\n"
                f"Question: {turn.get('question')}\n"
                f"Answer: {turn.get('answer')}\n"
                f"Score: {evaluation.get('score', 5)}\n"
                f"Feedback: {evaluation.get('feedback', '')}"
            )
        )
    return "\n\n".join(lines)


async def _generate_question(
    *,
    role: str,
    difficulty: str,
    interviewer: dict[str, str],
    turns: list[dict[str, Any]],
    current_turn: int,
    total_turns: int,
) -> str:
    track = interviewer["track"]
    system_prompt = (
        "You are an expert interviewer in a 3-person group interview panel. "
        "You must return JSON only and no markdown."
    )
    user_prompt = (
        "Generate exactly one question for the candidate.\n"
        f"Candidate target role: {role}\n"
        f"Difficulty: {difficulty}\n"
        f"Interviewer name: {interviewer['name']}\n"
        f"Interviewer track: {track}\n"
        f"Current turn: {current_turn}/{total_turns}\n"
        "Rules:\n"
        "1) Track technical: ask coding/system/debugging questions only.\n"
        "2) Track hr: ask behavioral/communication/culture questions only.\n"
        "3) Track mixed: combine both technical and behavioral dimensions.\n"
        "4) Avoid repeating recent topics.\n"
        "5) Keep question concise and interview-ready.\n"
        f"Recent context:\n{_format_context(turns)}\n\n"
        'Return JSON object: {"question": "string"}'
    )

    try:
        payload = await invoke_llm_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.55,
        )
        question = str(payload.get("question") or "").strip()
        if question:
            return question
    except Exception:
        logger.exception(
            "Failed to generate group interview question via LLM",
            extra={"track": track, "turn": current_turn},
        )

    if track == "technical":
        return "Walk me through how you would debug a production latency spike in a microservices backend."
    if track == "hr":
        return "Tell me about a time you handled conflict in a team and what outcome you drove."
    return "Describe a project trade-off where technical constraints impacted stakeholder expectations and how you handled both sides."


async def _evaluate_answer(
    *,
    role: str,
    difficulty: str,
    interviewer: dict[str, str],
    question: str,
    answer: str,
    turns: list[dict[str, Any]],
) -> dict[str, Any]:
    system_prompt = (
        "You are an expert interview evaluator. Return strict JSON only."
    )
    user_prompt = (
        "Evaluate the candidate answer.\n"
        f"Role: {role}\n"
        f"Difficulty: {difficulty}\n"
        f"Interviewer track: {interviewer['track']}\n"
        f"Question: {question}\n"
        f"Answer: {answer}\n"
        f"Recent context:\n{_format_context(turns)}\n\n"
        "Scoring 1-10 where 10 is excellent.\n"
        'Return JSON: {"score": 1-10, "feedback": "string", "strengths": ["string"], "weaknesses": ["string"]}'
    )

    try:
        payload = await invoke_llm_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.2,
        )
        score = int(payload.get("score", 5))
        return {
            "score": max(1, min(10, score)),
            "feedback": str(payload.get("feedback") or "Good effort. Keep improving structure and clarity.").strip(),
            "strengths": [str(item) for item in (payload.get("strengths") or []) if str(item).strip()][:4],
            "weaknesses": [str(item) for item in (payload.get("weaknesses") or []) if str(item).strip()][:4],
        }
    except Exception:
        logger.exception("Failed to evaluate group interview answer via LLM")
        return {
            "score": 6,
            "feedback": "Answer received. Add more structure, metrics, and clearer ownership signals.",
            "strengths": ["You addressed the prompt and stayed on-topic."],
            "weaknesses": ["Use more concrete examples and measurable outcomes."],
        }


def _summarize_result(turns: list[dict[str, Any]]) -> dict[str, Any]:
    if not turns:
        return {
            "overall_score": 1,
            "summary": "No responses were recorded.",
            "strengths": [],
            "weaknesses": ["Please answer interviewer questions to generate feedback."],
        }

    scores = [int((turn.get("evaluation") or {}).get("score", 5)) for turn in turns]
    avg = sum(scores) / len(scores)
    overall = max(1, min(100, round(avg * 10)))

    strengths: list[str] = []
    weaknesses: list[str] = []
    for turn in turns:
        evaluation = turn.get("evaluation") or {}
        strengths.extend(evaluation.get("strengths") or [])
        weaknesses.extend(evaluation.get("weaknesses") or [])

    dedup_strengths = list(dict.fromkeys([str(s) for s in strengths if str(s).strip()]))[:4]
    dedup_weaknesses = list(dict.fromkeys([str(w) for w in weaknesses if str(w).strip()]))[:4]

    summary = (
        f"You completed {len(turns)} panel turns. "
        f"Overall performance score is {overall}/100 with strongest outcomes in contextual relevance."
    )

    return {
        "overall_score": overall,
        "summary": summary,
        "strengths": dedup_strengths,
        "weaknesses": dedup_weaknesses,
    }


async def start_group_interview(
    db: AsyncIOMotorDatabase,
    user_id: str,
    role: str,
    difficulty: str,
) -> dict[str, Any]:
    total_turns = _total_turns()
    first_interviewer = _next_interviewer(0)

    question = await _generate_question(
        role=role,
        difficulty=difficulty,
        interviewer=first_interviewer,
        turns=[],
        current_turn=1,
        total_turns=total_turns,
    )
    question_audio = await synthesize_text_to_data_uri(question)

    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user_id,
        "role": role,
        "difficulty": difficulty,
        "status": "ongoing",
        "total_turns": total_turns,
        "current_turn": 1,
        "active_interviewer": first_interviewer,
        "current_question": question,
        "turns": [],
        "result": None,
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
    }

    collection = get_group_interviews_collection(db)
    created = await collection.insert_one(doc)
    logger.info(
        "Started group interview",
        extra={"session_id": str(created.inserted_id), "user_id": user_id, "role": role, "difficulty": difficulty},
    )

    return {
        "session_id": str(created.inserted_id),
        "status": "ongoing",
        "interviewers": INTERVIEWERS,
        "question": {
            "interviewer_id": first_interviewer["id"],
            "interviewer_name": first_interviewer["name"],
            "interviewer_track": first_interviewer["track"],
            "question": question,
            "audio_data_uri": question_audio,
        },
        "progress": {"current_turn": 1, "total_turns": total_turns},
    }


async def submit_group_interview_answer(
    db: AsyncIOMotorDatabase,
    user_id: str,
    session_id: str,
    answer_text: str | None,
    audio_base64: str | None,
    audio_mime_type: str | None,
) -> dict[str, Any]:
    oid = _parse_object_id(session_id, "session_id")
    collection = get_group_interviews_collection(db)
    session = await collection.find_one({"_id": oid})

    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group interview session not found")

    if session["user_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not allowed to access this session")

    if session["status"] == "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group interview already completed")

    transcript = (answer_text or "").strip()
    if not transcript and audio_base64:
        transcript = (await transcribe_audio_base64(audio_base64, audio_mime_type)).strip()

    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transcript is empty. Speak clearly for longer, or submit text response.",
        )

    active_interviewer = session.get("active_interviewer") or _next_interviewer((session.get("current_turn", 1) - 1))
    question = str(session.get("current_question") or "").strip()
    turns = list(session.get("turns") or [])

    evaluation = await _evaluate_answer(
        role=session.get("role", ""),
        difficulty=session.get("difficulty", ""),
        interviewer=active_interviewer,
        question=question,
        answer=transcript,
        turns=turns,
    )

    now = datetime.now(timezone.utc)
    turn_doc = {
        "interviewer_id": active_interviewer["id"],
        "interviewer_name": active_interviewer["name"],
        "interviewer_track": active_interviewer["track"],
        "question": question,
        "answer": transcript,
        "evaluation": evaluation,
        "created_at": now,
    }
    turns.append(turn_doc)

    next_question_payload: dict[str, Any] | None = None
    status_value = "ongoing"

    current_turn = int(session.get("current_turn", 1))
    total_turns = int(session.get("total_turns", _total_turns()))

    update_set: dict[str, Any] = {
        "turns": turns,
        "updated_at": now,
    }

    if current_turn >= total_turns:
        result = _summarize_result(turns)
        status_value = "completed"
        update_set.update(
            {
                "status": "completed",
                "completed_at": now,
                "result": result,
                "current_turn": current_turn,
            }
        )
    else:
        next_turn = current_turn + 1
        interviewer = _next_interviewer(next_turn - 1)
        next_question = await _generate_question(
            role=session.get("role", ""),
            difficulty=session.get("difficulty", ""),
            interviewer=interviewer,
            turns=turns,
            current_turn=next_turn,
            total_turns=total_turns,
        )
        next_audio = await synthesize_text_to_data_uri(next_question)
        update_set.update(
            {
                "current_turn": next_turn,
                "active_interviewer": interviewer,
                "current_question": next_question,
            }
        )
        next_question_payload = {
            "interviewer_id": interviewer["id"],
            "interviewer_name": interviewer["name"],
            "interviewer_track": interviewer["track"],
            "question": next_question,
            "audio_data_uri": next_audio,
        }

    await collection.update_one({"_id": oid}, {"$set": update_set})

    return {
        "session_id": session_id,
        "status": status_value,
        "transcript": transcript,
        "evaluation": evaluation,
        "next_question": next_question_payload,
        "progress": {
            "current_turn": min(current_turn + (1 if status_value == "ongoing" else 0), total_turns),
            "total_turns": total_turns,
        },
    }


async def get_group_interview_result(
    db: AsyncIOMotorDatabase,
    user_id: str,
    session_id: str,
) -> dict[str, Any]:
    oid = _parse_object_id(session_id, "session_id")
    collection = get_group_interviews_collection(db)
    session = await collection.find_one({"_id": oid})

    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group interview session not found")

    if session["user_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not allowed to access this session")

    turns = list(session.get("turns") or [])
    result = session.get("result") or _summarize_result(turns)

    return {
        "session_id": session_id,
        "status": session.get("status", "ongoing"),
        "progress": {
            "current_turn": int(session.get("current_turn", 1)),
            "total_turns": int(session.get("total_turns", _total_turns())),
        },
        "turns": turns,
        "result": result,
    }
