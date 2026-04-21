import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pymongo.database import Database

from app.db import get_sync_database
from app.middlewares.auth_context import get_authenticated_user_id
from app.resume_parser.repository import (
    delete_resumes_for_user,
    get_latest_resume_for_user,
    serialize_resume_document,
)
from app.resume_parser.schemas import CurrentResumeResponse, DeleteResumeResponse, UploadResumeResponse
from app.resume_parser.service import process_resume_upload

logger = logging.getLogger(__name__)

router = APIRouter(tags=["resume-parser"])


@router.get("/resume", response_model=CurrentResumeResponse)
async def get_current_resume(
    user_id: str = Depends(get_authenticated_user_id),
    db: Database = Depends(get_sync_database),
):
    doc = await get_latest_resume_for_user(db=db, user_id=user_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No parsed resume found for this user",
        )

    return serialize_resume_document(doc)


@router.delete("/resume", response_model=DeleteResumeResponse)
async def delete_current_resume(
    user_id: str = Depends(get_authenticated_user_id),
    db: Database = Depends(get_sync_database),
):
    deleted_count = await delete_resumes_for_user(db=db, user_id=user_id)
    if deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No parsed resume found for this user",
        )

    return {
        "message": "Resume data deleted successfully",
        "deleted_count": deleted_count,
    }


@router.post("/upload-resume", response_model=UploadResumeResponse)
async def upload_resume(
    user_id: str = Depends(get_authenticated_user_id),
    file: UploadFile = File(...),
    db: Database = Depends(get_sync_database),
):
    logger.info("Processing resume upload: filename=%s user_id=%s", file.filename, user_id)
    try:
        return await process_resume_upload(file=file, db=db, user_id=user_id)
    finally:
        await file.close()
