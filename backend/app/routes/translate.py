from fastapi import APIRouter, Depends
from app.models.translate import TranslateRequest, TranslateResponse, SentencePair
from app.services.nlp import split_sentences
from app.services.gemini import ai_translate_list
from app.services.supabase import log_api_usage
from app.core.config import settings
from app.core.auth import require_user

# Router for translation-related endpoints.
router = APIRouter(tags=["translate"])

# Translate incoming text into sentence-level results with vocab extraction.
@router.post("/translate", response_model=TranslateResponse)
def translate(req: TranslateRequest, user: dict = Depends(require_user)):
    """
    Split `req.text` into sentences, translate each via Gemini, and return
    sentence pairs with extracted vocabulary. Returns an empty list for blank input.
    """
    raw = req.text.strip()
    if not raw:
        return TranslateResponse(sentences=[])

    # Split into sentences first to preserve order.
    parts = split_sentences(raw)

    # Call Gemini to translate each sentence.
    translations, usage = ai_translate_list(parts, req.target_lang, req.mode)
    log_api_usage(user["id"], "translate", settings.gemini_model, usage)

    # Build response objects with translations and extracted vocab.
    results: list[SentencePair] = []

    for i in range(len(parts)):
        results.append(
            SentencePair(
                id=i,
                original=parts[i],
                translation=translations[i],
                vocab=[]
                ))

    return TranslateResponse(sentences=results)
