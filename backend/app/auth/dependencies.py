from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, Request, status

from app.auth.jwt import decode_token
from app.auth.service import get_users_collection


async def get_current_user(request: Request) -> dict:
    access_token = request.cookies.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing access token",
        )

    payload = decode_token(token=access_token, expected_type="access")

    try:
        user_id = ObjectId(payload["user_id"])
    except InvalidId as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
        ) from exc

    users = get_users_collection()
    user = await users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user