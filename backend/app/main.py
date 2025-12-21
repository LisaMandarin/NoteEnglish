from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="NoteEnglish API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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

# --------------------------------
# Routes
# --------------------------------
@app.get("/health")
def health_chech():
    return {"status": "ok"}

@app.post("/translate", response_model=TranslateResponse)
def translate(req: TranslateRequest):
    """
    Fake translate for now:
    - Split input text into sentences (very simple)
    - Return a mocked translation
    """
    raw = req.text.strip()
    if not raw:
        return {"sentences": []}
    
    text = raw.replace("\n", " ")
    chunks = text.split(".")

    parts = []
    for p in chunks:
        cleaned = p.strip()
        if cleaned:
            parts.append(cleaned)

    sentences: list[SentencePair] = []
    for p in parts:
        original = p + "."
        translation = f"[fake] {original}"
        sentences.append(SentencePair(original=original, translation=translation))
    
    return TranslateResponse(sentences=sentences)