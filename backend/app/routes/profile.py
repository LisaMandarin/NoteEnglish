from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.models.session import EnsureProfileRequest
from app.services.supabase import ensure_profile, get_authenticated_user


router = APIRouter(tags=["profile"])
bearer_scheme = HTTPBearer(auto_error=False)


def _authorization_header(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str | None:
    if not credentials:
        return None
    return f"{credentials.scheme} {credentials.credentials}"


@router.post("/profile/ensure")
def ensure_profile_route(
    req: EnsureProfileRequest, authorization: str | None = Depends(_authorization_header)
):
    user = get_authenticated_user(authorization)
    ensure_profile(user, req.display_name)
    return {"ok": True}
