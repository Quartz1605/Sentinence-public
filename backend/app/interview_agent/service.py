import logging
import os
from typing import Any
from uuid import uuid4

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.interview_agent.graph import interview_agent_graph
from app.interview_agent.llm import invoke_llm_json
from app.interview_agent.prompts import (
    QUESTION_BANK_SYSTEM_PROMPT,
    EVALUATION_SYSTEM_PROMPT,
    build_question_bank_prompt,
    build_evaluation_prompt,
)
from app.interview_agent.schemas import InterviewAgentState, ResumeContext


logger = logging.getLogger(__name__)


def _normalize_string_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return [str(item).strip() for item in values if str(item).strip()]


def _normalize_question_key(question: str) -> str:
    return " ".join(question.strip().lower().split())


def _format_recent_history(history: list[dict[str, Any]]) -> str:
    if not history:
        return "No prior turns."

    parts: list[str] = []
    for idx, item in enumerate(history[-5:], start=1):
        parts.append(
            (
                f"Turn {idx}:\n"
                f"Question: {item.get('question', '')}\n"
                f"Answer: {item.get('answer', '')}\n"
                f"Score: {item.get('score', 'N/A')}\n"
                f"Feedback: {item.get('feedback', '')}"
            )
        )
    return "\n\n".join(parts)


async def generate_devils_advocate_challenge_question(
    *,
    role: str,
    difficulty: str,
    last_question: str,
    last_answer: str,
    history: list[dict[str, Any]],
    trigger_reasons: list[str],
) -> str:
    """Generate a targeted pressure-test follow-up for Devil's Advocate persona."""
    logger.info(
        "Generating Devil's Advocate challenge question",
        extra={
            "role": role,
            "difficulty": difficulty,
            "trigger_reasons": trigger_reasons,
        },
    )

    system_prompt = (
        "You are a Devil's Advocate interviewer. "
        "Challenge weak logic professionally and force precise technical defense. "
        "Return strict JSON only."
    )
    user_prompt = (
        "Generate exactly one high-pressure follow-up question.\n"
        "Goal: test emotional stability, recovery speed, and ability to defend technical logic under pressure.\n"
        "Rules:\n"
        "1) Challenge assumptions from the candidate's latest answer.\n"
        "2) Ask for concrete trade-offs, evidence, and fallback plan.\n"
        "3) Keep wording professional; no insults or personal attacks.\n"
        "4) Keep the question concise and interview-ready.\n"
        "5) Do not repeat the prior question wording.\n\n"
        f"Role: {role}\n"
        f"Difficulty: {difficulty}\n"
        f"Trigger reasons: {', '.join(trigger_reasons) if trigger_reasons else 'uncertainty detected'}\n"
        f"Latest question: {last_question}\n"
        f"Latest answer: {last_answer}\n"
        f"Recent history:\n{_format_recent_history(history)}\n\n"
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
        logger.exception("Failed to generate Devil's Advocate challenge question")

    return (
        "You sounded uncertain in parts of your answer. Defend your approach with concrete trade-offs, "
        "state the first recovery step you would execute, and explain how you would verify it worked."
    )


async def _load_resume_context(db: AsyncIOMotorDatabase, user_id: str) -> ResumeContext:
    logger.info("Loading resume context", extra={"user_id": user_id})
    doc = await db["resumes"].find_one({"user_id": user_id}, sort=[("created_at", -1)])
    if not doc:
        logger.warning("No resume context found for user", extra={"user_id": user_id})
        return {
            "skills": [],
            "projects": [],
            "raw_text": "",
        }

    parsed = doc.get("parsed_resume") or {}
    skills = _normalize_string_list(parsed.get("skills"))

    projects: list[str] = []
    experience = parsed.get("experience")
    if isinstance(experience, list):
        for item in experience:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "").strip()
            description = str(item.get("description") or "").strip()
            if role and description:
                projects.append(f"{role}: {description}")
            elif description:
                projects.append(description)

    raw_text = str(doc.get("raw_text") or "").strip()
    if not raw_text:
        summary = str(parsed.get("summary") or "").strip()
        education = ", ".join(_normalize_string_list(parsed.get("education")))
        fallback_parts = [summary, education, " ".join(projects)]
        raw_text = "\n".join(part for part in fallback_parts if part)

    result = {
        "skills": skills,
        "projects": projects,
        "raw_text": raw_text,
    }
    logger.info(
        "Loaded resume context",
        extra={"user_id": user_id, "skills": len(skills), "projects": len(projects), "raw_text_length": len(raw_text)},
    )
    return result


