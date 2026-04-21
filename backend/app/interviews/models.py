from datetime import datetime, timezone
from typing import Any

from bson import ObjectId


def build_interview_document(
    *,
    user_id: str,
    role: str,
    difficulty: str,
    persona: str,
    current_question: str,
    max_questions: int,
    questions_bank: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "role": role,
        "difficulty": difficulty,
        "persona": persona,
        "current_question": current_question,
        "current_question_index": 0,
        "max_questions": max_questions,
        "questions_bank": questions_bank or [],
        "last_score": None,
        "status": "ongoing",
        "created_at": datetime.now(timezone.utc),
    }


def build_response_document(
    *,
    interview_id: ObjectId,
    user_id: str,
    question: str,
    answer: str,
    evaluation: dict[str, Any],
    contradiction_analysis: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "interview_id": interview_id,
        "user_id": user_id,
        "question": question,
        "answer": answer,
        "score": evaluation.get("score"),
        "feedback": evaluation.get("feedback"),
        "strengths": evaluation.get("strengths", []),
        "weaknesses": evaluation.get("weaknesses", []),
        "contradiction_analysis": contradiction_analysis,
        "created_at": datetime.now(timezone.utc),
    }
