from fastapi import APIRouter, Depends

from app.core.auth import require_user
from app.services.supabase import (
    add_favorite,
    create_share_token,
    fork_shared_session,
    get_shared_session,
    list_favorites,
    remove_favorite,
    revoke_share_token,
)


router = APIRouter(tags=["sharing"])


@router.post("/sessions/{session_id}/share")
def create_share_route(session_id: str, user: dict = Depends(require_user)):
    return create_share_token(user["id"], session_id)


@router.delete("/sessions/{session_id}/share", status_code=204)
def revoke_share_route(session_id: str, user: dict = Depends(require_user)):
    revoke_share_token(user["id"], session_id)


@router.get("/shared/{token}")
def shared_detail_route(token: str, user: dict = Depends(require_user)):
    return get_shared_session(user["id"], token)


@router.post("/shared/{token}/favorite", status_code=204)
def add_favorite_route(token: str, user: dict = Depends(require_user)):
    add_favorite(user["id"], token)


@router.delete("/favorites/{session_id}", status_code=204)
def remove_favorite_route(session_id: str, user: dict = Depends(require_user)):
    remove_favorite(user["id"], session_id)


@router.get("/favorites")
def favorites_route(user: dict = Depends(require_user)):
    return list_favorites(user["id"])


@router.post("/shared/{token}/fork")
def fork_route(token: str, user: dict = Depends(require_user)):
    return fork_shared_session(user["id"], token)
