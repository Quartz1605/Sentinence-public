"""
Service layer for meeting room session CRUD.
"""

from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.meeting_room.models import build_session_document, build_message_document
from app.meeting_room.scenarios import SCENARIOS
from app.meeting_room.types import ParticipantConfig
from app.meeting_room.meeting_engine import ensure_teamfit_indexes


def get_sessions_collection(db: AsyncIOMotorDatabase) -> AsyncIOMotorCollection:
    return db["meeting_sessions"]


async def ensure_meeting_indexes(db: AsyncIOMotorDatabase) -> None:
    sessions = get_sessions_collection(db)
    await sessions.create_index("user_id", name="idx_meeting_sessions_user_id")
    await sessions.create_index(
        [("user_id", 1), ("status", 1)],
        name="idx_meeting_sessions_user_status",
    )
    await ensure_teamfit_indexes(db)


def _parse_object_id(raw_id: str, *, field_name: str) -> ObjectId:
    try:
        return ObjectId(raw_id)
    except InvalidId as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name}",
        ) from exc


# ── Start session ────────────────────────────────────────────────────

async def start_session(
    db: AsyncIOMotorDatabase,
    scenario_id: str,
    user_id: str,
) -> dict[str, Any]:
    scenario = SCENARIOS.get(scenario_id)
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown scenario: {scenario_id}",
        )

    sessions = get_sessions_collection(db)

    doc = build_session_document(
        user_id=user_id,
        scenario_id=scenario.id,
        scenario_title=scenario.title,
        scenario_description=scenario.description,
        scenario_problem_statement=scenario.problem_statement,
        scenario_duration_sec=scenario.duration_sec,
        participants=scenario.participants,
    )
    created = await sessions.insert_one(doc)

    return {
        "session_id": str(created.inserted_id),
        "scenario": {
            "id": scenario.id,
            "title": scenario.title,
            "description": scenario.description,
            "problem_statement": scenario.problem_statement,
            "duration_sec": scenario.duration_sec,
        },
        "participants": [p.model_dump() for p in scenario.participants],
    }


# ── Get session ──────────────────────────────────────────────────────

async def get_session(
    db: AsyncIOMotorDatabase,
    session_id_raw: str,
    user_id: str,
) -> dict[str, Any]:
    session_id = _parse_object_id(session_id_raw, field_name="session_id")
    sessions = get_sessions_collection(db)

    session = await sessions.find_one({"_id": session_id})
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    if session["user_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to access this session",
        )

    return {
        "session_id": str(session["_id"]),
        "user_id": session["user_id"],
        "scenario": {
            "id": session["scenario_id"],
            "title": session["scenario_title"],
            "description": session["scenario_description"],
            "problem_statement": session["scenario_problem_statement"],
            "duration_sec": session["scenario_duration_sec"],
        },
        "participants": session["participants"],
        "status": session["status"],
        "messages": session.get("messages", []),
        "metrics_snapshots": session.get("metrics_snapshots", []),
        "interruptions": session.get("interruptions", 0),
        "started_at": session["started_at"],
        "ended_at": session.get("ended_at"),
    }


# ── Append message ───────────────────────────────────────────────────

async def append_message(
    db: AsyncIOMotorDatabase,
    session_id: ObjectId,
    *,
    sender_id: str,
    sender_name: str,
    sender_role: str,
    text: str,
) -> dict[str, Any]:
    sessions = get_sessions_collection(db)
    msg = build_message_document(
        sender_id=sender_id,
        sender_name=sender_name,
        sender_role=sender_role,
        text=text,
    )

    await sessions.update_one(
        {"_id": session_id},
        {"$push": {"messages": msg}},
    )
    return msg


# ── Append metrics snapshot ──────────────────────────────────────────

async def append_metrics(
    db: AsyncIOMotorDatabase,
    session_id: ObjectId,
    snapshot: dict[str, Any],
) -> None:
    sessions = get_sessions_collection(db)
    await sessions.update_one(
        {"_id": session_id},
        {"$push": {"metrics_snapshots": snapshot}},
    )


# ── Increment interruptions ─────────────────────────────────────────

async def increment_interruptions(
    db: AsyncIOMotorDatabase,
    session_id: ObjectId,
) -> None:
    sessions = get_sessions_collection(db)
    await sessions.update_one(
        {"_id": session_id},
        {"$inc": {"interruptions": 1}},
    )


# ── End session ──────────────────────────────────────────────────────

async def end_session(
    db: AsyncIOMotorDatabase,
    session_id: ObjectId,
    report: dict[str, Any],
) -> None:
    from datetime import datetime, timezone

    sessions = get_sessions_collection(db)
    await sessions.update_one(
        {"_id": session_id},
        {
            "$set": {
                "status": "completed",
                "ended_at": datetime.now(timezone.utc),
                "final_report": report,
            }
        },
    )


# ── Get final report ────────────────────────────────────────────────

async def get_report(
    db: AsyncIOMotorDatabase,
    session_id_raw: str,
    user_id: str,
) -> dict[str, Any]:
    session_id = _parse_object_id(session_id_raw, field_name="session_id")
    sessions = get_sessions_collection(db)

    session = await sessions.find_one({"_id": session_id})
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    if session["user_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to access this session",
        )

    report = session.get("final_report")
    if not report:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session has not been completed yet",
        )

    return {
        "session_id": str(session["_id"]),
        "report": report,
    }
