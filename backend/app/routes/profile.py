from fastapi import APIRouter, Header

from app.models.session import EnsureProfileRequest
from app.services.supabase import ensure_profile, get_authenticated_user


router = APIRouter(tags=["profile"])


@router.post("/profile/ensure")
def ensure_profile_route(
    req: EnsureProfileRequest, authorization: str | None = Header(default=None)
):
    user = get_authenticated_user(authorization)
    ensure_profile(user, req.display_name)
    return {"ok": True}
