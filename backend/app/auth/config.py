import json
import os
from dataclasses import dataclass
from pathlib import Path


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _get_secret_from_file() -> tuple[str | None, str | None]:
    auth_dir = Path(__file__).resolve().parent
    configured_path = os.getenv("GOOGLE_CLIENT_SECRETS_FILE")
    candidate_paths = [
        Path(configured_path) if configured_path else None,
        auth_dir / "client_secrets.json",
        auth_dir / "gmail_secrets.json",
    ]

    for candidate_path in candidate_paths:
        if candidate_path is None or not candidate_path.exists():
            continue

        try:
            payload = json.loads(candidate_path.read_text(encoding="utf-8"))
        except Exception:
            continue

        section = payload.get("web") or payload.get("installed") or {}
        client_id = section.get("client_id")
        client_secret = section.get("client_secret")
        if client_id and client_secret:
            return client_id, client_secret

    return None, None


@dataclass(frozen=True)
class AuthSettings:
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str
    secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 3 * 24 * 60
    refresh_token_expire_minutes: int = 7 * 24 * 60
    cookie_secure: bool = True
    cookie_samesite: str = "lax"
    post_login_redirect_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"


def get_auth_settings() -> AuthSettings:
    file_client_id, file_client_secret = _get_secret_from_file()

    google_client_id = os.getenv("GOOGLE_CLIENT_ID") or file_client_id
    google_client_secret = os.getenv("GOOGLE_CLIENT_SECRET") or file_client_secret
    secret_key = os.getenv("SECRET_KEY") or os.getenv("JWT_SECRET")

    if not google_client_id:
        raise RuntimeError("Missing GOOGLE_CLIENT_ID and no valid client_secrets.json found")
    if not google_client_secret:
        raise RuntimeError("Missing GOOGLE_CLIENT_SECRET and no valid client_secrets.json found")
    if not secret_key:
        raise RuntimeError("Missing SECRET_KEY environment variable")

    return AuthSettings(
        google_client_id=google_client_id,
        google_client_secret=google_client_secret,
        google_redirect_uri=os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/callback"),
        secret_key=secret_key,
        cookie_secure=_parse_bool(os.getenv("COOKIE_SECURE"), default=True),
        cookie_samesite=os.getenv("COOKIE_SAMESITE", "lax"),
        post_login_redirect_url=os.getenv("POST_LOGIN_REDIRECT_URL", "http://localhost:3000"),
        cors_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000"),
    )


auth_settings = get_auth_settings()