from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
import os
import spacy

load_dotenv()
nlp = spacy.load("en_core_web_sm")
if "sentencizer" not in nlp.pipe_names:
    nlp.add_pipe("sentencizer")

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

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

class SentencePair(BaseModel):
    original: str
    translation: str

class TranslateResponse(BaseModel):
    sentences: list[SentencePair]

def split_sentences(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    
    doc = nlp(text)
    
    sentences = []

    for sent in doc.sents:
        sentence = sent.text.strip()
        if sentence:
            sentences.append(sentence)
    return sentences

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
        return {"sentences": []}
    
    parts = split_sentences(raw)

    sentences: list[SentencePair] = []
    for original in parts:
        translation = f"[fake] {original}"
        sentences.append(SentencePair(original=original, translation=translation))
    
    return TranslateResponse(sentences=sentences)

@app.post("/debug/split")
def debug_split(req: TranslateRequest):
    sentences = split_sentences(req.text)
    return {
        "count": len(sentences),
        "sentences": sentences
    }