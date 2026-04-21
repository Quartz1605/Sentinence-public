from fastapi import HTTPException, Request, status

from app.auth.jwt import decode_token


async def attach_auth_context(request: Request, call_next):
    request.state.user_id = None

    access_token = request.cookies.get("access_token")
    if access_token:
        try:
            payload = decode_token(token=access_token, expected_type="access")
            request.state.user_id = payload["user_id"]
        except HTTPException:
            request.state.user_id = None

    response = await call_next(request)
    return response


def get_authenticated_user_id(request: Request) -> str:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return str(user_id)
