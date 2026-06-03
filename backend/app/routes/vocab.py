from fastapi import APIRouter, Depends
from app.models.vocab import VocabLookupRequest, VocabLookupResponse
from app.services.vocab_cache import get_vocab_lookup
from app.core.auth import require_user

router = APIRouter(tags=["vocab"])

# Look up a word in context; AI determines lemma/pos and fills requested fields.
@router.post("/vocab/lookup", response_model=VocabLookupResponse)
def vocab_lookup(req: VocabLookupRequest, _user: dict = Depends(require_user)):
    return get_vocab_lookup(req, _user["id"])
