import asyncio
from datetime import datetime, timezone
from typing import Any

from pymongo.collection import Collection
from pymongo.database import Database


def get_resumes_collection(db: Database) -> Collection:
    return db["resumes"]


async def ensure_resume_indexes(db: Database) -> None:
    collection = get_resumes_collection(db)
    await asyncio.to_thread(collection.create_index, "created_at", name="idx_resumes_created_at")
    await asyncio.to_thread(collection.create_index, "user_id", name="idx_resumes_user_id")


def build_resume_document(
    *,
    parsed_resume: dict,
    ats_analysis: dict | None,
    raw_text: str,
    filename: str,
    content_type: str | None,
    user_id: str | None,
) -> dict:
    return {
        "user_id": user_id,
        "filename": filename,
        "content_type": content_type,
        "raw_text": raw_text,
        "parsed_resume": parsed_resume,
        "ats_analysis": ats_analysis,
        "created_at": datetime.now(timezone.utc),
    }


def serialize_resume_document(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "resume_id": str(doc["_id"]),
        "parsed_resume": doc.get("parsed_resume"),
        "ats_analysis": doc.get("ats_analysis"),
        "created_at": doc.get("created_at"),
        "filename": doc.get("filename", "unknown"),
        "content_type": doc.get("content_type"),
    }


async def get_latest_resume_for_user(*, db: Database, user_id: str) -> dict[str, Any] | None:
    collection = get_resumes_collection(db)
    return await asyncio.to_thread(
        collection.find_one,
        {"user_id": user_id},
        sort=[("created_at", -1)],
    )


async def delete_resumes_for_user(*, db: Database, user_id: str) -> int:
    collection = get_resumes_collection(db)
    result = await asyncio.to_thread(collection.delete_many, {"user_id": user_id})
    return int(result.deleted_count)
