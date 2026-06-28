import logging

from fastapi import APIRouter, Depends, HTTPException

from app.models.parse import ParseRequest, ParseResponse
from app.services.nlp import cache_parse, parse_dependencies
from app.services.gemini import ai_reparse_dependencies
from app.services.supabase import log_api_usage
from app.core.config import settings
from app.core.auth import require_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["parse"])


# Dependency-parse a single sentence. spaCy runs locally first (deterministic, no
# AI cost); only when that parse looks unreliable do we fall back to Gemini to
# re-assign the relations, then cache the fix so the fallback bills at most once.
@router.post("/parse", response_model=ParseResponse)
def parse(req: ParseRequest, user: dict = Depends(require_user)):
    result = parse_dependencies(req.sentence)

    if not result["reliable"] and result["tokens"]:
        try:
            tokens, usage = ai_reparse_dependencies(result["tokens"])
            log_api_usage(user["id"], "parse", settings.gemini_model, usage)
            cache_parse(req.sentence, tokens, reliable=True)
            result = {"tokens": tokens, "reliable": True}
        except HTTPException as e:
            # Gemini fallback failed — keep spaCy's parse and let the UI warn.
            logger.warning("Gemini reparse fallback failed: %s", e.detail)

    return ParseResponse(**result)
