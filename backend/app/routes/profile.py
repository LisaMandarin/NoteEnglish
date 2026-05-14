from fastapi import APIRouter, Depends

from app.core.auth import require_user
from app.models.session import EnsureProfileRequest
from app.services.supabase import ensure_profile


router = APIRouter(tags=["profile"])


@router.post("/profile/ensure")
def ensure_profile_route(
    req: EnsureProfileRequest, user: dict = Depends(require_user)
):
    ensure_profile(user, req.display_name)
    return {"ok": True}
