from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
import os
import spacy
import json
from google import genai
import re
from pydantic import Field

load_dotenv()
nlp = spacy.load("en_core_web_sm")

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
api_key = os.getenv("GEMINI_API_KEY", "")
model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
client = genai.Client(api_key=api_key)

app = FastAPI(title="NoteEnglish API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

class TranslateRequest(BaseModel):
    text: str
    target_lang: str = "zh-TW"
    mode: str = "normal"

class VocabItem(BaseModel):
    text: str     #original text
    lemma: str    #base form of word
    pos: str      #part of speech

class SentencePair(BaseModel):
    id: int = Field(description="Sentence index")
    original: str = Field(description="Original sentence before translation", examples=["I like apples.", "She is reading a book."])
    translation: str | None = Field(description="Translated sentence")
    vocab: list[VocabItem] = Field(default_factory=list, description="Vocabulary items related to this sentence")

class TranslateResponse(BaseModel):
    sentences: list[SentencePair]

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

VOCAB_CACHE: dict[str, CachedVocab] = {}

# --------------------------------
# Functions
# --------------------------------
def normalize_text(text:str) -> str:
    text = text.replace("\u00a0", " ")
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    text = re.sub(r"\s+", " ", text)

    return text.strip()


def split_sentences(text: str) -> list[str]:
    text = normalize_text(text)
    if not text:
        return []
    
    doc = nlp(text)
    
    sentences = []

    for sent in doc.sents:
        sentence = sent.text.strip()
        if sentence:
            sentences.append(sentence)
    return sentences

ALLOWED_POS = {"NOUN", "VERB", "ADJ", "ADV", "ADP", "SCONJ"}

def extract_vocab(sentence: str) -> list[VocabItem]:
    doc = nlp(sentence)

    seen = set()
    vocab: list[VocabItem] = []

    for token in doc:
        # ignore punctuations, digits, space
        if not token.is_alpha:
            continue
        # ignore a, the, in, to...
        if token.is_stop:
            continue
        if token.pos_ not in ALLOWED_POS:
            continue

        lemma = token.lemma_.lower().strip()
        pos = token.pos_

        if not lemma:
            continue

        key = f"{lemma}|{pos}"
        if key in seen:
            continue

        seen.add(key)

        vocab.append(
            VocabItem(
                text=token.text,
                lemma=lemma,
                pos=pos
            )
        )
    return vocab

def ai_translate_list(sentences: list[str], target_lang: str = "zh-TW", mode: str = "normal") -> list[str]:
    if not sentences:
        return []
    
    style_hint = (
        "Use natural, fluent translation."
        if mode == "normal"
        else
        "Translate for language learners.  Keep sentence structure clear and explicit. "
        "Avoid omitting subjects or connectors."
    )

    prompt = (
        f"Translate each sentence into {target_lang}. "
        f"{style_hint}"
        "Return ONLY a JSON array of strings. "
        "The array length and order MUST match the input. "
        "No explanation, no markdown.\n\n"
        )
    
    for i, s in enumerate(sentences):
        prompt += f"{i}. {s}\n"

    try:
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config={
                "response_mime_type": "application/json"
            }
        )
        text = response.text.strip()
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini API request failed: {e}"
        )
    
    try:
        translations = json.loads(text)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to parse Gemini output as JSON.  Error: {e}.  Output preview: {text[:300]}"
        )

    if not isinstance(translations, list):
        raise HTTPException(
            status_code=502,
            detail="Gemini output is not a JSON array."
        )
    
    fixed = []
    for i in range(len(sentences)):
        fixed.append(translations[i] if i < len(translations) else "")
    return fixed

def get_vocab_detail(req: VocabDetailRequest) -> VocabDetailResponse:
    key = f"{req.lemma.lower()}|{req.pos}"
    cached = VOCAB_CACHE.get(key, CachedVocab(lemma=req.lemma, pos=req.pos))

    need_ai = (
        (req.options.translation and not cached.translation)
        or (req.options.definition and not cached.definition)
        or (req.options.example and not cached.example)
        or (req.options.level and not cached.level)
    )

    if need_ai:
        ai_data = ai_fill_vocab_fields(req.lemma, req.pos, req.options)

        ALLOWED_FIELDS = ["translation", "definition", "example", "level"]

        for field, value in ai_data.items():
            if field in ALLOWED_FIELDS:
                setattr(cached, field, value)
        VOCAB_CACHE[key] = cached

    return VocabDetailResponse(
        lemma=req.lemma,
        pos=req.pos,
        translation=cached.translation if req.options.translation else None,
        definition=cached.definition if req.options.definition else None,
        example=cached.example if req.options.example else None,
        level=cached.level if req.options.level else None,
    )

def ai_fill_vocab_fields(lemma:str, pos:str, options:VocabOptions) -> dict:
    keys = []
    if options.translation:
        keys.append("translation")
    if options.definition:
        keys.append("definition")
    if options.example:
        keys.append("example")
    if options.level:
        keys.append("level")
    prompt = f"""
You are an English dictionary for intermediate to advanced learners.
    
Word: "{lemma}"
Part of speech: {pos}

Return ONLY valid JSON object.
Allowed keys: {keys}
Do NOT include keys other than the allowed keys.
Do NOT include "word" or "pos".

Requirements:
- translation: concise Traditional Chinese meaning
- definition: ONE clear English definition
- example: ONE natural example sentence
- level: CEFR level A2-C1 (string)
"""
    
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config={"response_mime_type": "application/json"}
    )
    raw = response.text
    print("===GEMINI RAW START ===")
    print(raw)
    print("=== GEMINI RAW END ===")
    return json.loads(response.text)

# --------------------------------
# Routes
# --------------------------------
@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/translate", response_model=TranslateResponse)
def translate(req: TranslateRequest):
    raw = req.text.strip()
    if not raw:
        return TranslateResponse(sentences=[])
    
    parts = split_sentences(raw)

    translations = ai_translate_list(parts, req.target_lang, req.mode)

    results: list[SentencePair] = []

    for i in range(len(parts)):
        results.append(
            SentencePair(
                id=i, 
                original=parts[i], 
                translation=translations[i],
                vocab=extract_vocab(parts[i])
                ))

    return TranslateResponse(sentences=results)

@app.post("/vocab/detail", response_model=VocabDetailResponse)
def vocab_detail(req: VocabDetailRequest):
    return get_vocab_detail(req)

@app.post("/debug/split")
def debug_split(req: TranslateRequest):
    sentences = split_sentences(req.text)
    return {
        "count": len(sentences),
        "sentences": sentences
    }