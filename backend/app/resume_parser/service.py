import asyncio
import logging
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from pymongo.database import Database

from app.resume_parser.extractor import clean_extracted_text, extract_text_from_docx, extract_text_from_pdf
from app.resume_parser.llm_client import analyze_resume_ats_with_llm, parse_resume_with_llm
from app.resume_parser.repository import build_resume_document, get_resumes_collection

logger = logging.getLogger(__name__)

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".docx"}
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
}


def _validate_file(file: UploadFile, file_bytes: bytes) -> str:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only PDF and DOCX are supported",
        )

    if file.content_type and file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid content type. Only PDF and DOCX are supported",
        )

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File is too large. Maximum size is 5MB",
        )

    return suffix


async def _extract_resume_text(suffix: str, file_bytes: bytes) -> str:
    try:
        if suffix == ".pdf":
            raw_text = await asyncio.to_thread(extract_text_from_pdf, file_bytes)
        else:
            raw_text = await asyncio.to_thread(extract_text_from_docx, file_bytes)
    except Exception as exc:
        logger.exception("Failed to extract resume text")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Failed to extract text from resume",
        ) from exc

    cleaned_text = clean_extracted_text(raw_text)
    if not cleaned_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Extracted resume text is empty",
        )

    return cleaned_text


async def _store_parsed_resume(
    *,
    db: Database,
    parsed_resume: dict,
    ats_analysis: dict | None,
    raw_text: str,
    file: UploadFile,
    user_id: str | None,
) -> tuple[str, object]:
    collection = get_resumes_collection(db)
    doc = build_resume_document(
        parsed_resume=parsed_resume,
        ats_analysis=ats_analysis,
        raw_text=raw_text,
        filename=file.filename or "unknown",
        content_type=file.content_type,
        user_id=user_id,
    )

    inserted = await asyncio.to_thread(collection.insert_one, doc)
    return str(inserted.inserted_id), doc["created_at"]


async def process_resume_upload(
    *,
    file: UploadFile,
    db: Database,
    user_id: str | None,
) -> dict:
    # Step 1: Read bytes once from the upload stream.
    file_bytes = await file.read()

    # Step 2: Validate file extension, content type, and file size.
    suffix = _validate_file(file, file_bytes)

    # Step 3: Extract and clean text using format-specific parser.
    resume_text = await _extract_resume_text(suffix, file_bytes)

    # Step 4: Send cleaned text to OpenRouter LLM and get structured JSON.
    parsed_resume = await parse_resume_with_llm(resume_text)

    # Step 5: Generate ATS score and improvement suggestions.
    ats_analysis: dict | None
    try:
        ats_analysis = await analyze_resume_ats_with_llm(resume_text, parsed_resume)
    except HTTPException:
        logger.exception("Failed to generate ATS analysis. Returning parsed resume without ATS details")
        ats_analysis = {
            "overall_score": None,
            "score_breakdown": None,
            "strengths": [],
            "wording_tips": [],
            "formatting_tips": [],
            "useful_insights": [
                "Resume parsed successfully, but ATS insights are temporarily unavailable."
            ],
        }

    # Step 6: Store parsed output and ATS insights in MongoDB resumes collection.
    resume_id, created_at = await _store_parsed_resume(
        db=db,
        parsed_resume=parsed_resume,
        ats_analysis=ats_analysis,
        raw_text=resume_text,
        file=file,
        user_id=user_id,
    )

    return {
        "resume_id": resume_id,
        "parsed_resume": parsed_resume,
        "ats_analysis": ats_analysis,
        "created_at": created_at,
    }
