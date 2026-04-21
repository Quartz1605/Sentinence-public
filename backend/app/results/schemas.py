from datetime import datetime

from pydantic import BaseModel, Field


class OverviewOut(BaseModel):
    total_sessions: int
    completed_sessions: int
    total_answers: int
    avg_score: float = Field(ge=0, le=100)
    improvement_delta: float
    contradiction_rate: float = Field(ge=0, le=100)


class ScoreTrendPointOut(BaseModel):
    session_id: str
    date: str
    role: str
    avg_score: float = Field(ge=0, le=100)


class CommunicationTrendPointOut(BaseModel):
    session_id: str
    date: str
    confidence: float | None = Field(default=None, ge=0, le=100)
    clarity: float | None = Field(default=None, ge=0, le=100)
    nervousness: float | None = Field(default=None, ge=0, le=100)
    posture: float | None = Field(default=None, ge=0, le=100)
    gaze: float | None = Field(default=None, ge=0, le=100)
    fidgeting: float | None = Field(default=None, ge=0, le=100)


class WeaknessOut(BaseModel):
    area: str
    frequency: int
    avg_score_when_observed: float = Field(ge=0, le=100)
    impact_score: float = Field(ge=0, le=100)
    evidence: list[str] = Field(default_factory=list)
    suggested_actions: list[str] = Field(default_factory=list)


class StrengthOut(BaseModel):
    area: str
    frequency: int
    evidence: list[str] = Field(default_factory=list)


class RoleBreakdownOut(BaseModel):
    role: str
    sessions: int
    avg_score: float = Field(ge=0, le=100)
    confidence: float | None = Field(default=None, ge=0, le=100)
    clarity: float | None = Field(default=None, ge=0, le=100)
    nervousness: float | None = Field(default=None, ge=0, le=100)


class SessionSnapshotOut(BaseModel):
    session_id: str
    role: str
    difficulty: str
    status: str
    date: str
    question_count: int
    avg_score: float | None = Field(default=None, ge=0, le=100)
    contradictions: int
    top_strengths: list[str] = Field(default_factory=list)
    top_weaknesses: list[str] = Field(default_factory=list)
    confidence: float | None = Field(default=None, ge=0, le=100)
    clarity: float | None = Field(default=None, ge=0, le=100)
    nervousness: float | None = Field(default=None, ge=0, le=100)
    dominant_emotion: str | None = None


class RadarMetricOut(BaseModel):
    metric: str
    score: float = Field(ge=0, le=100)


class WeaknessHeatmapOut(BaseModel):
    area: str
    technical: float = Field(ge=0, le=100)
    communication: float = Field(ge=0, le=100)
    consistency: float = Field(ge=0, le=100)


class LlmWeaknessInsightOut(BaseModel):
    area: str
    impact_score: float = Field(ge=0, le=100)
    rationale: str
    action_items: list[str] = Field(default_factory=list)


class LlmStrengthInsightOut(BaseModel):
    area: str
    rationale: str


class CoachingStepOut(BaseModel):
    phase: str
    objective: str
    action_items: list[str] = Field(default_factory=list)
    success_metric: str


class LlmInsightsOut(BaseModel):
    summary: str
    trajectory: str
    confidence_note: str
    key_weaknesses: list[LlmWeaknessInsightOut] = Field(default_factory=list)
    key_strengths: list[LlmStrengthInsightOut] = Field(default_factory=list)
    coaching_plan: list[CoachingStepOut] = Field(default_factory=list)
    focus_radar: list[RadarMetricOut] = Field(default_factory=list)
    weakness_heatmap: list[WeaknessHeatmapOut] = Field(default_factory=list)


class ResultsAnalysisResponse(BaseModel):
    generated_at: datetime
    overview: OverviewOut
    score_trend: list[ScoreTrendPointOut] = Field(default_factory=list)
    communication_trend: list[CommunicationTrendPointOut] = Field(default_factory=list)
    weaknesses: list[WeaknessOut] = Field(default_factory=list)
    strengths: list[StrengthOut] = Field(default_factory=list)
    role_breakdown: list[RoleBreakdownOut] = Field(default_factory=list)
    session_snapshots: list[SessionSnapshotOut] = Field(default_factory=list)
    llm_insights: LlmInsightsOut
