from pydantic import BaseModel
from pydantic import Field
from app.models.vocab import VocabItem

class TranslateRequest(BaseModel):
    text: str
    target_lang: str = "zh-TW"
    mode: str = "normal"

class SentencePair(BaseModel):
    id: int = Field(description="Sentence index")
    original: str = Field(description="Original sentence before translation", examples=["I like apples.", "She is reading a book."])
    translation: str | None = Field(description="Translated sentence")
    vocab: list[VocabItem] = Field(default_factory=list, description="Vocabulary items related to this sentence")

class TranslateResponse(BaseModel):
    sentences: list[SentencePair]
