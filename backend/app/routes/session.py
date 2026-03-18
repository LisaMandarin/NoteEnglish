from fastapi import APIRouter, Header

from app.models.session import SaveSessionRequest
from app.services.supabase import (
    get_authenticated_user,
    get_session_detail,
    list_sessions,
    save_session,
)


router = APIRouter(tags=["sessions"])


@router.get("/sessions")
def session_history(authorization: str | None = Header(default=None)):
    user = get_authenticated_user(authorization)
    return list_sessions(user["id"])


@router.get("/sessions/{session_id}")
def session_detail(session_id: str, authorization: str | None = Header(default=None)):
    user = get_authenticated_user(authorization)
    return get_session_detail(user["id"], session_id)


@router.post("/sessions/save")
def save_session_route(
    req: SaveSessionRequest, authorization: str | None = Header(default=None)
):
    user = get_authenticated_user(authorization)
    return save_session(user["id"], req.text, [s.model_dump() for s in req.sentences], req.session_id)
