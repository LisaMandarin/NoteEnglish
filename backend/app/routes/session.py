from fastapi import APIRouter, Depends, Query

from app.core.auth import require_user
from app.models.session import (
    SaveSessionRequest,
    SessionGroupRequest,
    SetSessionGroupRequest,
    UpdateSessionTitleRequest,
)
from app.services.supabase import (
    create_session_group,
    delete_session,
    delete_session_group,
    get_session_detail,
    list_session_groups,
    list_sessions,
    rename_session_group,
    save_session,
    set_session_group,
    update_session_title,
)


router = APIRouter(tags=["sessions"])


@router.get("/sessions")
def session_history(
    # Upper bound raised so the grouped library view can load a user's whole
    # session list in one request (topic folders group client-side).
    limit: int = Query(default=5, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(require_user),
):
    return list_sessions(user["id"], limit=limit, offset=offset)


@router.get("/sessions/{session_id}")
def session_detail(session_id: str, user: dict = Depends(require_user)):
    return get_session_detail(user["id"], session_id)


@router.patch("/sessions/{session_id}/title")
def update_session_title_route(
    session_id: str,
    req: UpdateSessionTitleRequest,
    user: dict = Depends(require_user),
):
    return update_session_title(user["id"], session_id, req.title)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session_route(session_id: str, user: dict = Depends(require_user)):
    delete_session(user["id"], session_id)


@router.post("/sessions/save")
def save_session_route(req: SaveSessionRequest, user: dict = Depends(require_user)):
    return save_session(user["id"], req.text, [s.model_dump() for s in req.sentences], req.session_id)


# ── Session groups (topic folders) ──────────────────────────────────────────

@router.get("/session-groups")
def list_session_groups_route(user: dict = Depends(require_user)):
    return list_session_groups(user["id"])


@router.post("/session-groups")
def create_session_group_route(req: SessionGroupRequest, user: dict = Depends(require_user)):
    return create_session_group(user["id"], req.name)


@router.patch("/session-groups/{group_id}")
def rename_session_group_route(
    group_id: str, req: SessionGroupRequest, user: dict = Depends(require_user)
):
    return rename_session_group(user["id"], group_id, req.name)


@router.delete("/session-groups/{group_id}", status_code=204)
def delete_session_group_route(group_id: str, user: dict = Depends(require_user)):
    delete_session_group(user["id"], group_id)


@router.patch("/sessions/{session_id}/group")
def set_session_group_route(
    session_id: str, req: SetSessionGroupRequest, user: dict = Depends(require_user)
):
    return set_session_group(user["id"], session_id, req.group_id)
