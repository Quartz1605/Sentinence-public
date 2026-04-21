from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse

from app.auth.config import auth_settings
from app.auth.cookies import clear_auth_cookies, set_access_cookie, set_auth_cookies
from app.auth.dependencies import get_current_user
from app.auth.jwt import create_access_token, create_refresh_token, decode_token
from app.auth.oauth_client import oauth
from app.auth.schemas import UserOut
from app.auth.service import get_users_collection, serialize_user, upsert_google_user

router = APIRouter(tags=["auth"])


@router.get("/login")
async def login(request: Request):
	return await oauth.google.authorize_redirect(request, auth_settings.google_redirect_uri)


@router.get("/auth/callback")
async def auth_callback(request: Request):
	try:
		token = await oauth.google.authorize_access_token(request)
	except Exception as exc:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Google authorization failed",
		) from exc

	user_info = token.get("userinfo")
	if not user_info:
		try:
			user_info = await oauth.google.parse_id_token(request, token)
		except Exception as exc:
			raise HTTPException(
				status_code=status.HTTP_401_UNAUTHORIZED,
				detail="Unable to verify Google identity token",
			) from exc

	if not user_info:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Google user info unavailable",
		)

	if not user_info.get("email_verified"):
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Google email is not verified",
		)

	email = user_info.get("email")
	if not email:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Google email not provided",
		)

	user = await upsert_google_user(
		email=email,
		name=user_info.get("name"),
		picture=user_info.get("picture"),
	)

	user_id = str(user["_id"])
	access_token = create_access_token(user_id=user_id, email=user["email"])
	refresh_token = create_refresh_token(user_id=user_id, email=user["email"])

	response = RedirectResponse(url=auth_settings.post_login_redirect_url, status_code=status.HTTP_302_FOUND)
	set_auth_cookies(response, access_token=access_token, refresh_token=refresh_token)
	return response


@router.get("/me", response_model=UserOut)
async def me(current_user: dict = Depends(get_current_user)):
	return serialize_user(current_user)


@router.post("/refresh")
async def refresh_access_token(request: Request):
	refresh_token = request.cookies.get("refresh_token")
	if not refresh_token:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Missing refresh token",
		)

	payload = decode_token(token=refresh_token, expected_type="refresh")
	users = get_users_collection()

	try:
		user_id = ObjectId(payload["user_id"])
	except InvalidId as exc:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Invalid refresh token",
		) from exc

	user = await users.find_one({"_id": user_id})
	if not user:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="User not found",
		)

	new_access_token = create_access_token(user_id=str(user["_id"]), email=user["email"])
	response = JSONResponse({"message": "Access token refreshed"})
	set_access_cookie(response, access_token=new_access_token)
	return response


@router.post("/logout")
async def logout():
	response = JSONResponse({"message": "Logged out"})
	clear_auth_cookies(response)
	return response
