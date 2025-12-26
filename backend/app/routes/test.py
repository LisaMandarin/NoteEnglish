from fastapi import APIRouter
from app.models.translate import TranslateRequest
from app.services.nlp import split_sentences

router = APIRouter(tags=["test"])


@router.get("/health")
def health_check():
    return {"status": "ok"}

@router.post("/debug/split")
def debug_split(req: TranslateRequest):
    sentences = split_sentences(req.text)
    return {
        "count": len(sentences),
        "sentences": sentences
    }
