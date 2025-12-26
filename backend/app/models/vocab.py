from pydantic import BaseModel

class VocabItem(BaseModel):
    text: str     #original text
    lemma: str    #base form of word
    pos: str      #part of speech

class VocabOptions(BaseModel):
    translation: bool=False
    definition: bool=False
    pos: bool=True
    example: bool=False
    level: bool=False

class VocabDetailRequest(BaseModel):
    lemma: str    # base form of word
    pos: str      # part of speech
    options: VocabOptions

class VocabDetailResponse(BaseModel):
    lemma: str
    pos: str
    translation: str | None = None
    definition: str | None = None
    example: str | None = None
    level: str | None = None

class CachedVocab(BaseModel):
    lemma: str
    pos: str
    translation: str | None = None
    definition: str | None = None
    example: str | None = None
    level: str | None = None