from fastapi import APIRouter, Depends

from app.core.auth import require_user
from app.models.session import SaveSessionRequest, UpdateSessionTitleRequest
from app.services.supabase import (
    delete_session,
    get_session_detail,
    list_sessions,
    save_session,
    update_session_title,
)


router = APIRouter(tags=["sessions"])


@router.get("/sessions")
def session_history(user: dict = Depends(require_user)):
    return list_sessions(user["id"])


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
