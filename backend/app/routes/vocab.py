from fastapi import APIRouter, Depends, HTTPException
from google.genai.errors import APIError
from app.models.vocab import VocabLookupRequest, VocabLookupResponse
from app.services.vocab_cache import get_vocab_lookup
from app.core.auth import require_user

router = APIRouter(tags=["vocab"])

# Look up a word in context; AI determines lemma/pos and fills requested fields.
@router.post("/vocab/lookup", response_model=VocabLookupResponse)
def vocab_lookup(req: VocabLookupRequest, _user: dict = Depends(require_user)):
    try:
        return get_vocab_lookup(req, _user["id"])
    except APIError as e:
        msg = str(e)
        if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
            raise HTTPException(status_code=429, detail="AI 查詢額度已用盡，請稍後再試。")
        if "UNAVAILABLE" in msg or "503" in msg:
            raise HTTPException(status_code=503, detail="AI 服務暫時忙碌，請稍後再試。")
        raise HTTPException(status_code=502, detail="AI 服務發生錯誤，請稍後再試。")
