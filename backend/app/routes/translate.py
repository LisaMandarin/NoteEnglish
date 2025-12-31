from fastapi import APIRouter
from app.models.translate import TranslateRequest, TranslateResponse, SentencePair
from app.services.nlp import split_sentences, extract_vocab
from app.services.gemini import ai_translate_list

# Router for translation-related endpoints.
router = APIRouter(tags=["translate"])

# Translate incoming text into sentence-level results with vocab extraction.
@router.post("/translate", response_model=TranslateResponse)
def translate(req: TranslateRequest):
    raw = req.text.strip()
    if not raw:
        return TranslateResponse(sentences=[])
    
    # Split into sentences first to preserve order.
    parts = split_sentences(raw)

    # Call Gemini to translate each sentence.
    translations = ai_translate_list(parts, req.target_lang, req.mode)

    # Build response objects with translations and extracted vocab.
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
