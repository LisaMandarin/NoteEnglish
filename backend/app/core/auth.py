from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.services.supabase import get_authenticated_user

_bearer_scheme = HTTPBearer(auto_error=False)


def _authorization_header(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> str | None:
    if not credentials:
        return None
    return f"{credentials.scheme} {credentials.credentials}"


def require_user(authorization: str | None = Depends(_authorization_header)) -> dict:
    return get_authenticated_user(authorization)


def require_admin(user: dict = Depends(require_user)) -> dict:
    role = (user.get("app_metadata") or {}).get("role")
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user
