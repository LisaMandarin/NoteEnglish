from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.services.supabase import get_authenticated_user, parse_timestamp_utc

_bearer_scheme = HTTPBearer(auto_error=False)
_MAX_SESSION_AGE = timedelta(days=7)


def _authorization_header(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> str | None:
    if not credentials:
        return None
    return f"{credentials.scheme} {credentials.credentials}"


def require_user(authorization: str | None = Depends(_authorization_header)) -> dict:
    user = get_authenticated_user(authorization)

    last_sign_in_at = user.get("last_sign_in_at")
    if last_sign_in_at:
        session_age = datetime.now(timezone.utc) - parse_timestamp_utc(last_sign_in_at)
        if session_age > _MAX_SESSION_AGE:
            raise HTTPException(status_code=401, detail="session_expired")

    return user


def require_admin(user: dict = Depends(require_user)) -> dict:
    role = (user.get("app_metadata") or {}).get("role")
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user
