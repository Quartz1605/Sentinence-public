"""
Pydantic schemas for Team Fit meeting simulation endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


SessionStatus = Literal["ongoing", "completed"]


class MeetingScenarioOut(BaseModel):
    id: str
    title: str
    description: str


class TeamMateOut(BaseModel):
    name: str
    role: str


class TeamFitQuestionOut(BaseModel):
    speaker: str
    question: str
    intent: str
    audio_data_uri: str | None = None
    suggested_delay_ms: int | None = None


class MeetingProgressOut(BaseModel):
    answered: int
    total: int


class StartTeamMeetingRequest(BaseModel):
    scenario_id: str = Field(min_length=1)
    custom_context: str | None = None


class MeetingEvaluationOut(BaseModel):
    score: float = Field(ge=0.0, le=10.0)
    feedback: str
    clarity: float = Field(ge=0.0, le=10.0)
    technical_reasoning: float = Field(ge=0.0, le=10.0)
    confidence: float = Field(ge=0.0, le=10.0)
    relevance: float = Field(ge=0.0, le=10.0)
    strengths: list[str] = []
    improvements: list[str] = []


class StartTeamMeetingResponse(BaseModel):
    session_id: str
    status: SessionStatus
    scenario: dict[str, Any]
    participants: list[TeamMateOut]
    question: TeamFitQuestionOut
    progress: MeetingProgressOut


class RespondMeetingRequest(BaseModel):
    session_id: str = Field(min_length=1)
    answer_text: str | None = None
    audio_base64: str | None = None
    audio_mime_type: str | None = None


class RespondMeetingResponse(BaseModel):
    session_id: str
    status: SessionStatus
    transcript: str
    evaluation: MeetingEvaluationOut
    next_question: TeamFitQuestionOut | None = None
    progress: MeetingProgressOut
    interruption: TeamFitQuestionOut | None = None


class ConversationTurnOut(BaseModel):
    question_index: int
    speaker: str
    question: str
    intent: str
    answer_text: str
    evaluation: MeetingEvaluationOut
    created_at: datetime


class MeetingResultOut(BaseModel):
    score: float = Field(ge=0.0, le=10.0)
    feedback: str
    dimension_scores: dict[str, float]
    strengths: list[str]
    improvements: list[str]
    summary: str


class MeetingResultResponse(BaseModel):
    session_id: str
    status: SessionStatus
    progress: MeetingProgressOut
    result: MeetingResultOut
    conversation_history: list[ConversationTurnOut]
