from fastapi import APIRouter
from app.models.translate import TranslateRequest, TranslateResponse, SentencePair
from app.services.nlp import split_sentences, extract_vocab
from app.services.gemini import ai_translate_list

router = APIRouter(tags=["translate"])

@router.post("/translate", response_model=TranslateResponse)
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
