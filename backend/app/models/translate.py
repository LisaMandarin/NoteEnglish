from pydantic import BaseModel, Field
from app.models.vocab import VocabItem

class TranslateRequest(BaseModel):
    text: str = Field(description="Original sentence before translation")
    target_lang: str = Field(default="zh-TW", description="Target language for translation") 
    mode: str = Field(
        default="normal", 
        description="Translation mode: 'normal' for natural translation, 'learner' for explicit, learner-friendly output", 
        examples=["normal", "learner"]
    )

class SentencePair(BaseModel):
    id: int = Field(description="Sentence index")
    original: str = Field(description="Original sentence before translation", examples=["I like apples.", "She is reading a book."])
    translation: str | None = Field(description="Translated sentence")
    vocab: list[VocabItem] = Field(default_factory=list, description="Vocabulary items related to this sentence")

class TranslateResponse(BaseModel):
    sentences: list[SentencePair] = Field(
        description="List of sentence-level translation results in original order"
    )
