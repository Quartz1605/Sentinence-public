"""
Pydantic schemas for meeting room HTTP requests and responses.
"""

from datetime import datetime
from typing import Literal, Any

from pydantic import BaseModel, Field

from app.meeting_room.types import ParticipantConfig


# ── Request schemas ──────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    scenario_id: str = Field(default="crisis-36h", min_length=1)


# ── Response schemas ─────────────────────────────────────────────────

class ScenarioOut(BaseModel):
    id: str
    title: str
    description: str
    problem_statement: str
    duration_sec: int


class StartSessionResponse(BaseModel):
    session_id: str
    scenario: ScenarioOut
    participants: list[ParticipantConfig]


SessionStatus = Literal["ongoing", "completed"]


class MessageOut(BaseModel):
    id: str
    sender_id: str
    sender_name: str
    sender_role: str
    text: str
    timestamp: float


class MetricsSnapshotOut(BaseModel):
    elapsed_sec: int
    confidence: float
    helpfulness: float
    engagement: float


class SessionDetailResponse(BaseModel):
    session_id: str
    user_id: str
    scenario: ScenarioOut
    participants: list[ParticipantConfig]
    status: SessionStatus
    messages: list[MessageOut]
    metrics_snapshots: list[MetricsSnapshotOut]
    interruptions: int
    started_at: datetime
    ended_at: datetime | None = None


class FeedbackReportOut(BaseModel):
    overall_score: int
    strengths: list[str]
    weaknesses: list[str]
    summary: str


class EndSessionResponse(BaseModel):
    session_id: str
    status: SessionStatus
    report: FeedbackReportOut


class SessionReportResponse(BaseModel):
    session_id: str
    report: FeedbackReportOut
