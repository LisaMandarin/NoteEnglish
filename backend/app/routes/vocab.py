from fastapi import APIRouter, Depends
from app.models.vocab import VocabDetailRequest, VocabDetailResponse
from app.services.vocab_cache import get_vocab_detail
from app.core.auth import require_user

# Router for vocabulary detail lookups with caching.
router = APIRouter(tags=["vocab"])

# Return vocab details (translation/definition/etc) using cached AI results when available.
@router.post("/vocab/detail", response_model=VocabDetailResponse)
def vocab_detail(req: VocabDetailRequest, _user: dict = Depends(require_user)):
    return get_vocab_detail(req)
