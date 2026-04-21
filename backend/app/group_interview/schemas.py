from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


SessionStatus = Literal["ongoing", "completed"]
InterviewerTrack = Literal["technical", "hr", "mixed"]


class StartGroupInterviewRequest(BaseModel):
    role: str = Field(min_length=1)
    difficulty: str = Field(min_length=1)


class InterviewerOut(BaseModel):
    id: str
    name: str
    track: InterviewerTrack


class QuestionOut(BaseModel):
    interviewer_id: str
    interviewer_name: str
    interviewer_track: InterviewerTrack
    question: str
    audio_data_uri: str | None = None


class ProgressOut(BaseModel):
    current_turn: int
    total_turns: int


class StartGroupInterviewResponse(BaseModel):
    session_id: str
    status: SessionStatus
    interviewers: list[InterviewerOut]
    question: QuestionOut
    progress: ProgressOut


class SubmitGroupInterviewAnswerRequest(BaseModel):
    session_id: str = Field(min_length=1)
    answer_text: str | None = None
    audio_base64: str | None = None
    audio_mime_type: str | None = None


class TurnEvaluationOut(BaseModel):
    score: int = Field(ge=1, le=10)
    feedback: str
    strengths: list[str]
    weaknesses: list[str]


class SubmitGroupInterviewAnswerResponse(BaseModel):
    session_id: str
    status: SessionStatus
    transcript: str
    evaluation: TurnEvaluationOut
    next_question: QuestionOut | None = None
    progress: ProgressOut


class TurnOut(BaseModel):
    interviewer_id: str
    interviewer_name: str
    interviewer_track: InterviewerTrack
    question: str
    answer: str
    evaluation: TurnEvaluationOut
    created_at: datetime


class GroupInterviewResultOut(BaseModel):
    overall_score: int = Field(ge=1, le=100)
    summary: str
    strengths: list[str]
    weaknesses: list[str]


class GroupInterviewResultResponse(BaseModel):
    session_id: str
    status: SessionStatus
    progress: ProgressOut
    turns: list[TurnOut]
    result: GroupInterviewResultOut | None = None
