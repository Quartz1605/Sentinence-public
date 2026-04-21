from fastapi import Response

from app.auth.config import auth_settings


def set_auth_cookies(response: Response, *, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=auth_settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=auth_settings.cookie_secure,
        samesite=auth_settings.cookie_samesite,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=auth_settings.refresh_token_expire_minutes * 60,
        httponly=True,
        secure=auth_settings.cookie_secure,
        samesite=auth_settings.cookie_samesite,
    )


def set_access_cookie(response: Response, *, access_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=auth_settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=auth_settings.cookie_secure,
        samesite=auth_settings.cookie_samesite,
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")