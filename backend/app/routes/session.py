from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.models.session import SaveSessionRequest
from app.services.supabase import (
    get_authenticated_user,
    get_session_detail,
    list_sessions,
    save_session,
)


router = APIRouter(tags=["sessions"])
bearer_scheme = HTTPBearer(auto_error=False)


def _authorization_header(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str | None:
    if not credentials:
        return None
    return f"{credentials.scheme} {credentials.credentials}"


@router.get("/sessions")
def session_history(authorization: str | None = Depends(_authorization_header)):
    user = get_authenticated_user(authorization)
    return list_sessions(user["id"])


@router.get("/sessions/{session_id}")
def session_detail(
    session_id: str, authorization: str | None = Depends(_authorization_header)
):
    user = get_authenticated_user(authorization)
    return get_session_detail(user["id"], session_id)


@router.post("/sessions/save")
def save_session_route(
    req: SaveSessionRequest, authorization: str | None = Depends(_authorization_header)
):
    user = get_authenticated_user(authorization)
    return save_session(user["id"], req.text, [s.model_dump() for s in req.sentences], req.session_id)
