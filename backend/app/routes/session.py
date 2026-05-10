from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.models.session import SaveSessionRequest, UpdateSessionTitleRequest
from app.services.supabase import (
    delete_session,
    get_authenticated_user,
    get_session_detail,
    list_sessions,
    save_session,
    update_session_title,
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


@router.patch("/sessions/{session_id}/title")
def update_session_title_route(
    session_id: str,
    req: UpdateSessionTitleRequest,
    authorization: str | None = Depends(_authorization_header),
):
    user = get_authenticated_user(authorization)
    return update_session_title(user["id"], session_id, req.title)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session_route(
    session_id: str, authorization: str | None = Depends(_authorization_header)
):
    user = get_authenticated_user(authorization)
    delete_session(user["id"], session_id)


@router.post("/sessions/save")
def save_session_route(
    req: SaveSessionRequest, authorization: str | None = Depends(_authorization_header)
):
    user = get_authenticated_user(authorization)
    return save_session(user["id"], req.text, [s.model_dump() for s in req.sentences], req.session_id)
