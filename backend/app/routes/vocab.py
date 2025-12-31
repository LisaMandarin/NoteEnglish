from fastapi import APIRouter
from app.models.vocab import VocabDetailRequest, VocabDetailResponse
from app.services.vocab_cache import get_vocab_detail

# Router for vocabulary detail lookups with caching.
router = APIRouter(tags=["vocab"])

# Return vocab details (translation/definition/etc) using cached AI results when available.
@router.post("/vocab/detail", response_model=VocabDetailResponse)
def vocab_detail(req: VocabDetailRequest):
    return get_vocab_detail(req)
