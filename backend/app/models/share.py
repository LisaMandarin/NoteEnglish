from pydantic import BaseModel, Field

from app.models.session import SessionSentence, SessionSummary


class ShareTokenResponse(BaseModel):
    share_token: str


class SharedSessionDetail(BaseModel):
    """Same shape as SessionDetail so the read-only view can reuse the session
    rendering path, plus who shared it and whether the viewer favorited it."""

    text: str
    sentences: list[SessionSentence] = Field(default_factory=list)
    session: SessionSummary
    creator_name: str | None = None
    # Set only when the creator's profile is public — the client renders the
    # creator name as a link to ?profile={creator_id} iff this is present.
    creator_id: str | None = None
    is_favorited: bool = False


class FavoriteItem(BaseModel):
    session_id: str
    title: str
    creator_name: str | None = None
    # Current token of the shared session — the client opens ?shared={token}.
    # Unshared/deleted sessions never appear here, so this is always present.
    share_token: str
    favorited_at: str


class FavoritesResponse(BaseModel):
    items: list[FavoriteItem] = Field(default_factory=list)
