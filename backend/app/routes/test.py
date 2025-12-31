from fastapi import APIRouter
from app.models.translate import TranslateRequest
from app.services.nlp import split_sentences

# Lightweight router for health and debugging endpoints.
router = APIRouter(tags=["test"])

# Health endpoint for uptime checks.
@router.get("/health")
def health_check():
    return {"status": "ok"}

# Debug endpoint to view how text is sentence-split by spaCy.
@router.post("/debug/split")
def debug_split(req: TranslateRequest):
    sentences = split_sentences(req.text)
    return {
        "count": len(sentences),
        "sentences": sentences
    }
