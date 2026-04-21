"""
MongoDB document builders for meeting room sessions.
"""

from datetime import datetime, timezone
from typing import Any

from app.meeting_room.types import ParticipantConfig


def build_session_document(
    *,
    user_id: str,
    scenario_id: str,
    scenario_title: str,
    scenario_description: str,
    scenario_problem_statement: str,
    scenario_duration_sec: int,
    participants: list[ParticipantConfig],
) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "scenario_id": scenario_id,
        "scenario_title": scenario_title,
        "scenario_description": scenario_description,
        "scenario_problem_statement": scenario_problem_statement,
        "scenario_duration_sec": scenario_duration_sec,
        "participants": [p.model_dump() for p in participants],
        "status": "ongoing",
        "messages": [],
        "metrics_snapshots": [],
        "interruptions": 0,
        "speaking_time_sec": {},
        "final_report": None,
        "started_at": datetime.now(timezone.utc),
        "ended_at": None,
    }


def build_message_document(
    *,
    sender_id: str,
    sender_name: str,
    sender_role: str,
    text: str,
) -> dict[str, Any]:
    import uuid
    return {
        "id": str(uuid.uuid4()),
        "sender_id": sender_id,
        "sender_name": sender_name,
        "sender_role": sender_role,
        "text": text,
        "timestamp": datetime.now(timezone.utc).timestamp(),
    }