async def _load_recent_history(
    db: AsyncIOMotorDatabase,
    interview_id: ObjectId,
    *,
    limit: int,
) -> list[dict[str, Any]]:
    logger.info("Loading recent interview history", extra={"interview_id": str(interview_id), "limit": limit})
    docs = await (
        db["responses"]
        .find({"interview_id": interview_id})
        .sort("created_at", -1)
        .to_list(length=limit)
    )
    docs.reverse()

    history: list[dict[str, Any]] = []
    for doc in docs:
        history.append(
            {
                "question": str(doc.get("question") or ""),
                "answer": str(doc.get("answer") or ""),
                "score": int(doc.get("score") or 5),
                "feedback": str(doc.get("feedback") or ""),
                "strengths": _normalize_string_list(doc.get("strengths") or []),
                "weaknesses": _normalize_string_list(doc.get("weaknesses") or []),
            }
        )
    logger.info("Loaded interview history", extra={"interview_id": str(interview_id), "history_count": len(history)})
    return history


def get_max_questions() -> int:
    raw = os.getenv("INTERVIEW_MAX_QUESTIONS", "25")
    try:
        value = int(raw)
    except ValueError:
        value = 25
    max_questions = max(1, min(30, value))
    logger.info("Resolved max questions", extra={"max_questions": max_questions})
    return max_questions


async def generate_question_bank(
    *,
    db: AsyncIOMotorDatabase,
    user_id: str,
    role: str,
    difficulty: str,
    persona: str,
    max_questions: int,
) -> list[str]:
    """Generate all interview questions upfront in a single LLM call."""
    logger.info(
        "Generating question bank",
        extra={"user_id": user_id, "role": role, "difficulty": difficulty, "max_questions": max_questions},
    )
    resume = await _load_resume_context(db, user_id)
    variation_token = uuid4().hex[:10]

    payload = await invoke_llm_json(
        system_prompt=QUESTION_BANK_SYSTEM_PROMPT,
        user_prompt=build_question_bank_prompt(
            role=role,
            difficulty=difficulty,
            persona=persona,
            resume=resume,
            max_questions=max_questions,
            variation_token=variation_token,
        ),
        temperature=0.65,
    )

    questions = payload.get("questions")
    if not isinstance(questions, list) or len(questions) == 0:
        logger.error("Question bank generation returned invalid payload", extra={"payload": payload})
        raise ValueError("Question bank generation failed: no questions returned")

    # Ensure all items are non-empty unique strings
    cleaned: list[str] = []
    seen_keys: set[str] = set()
    for q in questions:
        text = str(q).strip()
        key = _normalize_question_key(text)
        if text and key not in seen_keys:
            seen_keys.add(key)
            cleaned.append(text)

    intro_question = "Introduce yourself and summarize your background relevant to this role."
    intro_key = _normalize_question_key(intro_question)

    if cleaned:
        if _normalize_question_key(cleaned[0]) != intro_key:
            cleaned = [intro_question] + [q for q in cleaned if _normalize_question_key(q) != intro_key]
    else:
        cleaned = [intro_question]
    seen_keys.add(intro_key)

    # Pad with fallback questions if LLM returned fewer than requested
    fallback_idx = 1
    while len(cleaned) < max_questions:
        fallback = f"Tell me more about your experience relevant to the {role} role (follow-up {fallback_idx})."
        fallback_idx += 1
        fallback_key = _normalize_question_key(fallback)
        if fallback_key in seen_keys:
            continue
        seen_keys.add(fallback_key)
        cleaned.append(fallback)

    # Trim to exact count
    cleaned = cleaned[:max_questions]

    logger.info(
        "Question bank generated",
        extra={"user_id": user_id, "count": len(cleaned)},
    )
    return cleaned


async def generate_first_question(
    *,
    db: AsyncIOMotorDatabase,
    user_id: str,
    role: str,
    difficulty: str,
    persona: str,
    max_questions: int,
) -> dict[str, Any]:
    """Generate the full question bank and return the first question + bank."""
    logger.info(
        "Generating first interview question (via question bank)",
        extra={"user_id": user_id, "role": role, "difficulty": difficulty, "persona": persona, "max_questions": max_questions},
    )

    questions_bank = await generate_question_bank(
        db=db,
        user_id=user_id,
        role=role,
        difficulty=difficulty,
        persona=persona,
        max_questions=max_questions,
    )

    output = {
        "question": questions_bank[0],
        "difficulty": difficulty,
        "questions_bank": questions_bank,
    }
    logger.info(
        "First question generated from bank",
        extra={"question_length": len(output["question"]), "bank_size": len(questions_bank)},
    )
    return output


