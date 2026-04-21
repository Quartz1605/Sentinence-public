from datetime import datetime

from pydantic import BaseModel, Field


class ExperienceItem(BaseModel):
    company: str | None = None
    role: str | None = None
    duration: str | None = None
    description: str | None = None


class ParsedResume(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    summary: str | None = None
    skills: list[str] | None = None
    education: list[str] | None = None
    experience: list[ExperienceItem] | None = None


class ATSScoreBreakdown(BaseModel):
    keyword_alignment: int | None = Field(default=None, ge=0, le=100)
    formatting: int | None = Field(default=None, ge=0, le=100)
    readability: int | None = Field(default=None, ge=0, le=100)
    section_completeness: int | None = Field(default=None, ge=0, le=100)


class ATSAnalysis(BaseModel):
    overall_score: int | None = Field(default=None, ge=0, le=100)
    score_breakdown: ATSScoreBreakdown | None = None
    strengths: list[str] = Field(default_factory=list)
    wording_tips: list[str] = Field(default_factory=list)
    formatting_tips: list[str] = Field(default_factory=list)
    useful_insights: list[str] = Field(default_factory=list)


class UploadResumeResponse(BaseModel):
    resume_id: str
    parsed_resume: ParsedResume
    ats_analysis: ATSAnalysis | None = None
    created_at: datetime


class CurrentResumeResponse(BaseModel):
    resume_id: str
    parsed_resume: ParsedResume
    ats_analysis: ATSAnalysis | None = None
    created_at: datetime
    filename: str
    content_type: str | None = None


class DeleteResumeResponse(BaseModel):
    message: str
    deleted_count: int
