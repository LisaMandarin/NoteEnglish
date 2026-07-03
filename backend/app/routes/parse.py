import logging

from fastapi import APIRouter, Depends

from app.models.parse import ParseRequest, ParseResponse
from app.services.structure import get_structure
from app.services.supabase import log_api_usage
from app.core.config import settings
from app.core.auth import require_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["parse"])


# Analyze a sentence into a five-pattern constituent tree with Gemini, served
# through a read-through cache (in-memory -> Supabase). A fresh AI call returns
# usage, which we bill/log; a cache hit returns usage=None and bills nothing, so
# a given sentence is analyzed at most once ever. Incomplete input raises 422
# before Gemini is called; an unusable AI result raises 502 so the UI can retry.
@router.post("/parse", response_model=ParseResponse)
def parse(req: ParseRequest, user: dict = Depends(require_user)):
    structure, usage = get_structure(req.sentence)
    if usage is not None:
        log_api_usage(user["id"], "parse", settings.gemini_model, usage)
    return ParseResponse(structure=structure)
