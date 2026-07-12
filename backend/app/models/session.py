from pydantic import BaseModel, Field


class SessionVocabItem(BaseModel):
    text: str = ""
    lemma: str
    pos: str | None = None
    translation: str | None = None
    definition: str | None = None
    example: str | None = None
    example_translation: str | None = None
    level: str | None = None
    other_1: str | None = None
    other_2: str | None = None
    other_3: str | None = None
    other_4: str | None = None
    other_5: str | None = None


class SessionSentence(BaseModel):
    id: int
    original: str
    translation: str
    vocab: list[SessionVocabItem] = Field(default_factory=list)
    note: str = ""


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


class SaveSessionResponse(BaseModel):
    saved_at: str
    session: SessionSummary


class EnsureProfileRequest(BaseModel):
    display_name: str


class UpdateSessionTitleRequest(BaseModel):
    title: str
