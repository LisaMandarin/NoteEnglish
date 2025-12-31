from pydantic import BaseModel, Field

# Basic vocab token extracted from a sentence.
class VocabItem(BaseModel):
    text: str = Field(description="original text")
    lemma: str = Field(description="base form of word")
    pos: str = Field(description="part of speech")

# Flags for which vocab details to fetch.
class VocabOptions(BaseModel):
    translation: bool = Field(default=False, description="Include Chinese translation of the word")
    definition: bool = Field(default=False, description="Include English definition")
    example: bool= Field(default=False, description="Include one natural example sentence")
    level: bool= Field(default=False, description="Include approximate CEFR level A2-C1")

# Request body for vocab detail lookup.
class VocabDetailRequest(BaseModel):
    lemma: str = Field(description="base form of the word", examples=["founder"])   # base form of word
    pos: str = Field(description="part of speech", examples=["創立者"])     # part of speech
    options: VocabOptions

# Response shape for vocab detail lookup.
class VocabDetailResponse(BaseModel):
    lemma: str = Field(description="base form of word")
    pos: str = Field(description="part of speech")
    translation: str | None = Field(default=None, description="Chinese translation (only returned if requested)")
    definition: str | None = Field(default=None, description="English definition suitable for intermediate-advanced learners (only returned if requested)")
    example: str | None = Field(default=None, description="Example sentence using this word in the given part of speech (only returned if requested)")
    level: str | None = Field(default=None, description="Approximate CEFR level (A2-C1) (only returned if requested)")

# Cached vocab entry to avoid repeated AI calls.
class CachedVocab(BaseModel):
    lemma: str
    pos: str
    translation: str | None = None
    definition: str | None = None
    example: str | None = None
    level: str | None = None
