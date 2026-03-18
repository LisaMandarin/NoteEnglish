from pydantic import BaseModel, Field


class SessionVocabItem(BaseModel):
    text: str = ""
    lemma: str
    pos: str | None = None
    translation: str | None = None
    definition: str | None = None
    example: str | None = None
    level: str | None = None
    queried: bool = True


class SessionSentence(BaseModel):
    id: int
    original: str
    translation: str
    vocab: list[SessionVocabItem] = Field(default_factory=list)


class SaveSessionRequest(BaseModel):
    session_id: str | None = None
    text: str
    sentences: list[SessionSentence] = Field(default_factory=list)


class SessionSummary(BaseModel):
    id: str
    title: str
    source_text: str
    created_at: str
    updated_at: str


class SessionDetail(BaseModel):
    text: str
    sentences: list[SessionSentence] = Field(default_factory=list)
    session: SessionSummary
    last_saved_at: str | None = None


class SaveSessionResponse(BaseModel):
    saved_at: str
    session: SessionSummary


class EnsureProfileRequest(BaseModel):
    display_name: str
