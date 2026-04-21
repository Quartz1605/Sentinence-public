from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection

from app.db import mongodb


def get_users_collection() -> AsyncIOMotorCollection:
    if mongodb.db is None:
        raise RuntimeError("Database is not initialized")
    return mongodb.db["users"]


async def ensure_user_indexes() -> None:
    users = get_users_collection()
    await users.create_index("email", unique=True, name="uniq_email")


async def upsert_google_user(
    *,
    email: str,
    name: str | None,
    picture: str | None,
) -> dict[str, Any]:
    users = get_users_collection()

    normalized_email = email.strip().lower()
    now = datetime.now(timezone.utc)

    await users.update_one(
        {"email": normalized_email},
        {
            "$set": {
                "name": name,
                "picture": picture,
                "last_login": now,
            },
            "$setOnInsert": {
                "email": normalized_email,
                "created_at": now,
            },
        },
        upsert=True,
    )

    user = await users.find_one({"email": normalized_email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load user",
        )
    return user


def serialize_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user.get("name"),
        "picture": user.get("picture"),
        "created_at": user["created_at"],
        "last_login": user["last_login"],
    }