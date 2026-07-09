from typing import Literal

from pydantic import BaseModel, Field

QuizType = Literal["cloze", "matching", "spelling", "dictation", "comprehension"]


class QuizGenerateRequest(BaseModel):
    session_id: str
    # True forces a fresh Gemini call even when cached questions exist.
    regenerate: bool = False


class ComprehensionQuestion(BaseModel):
    question: str
    options: list[str] = Field(min_length=4, max_length=4)
    answer_index: int = Field(ge=0, le=3)
    # Short Traditional-Chinese explanation of the correct answer.
    explanation: str = ""


class QuizGenerateResponse(BaseModel):
    questions: list[ComprehensionQuestion]


class QuizResultItem(BaseModel):
    quiz_type: QuizType
    # Word identity for vocab question types; None for dictation/comprehension.
    lemma: str | None = None
    pos: str | None = None
    correct: bool


class QuizResultsRequest(BaseModel):
    session_id: str | None = None
    results: list[QuizResultItem] = Field(min_length=1, max_length=200)


class QuizResultsResponse(BaseModel):
    saved: int


class VocabPoolItem(BaseModel):
    lemma: str
    pos: str | None = None
    text: str | None = None
    translation: str | None = None
    definition: str | None = None


class VocabPoolResponse(BaseModel):
    items: list[VocabPoolItem]


class WordMasteryItem(BaseModel):
    lemma: str
    pos: str = ""
    # 1 = 學習中, 2 = 已掌握 (unquizzed words simply have no row).
    level: int
    correct_count: int
    wrong_count: int
    next_review_at: str | None = None


class WordMasteryResponse(BaseModel):
    items: list[WordMasteryItem]


class ReviewWordsResponse(BaseModel):
    items: list[VocabPoolItem]
