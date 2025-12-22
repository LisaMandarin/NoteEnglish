from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
import os
import spacy
import json
from google import genai
import re

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

class SentencePair(BaseModel):
    original: str
    translation: str

class TranslateResponse(BaseModel):
    sentences: list[SentencePair]

# --------------------------------
# Routes
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


def ai_translate_list(sentences: list[str], target_lang: str = "zh-TW") -> list[str]:
    if not sentences:
        return []
    
    prompt = (
        f"Translate each sentence into {target_lang}. "
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

    translations = ai_translate_list(parts, req.target_lang)

    results: list[SentencePair] = []

    for i in range(len(parts)):
        results.append(SentencePair(original=parts[i], translation=translations[i]))

    return TranslateResponse(sentences=results)

@app.post("/debug/split")
def debug_split(req: TranslateRequest):
    sentences = split_sentences(req.text)
    return {
        "count": len(sentences),
        "sentences": sentences
    }