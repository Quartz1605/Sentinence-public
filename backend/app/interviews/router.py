import logging

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db import get_database
from app.middlewares.auth_context import get_authenticated_user_id
from app.interviews.schemas import (
    InterviewDetailResponse,
    StartInterviewRequest,
    StartInterviewResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
    SaveSessionAnalysisRequest,
)
from app.interviews.service import get_interview_details, start_interview, submit_answer, save_session_analysis


logger = logging.getLogger(__name__)

router = APIRouter(tags=["interviews"])


@router.post("/start-interview", response_model=StartInterviewResponse)
async def start_interview_route(
    payload: StartInterviewRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user_id: str = Depends(get_authenticated_user_id),
):
    logger.info("POST /start-interview called", extra={"user_id": user_id, "role": payload.role, "difficulty": payload.difficulty, "persona": payload.persona})
    return await start_interview(db, payload, user_id)


@router.post("/submit-answer", response_model=SubmitAnswerResponse)
async def submit_answer_route(
    payload: SubmitAnswerRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user_id: str = Depends(get_authenticated_user_id),
):
    logger.info(
        "POST /submit-answer called",
        extra={"user_id": user_id, "interview_id": payload.interview_id, "answer_length": len(payload.answer)},
    )
    return await submit_answer(db, payload, user_id)


@router.get("/interview/{id}", response_model=InterviewDetailResponse)
async def get_interview_route(
    id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user_id: str = Depends(get_authenticated_user_id),
):
    logger.info("GET /interview/{id} called", extra={"user_id": user_id, "interview_id": id})
    return await get_interview_details(db, id, user_id)


@router.post("/interview/{id}/session-analysis")
async def save_session_analysis_route(
    id: str,
    payload: SaveSessionAnalysisRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user_id: str = Depends(get_authenticated_user_id),
):
    logger.info("POST /interview/{id}/session-analysis called", extra={"user_id": user_id, "interview_id": id})
    try:
        return await save_session_analysis(db, id, user_id, payload.session_analysis.model_dump())
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unexpected error while saving session analysis", extra={"user_id": user_id, "interview_id": id})
        raise HTTPException(status_code=500, detail=f"Failed to save session analysis: {exc}") from exc