async def evaluate_answer_only(
    *,
    db: AsyncIOMotorDatabase,
    interview_id: ObjectId,
    user_id: str,
    role: str,
    difficulty: str,
    persona: str,
    question: str,
    answer: str,
) -> dict[str, Any]:
    """Evaluate an answer without generating a new question. Returns evaluation dict."""
    logger.info(
        "Evaluating answer only (no question generation)",
        extra={
            "interview_id": str(interview_id),
            "user_id": user_id,
            "role": role,
            "difficulty": difficulty,
            "answer_length": len(answer),
        },
    )

    history_limit = int(os.getenv("INTERVIEW_AGENT_HISTORY_LIMIT", "5"))
    history = await _load_recent_history(db, interview_id, limit=max(1, min(10, history_limit)))

    payload = await invoke_llm_json(
        system_prompt=EVALUATION_SYSTEM_PROMPT,
        user_prompt=build_evaluation_prompt(
            role=role,
            difficulty=difficulty,
            persona=persona,
            question=question,
            answer=answer,
            history=history,
        ),
        temperature=0.15,
    )

    score_raw = payload.get("score", 5)
    try:
        score = int(score_raw)
    except (TypeError, ValueError):
        logger.warning("Evaluation score was non-numeric; defaulting to 5", extra={"score_raw": score_raw})
        score = 5
    score = max(1, min(10, score))

    strengths = payload.get("strengths")
    weaknesses = payload.get("weaknesses")

    evaluation = {
        "score": score,
        "feedback": str(payload.get("feedback", "No feedback provided")).strip(),
        "strengths": [str(item) for item in strengths] if isinstance(strengths, list) else [],
        "weaknesses": [str(item) for item in weaknesses] if isinstance(weaknesses, list) else [],
    }

    logger.info(
        "Answer evaluation completed",
        extra={
            "interview_id": str(interview_id),
            "score": score,
            "strength_count": len(evaluation["strengths"]),
            "weakness_count": len(evaluation["weaknesses"]),
        },
    )

    return {"evaluation": evaluation}


async def evaluate_and_generate_next_question(
    *,
    db: AsyncIOMotorDatabase,
    interview_id: ObjectId,
    user_id: str,
    role: str,
    difficulty: str,
    persona: str,
    question: str,
    answer: str,
    max_questions: int,
    current_turn: int,
    last_score: int | None,
) -> dict[str, Any]:
    logger.info(
        "Evaluating answer and generating next question",
        extra={
            "interview_id": str(interview_id),
            "user_id": user_id,
            "role": role,
            "difficulty": difficulty,
            "current_turn": current_turn,
            "max_questions": max_questions,
            "answer_length": len(answer),
            "last_score": last_score,
        },
    )
    history_limit = int(os.getenv("INTERVIEW_AGENT_HISTORY_LIMIT", "5"))
    resume = await _load_resume_context(db, user_id)
    history = await _load_recent_history(db, interview_id, limit=max(1, min(10, history_limit)))
    variation_token = str(interview_id)

    state: InterviewAgentState = {
        "stage": "evaluate_and_generate_next",
        "variation_token": variation_token,
        "role": role,
        "difficulty": difficulty,
        "persona": persona,
        "resume": resume,
        "history": history,
        "max_questions": max_questions,
        "current_turn": current_turn,
        "last_question": question,
        "last_answer": answer,
        "last_score": last_score if last_score is not None else 5,
    }

    logger.info("Invoking interview graph for next question", extra={"interview_id": str(interview_id)})
    result = await interview_agent_graph.ainvoke(state)
    evaluation = result.get("evaluation") or {}

    output = {
        "evaluation": {
            "score": int(evaluation.get("score", 5)),
            "feedback": str(evaluation.get("feedback", "No feedback generated")),
            "strengths": _normalize_string_list(evaluation.get("strengths") or []),
            "weaknesses": _normalize_string_list(evaluation.get("weaknesses") or []),
        },
        "next_question": str(result.get("question", "")).strip(),
        "difficulty": str(result.get("generated_difficulty", difficulty)),
    }
    logger.info(
        "Generated evaluation and next question",
        extra={
            "interview_id": str(interview_id),
            "score": output["evaluation"]["score"],
            "next_question_length": len(output["next_question"]),
            "next_difficulty": output["difficulty"],
        },
    )
    return output
