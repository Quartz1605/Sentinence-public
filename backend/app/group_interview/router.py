from __future__ import annotations

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db import get_database
from app.group_interview.schemas import (
    GroupInterviewResultResponse,
    StartGroupInterviewRequest,
    StartGroupInterviewResponse,
    SubmitGroupInterviewAnswerRequest,
    SubmitGroupInterviewAnswerResponse,
)
from app.group_interview.service import (
    get_group_interview_result,
    start_group_interview,
    submit_group_interview_answer,
)
from app.middlewares.auth_context import get_authenticated_user_id


router = APIRouter(prefix="/group-interview", tags=["Group Interview"])


@router.post("/start", response_model=StartGroupInterviewResponse)
async def start_group_interview_route(
    payload: StartGroupInterviewRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user_id: str = Depends(get_authenticated_user_id),
):
    return await start_group_interview(
        db=db,
        user_id=user_id,
        role=payload.role,
        difficulty=payload.difficulty,
    )


@router.post("/respond", response_model=SubmitGroupInterviewAnswerResponse)
async def submit_group_interview_answer_route(
    payload: SubmitGroupInterviewAnswerRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user_id: str = Depends(get_authenticated_user_id),
):
    return await submit_group_interview_answer(
        db=db,
        user_id=user_id,
        session_id=payload.session_id,
        answer_text=payload.answer_text,
        audio_base64=payload.audio_base64,
        audio_mime_type=payload.audio_mime_type,
    )


@router.get("/result", response_model=GroupInterviewResultResponse)
async def get_group_interview_result_route(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user_id: str = Depends(get_authenticated_user_id),
):
    return await get_group_interview_result(
        db=db,
        user_id=user_id,
        session_id=session_id,
    )
