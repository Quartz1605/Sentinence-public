from datetime import datetime, timedelta, timezone
from typing import TypedDict

from fastapi import HTTPException, status
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError

from app.auth.config import auth_settings


class TokenPayload(TypedDict):
	user_id: str
	email: str
	token_type: str


def _create_token(
	*,
	user_id: str,
	email: str,
	token_type: str,
	expires_delta: timedelta,
) -> str:
	now = datetime.now(timezone.utc)
	payload = {
		"user_id": user_id,
		"email": email,
		"token_type": token_type,
		"iat": now,
		"exp": now + expires_delta,
	}
	return jwt.encode(payload, auth_settings.secret_key, algorithm=auth_settings.jwt_algorithm)


def create_access_token(*, user_id: str, email: str) -> str:
	return _create_token(
		user_id=user_id,
		email=email,
		token_type="access",
		expires_delta=timedelta(minutes=auth_settings.access_token_expire_minutes),
	)


def create_refresh_token(*, user_id: str, email: str) -> str:
	return _create_token(
		user_id=user_id,
		email=email,
		token_type="refresh",
		expires_delta=timedelta(minutes=auth_settings.refresh_token_expire_minutes),
	)


def decode_token(*, token: str, expected_type: str) -> TokenPayload:
	try:
		payload = jwt.decode(
			token,
			auth_settings.secret_key,
			algorithms=[auth_settings.jwt_algorithm],
		)
	except ExpiredSignatureError as exc:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Token expired",
		) from exc
	except JWTError as exc:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Invalid token",
		) from exc

	token_type = payload.get("token_type")
	user_id = payload.get("user_id")
	email = payload.get("email")

	if token_type != expected_type:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Invalid token type",
		)

	if not user_id or not email:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Invalid token payload",
		)

	return {
		"user_id": str(user_id),
		"email": str(email),
		"token_type": str(token_type),
	}
