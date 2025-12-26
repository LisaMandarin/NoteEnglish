from fastapi import APIRouter
from app.models.vocab import VocabDetailRequest, VocabDetailResponse
from app.services.vocab_cache import get_vocab_detail

router = APIRouter(tags=["vocab"])

@router.post("/vocab/detail", response_model=VocabDetailResponse)
def vocab_detail(req: VocabDetailRequest):
    return get_vocab_detail(req)
