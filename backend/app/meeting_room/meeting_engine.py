"""
Meeting engine for turn-based Team Fit interview simulations.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone
from typing import Any
import logging

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.meeting_room.evaluation_engine import aggregate_session_result, evaluate_response
from app.meeting_room.scenario_manager import (
    build_participants,
    build_question_flow,
    build_scenario_payload,
    list_scenarios,
)
from app.meeting_room.speech_service import synthesize_text_to_data_uri, transcribe_audio_base64


logger = logging.getLogger(__name__)


def get_teamfit_sessions_collection(db: AsyncIOMotorDatabase) -> AsyncIOMotorCollection:
    return db["meeting_room_sessions"]


async def ensure_teamfit_indexes(db: AsyncIOMotorDatabase) -> None:
    sessions = get_teamfit_sessions_collection(db)
    await sessions.create_index("user_id", name="idx_teamfit_sessions_user_id")
    await sessions.create_index(
        [("user_id", 1), ("status", 1)],
        name="idx_teamfit_sessions_user_status",
    )


def _parse_object_id(raw_id: str) -> ObjectId:
    try:
        return ObjectId(raw_id)
    except InvalidId as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id",
        ) from exc


def _serialize_question(question: dict[str, Any], audio_data_uri: str | None = None) -> dict[str, Any]:
    payload = {
        "speaker": question["speaker"],
        "question": question["question"],
        "intent": question["intent"],
        "audio_data_uri": audio_data_uri,
        "suggested_delay_ms": random.randint(900, 1700),
    }
    return payload


def _build_interruption(question: dict[str, Any], participants: list[dict[str, str]]) -> dict[str, Any] | None:
    # Optional realism: occasional teammate interruption while transitioning turns.
    if random.random() > 0.22:
        return None

    candidates = [p for p in participants if p["name"] != question["speaker"]]
    if not candidates:
        return None

    interrupter = random.choice(candidates)
    return {
        "speaker": interrupter["name"],
        "question": "Quick follow-up before we move on: who owns the immediate next action?",
        "intent": "interruption",
        "audio_data_uri": None,
        "suggested_delay_ms": random.randint(500, 900),
    }


async def get_available_scenarios() -> list[dict[str, str]]:
    return list_scenarios()


async def start_teamfit_session(
    db: AsyncIOMotorDatabase,
    user_id: str,
    scenario_id: str,
    custom_context: str | None = None,
) -> dict[str, Any]:
    logger.info(
        "Starting team-fit meeting session",
        extra={"user_id": user_id, "scenario_id": scenario_id, "has_custom_context": bool((custom_context or "").strip())},
    )
    scenario = build_scenario_payload(scenario_id, custom_context)
    participants = build_participants()
    question_flow = build_question_flow(scenario_id, custom_context)

    if not question_flow:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Scenario question flow is empty",
        )

    first_question = question_flow[0]
    first_question_audio = await synthesize_text_to_data_uri(first_question["question"])

    now = datetime.now(timezone.utc)
    session_doc = {
        "user_id": user_id,
        "scenario": scenario,
        "participants": participants,
        "questions": question_flow,
        "current_question_index": 0,
        "conversation_log": [],
        "status": "ongoing",
        "final_result": None,
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
    }

    sessions = get_teamfit_sessions_collection(db)
    created = await sessions.insert_one(session_doc)

    return {
        "session_id": str(created.inserted_id),
        "status": "ongoing",
        "scenario": scenario,
        "participants": participants,
        "question": _serialize_question(first_question, first_question_audio),
        "progress": {
            "answered": 0,
            "total": len(question_flow),
        },
    }


async def respond_teamfit_session(
    db: AsyncIOMotorDatabase,
    user_id: str,
    session_id: str,
    answer_text: str | None = None,
    audio_base64: str | None = None,
    audio_mime_type: str | None = None,
) -> dict[str, Any]:
    logger.info(
        "Received team-fit response",
        extra={
            "user_id": user_id,
            "session_id": session_id,
            "has_answer_text": bool((answer_text or "").strip()),
            "has_audio": bool((audio_base64 or "").strip()),
        },
    )
    oid = _parse_object_id(session_id)
    sessions = get_teamfit_sessions_collection(db)

    session = await sessions.find_one({"_id": oid})
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if session["user_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not allowed to access this session")

    if session["status"] == "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session is already completed")

    questions = session.get("questions", [])
    idx = int(session.get("current_question_index", 0))
    if idx >= len(questions):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No remaining questions")

    transcript = (answer_text or "").strip()
    if not transcript and audio_base64:
        transcript = (await transcribe_audio_base64(audio_base64, audio_mime_type)).strip()

    if not transcript:
        logger.warning(
            "Team-fit response rejected due to empty transcript",
            extra={
                "user_id": user_id,
                "session_id": session_id,
                "audio_mime_type": audio_mime_type,
                "audio_length": len(audio_base64 or ""),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transcript is empty. Use live transcription text, or provide clearer/longer audio before submitting.",
        )

    active_question = questions[idx]
    evaluation = await evaluate_response(
        question=active_question["question"],
        intent=active_question["intent"],
        answer=transcript,
    )
    logger.info(
        "Team-fit response evaluated",
        extra={"user_id": user_id, "session_id": session_id, "score": evaluation.get("score")},
    )

    now = datetime.now(timezone.utc)
    turn = {
        "question_index": idx,
        "speaker": active_question["speaker"],
        "question": active_question["question"],
        "intent": active_question["intent"],
        "answer_text": transcript,
        "evaluation": evaluation,
        "created_at": now,
    }

    previous_turns = session.get("conversation_log", [])
    next_index = idx + 1
    turns = previous_turns + [turn]

    update_payload: dict[str, Any] = {
        "$push": {"conversation_log": turn},
        "$set": {
            "updated_at": now,
        },
    }

    status_value = "ongoing"
    next_question_payload = None
    interruption = None

    if next_index >= len(questions):
        final_result = aggregate_session_result(turns)
        update_payload["$set"].update(
            {
                "status": "completed",
                "current_question_index": len(questions),
                "completed_at": now,
                "final_result": final_result,
            }
        )
        status_value = "completed"
    else:
        update_payload["$set"]["current_question_index"] = next_index
        next_question = questions[next_index]
        next_audio = await synthesize_text_to_data_uri(next_question["question"])
        next_question_payload = _serialize_question(next_question, next_audio)
        interruption = _build_interruption(next_question, session.get("participants", []))

    await sessions.update_one({"_id": oid}, update_payload)

    return {
        "session_id": session_id,
        "status": status_value,
        "transcript": transcript,
        "evaluation": evaluation,
        "next_question": next_question_payload,
        "progress": {
            "answered": len(turns),
            "total": len(questions),
        },
        "interruption": interruption,
    }


async def get_teamfit_result(
    db: AsyncIOMotorDatabase,
    user_id: str,
    session_id: str,
) -> dict[str, Any]:
    logger.info(
        "Fetching team-fit result",
        extra={"user_id": user_id, "session_id": session_id},
    )
    oid = _parse_object_id(session_id)
    sessions = get_teamfit_sessions_collection(db)

    session = await sessions.find_one({"_id": oid})
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if session["user_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not allowed to access this session")

    turns = session.get("conversation_log", [])
    result = session.get("final_result")
    if not result:
        result = aggregate_session_result(turns)

    questions = session.get("questions", [])
    return {
        "session_id": session_id,
        "status": session.get("status", "ongoing"),
        "progress": {
            "answered": len(turns),
            "total": len(questions),
        },
        "result": result,
        "conversation_history": turns,
    }
