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
    level: bool= Field(default=False, description="Include approximate CEFR level A1-C2")

# Request body for AI-powered word lookup with sentence context.
class VocabLookupRequest(BaseModel):
    selected_text: str = Field(description="The word or phrase the user selected")
    sentence: str = Field(description="The full sentence providing context")
    session_id: str | None = Field(default=None, description="Saved session UUID; scopes the cache to this session")
    sentence_id: int = Field(description="Index of the sentence in the current session")
    word_index: int = Field(description="Character or word index of the selected text in the sentence")
    options: VocabOptions

# Response shape for word lookup.
class VocabLookupResponse(BaseModel):
    text: str = Field(description="Selected text as provided")
    lemma: str = Field(description="Base form of the word")
    pos: str = Field(description="Part of speech")
    translation: str | None = Field(default=None)
    definition: str | None = Field(default=None)
    example: str | None = Field(default=None)
    level: str | None = Field(default=None)

# Cached lookup entry keyed by sentence_id|word_index.
class CachedLookup(BaseModel):
    sentence: str
    text: str
    lemma: str
    pos: str
    translation: str | None = None
    definition: str | None = None
    example: str | None = None
    level: str | None = None
