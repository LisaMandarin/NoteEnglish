from fastapi import APIRouter, Depends

from app.core.auth import require_user
from app.models.profile import MyProfile, PublicProfile, UpdateProfileRequest
from app.models.session import EnsureProfileRequest
from app.services.supabase import (
    ensure_profile,
    get_profile,
    get_public_profile,
    update_profile,
)


router = APIRouter(tags=["profile"])


@router.post("/profile/ensure")
def ensure_profile_route(
    req: EnsureProfileRequest, user: dict = Depends(require_user)
):
    ensure_profile(user, req.display_name)
    return {"ok": True}


@router.get("/profile/me", response_model=MyProfile)
def my_profile_route(user: dict = Depends(require_user)):
    return get_profile(user["id"])


@router.patch("/profile", response_model=MyProfile)
def update_profile_route(
    req: UpdateProfileRequest, user: dict = Depends(require_user)
):
    payload = {
        "display_name": req.display_name,
        "bio": req.bio,
        # HttpUrl is not JSON-serializable as-is; dump to plain strings.
        "links": [link.model_dump(mode="json") for link in req.links],
        "is_public": req.is_public,
    }
    return update_profile(user["id"], payload)


@router.get("/profiles/{user_id}", response_model=PublicProfile)
def public_profile_route(user_id: str, user: dict = Depends(require_user)):
    # Missing and private profiles both 404 inside the service — callers
    # cannot tell the two apart. Never returns email.
    return get_public_profile(user_id)
