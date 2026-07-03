import hashlib
import re

from app.core.config import settings
from app.services.gemini import PARSE_PROMPT_VERSION, ai_analyze_structure
from app.services.supabase import get_cached_parse, save_parse

# In-memory L1 cache in front of Supabase (L2), keyed by (sentence_hash,
# prompt_version). Avoids the network round-trip for hot sentences within a
# process; resets on restart (Supabase remains the durable cache).
_MEM_CACHE: dict[tuple[str, int], dict] = {}


def _normalize(sentence: str) -> str:
    """Collapse whitespace so trivially-different spacing shares one cache entry."""
    return re.sub(r"\s+", " ", sentence).strip()


def _hash(normalized: str) -> str:
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def get_structure(sentence: str) -> tuple[dict | None, dict | None]:
    """Return (structure, usage) for a sentence.

    - structure is None for an empty/whitespace sentence (nothing to analyze).
    - usage is None on a cache hit (no AI call was made, so nothing to bill/log);
      it is a token-usage dict when a fresh Gemini call happened.

    Read-through cache: memory L1 -> Supabase L2 -> Gemini, writing back on miss.
    Propagates HTTPException(502) from the AI layer so the route can surface it."""
    normalized = _normalize(sentence)
    if not normalized:
        return None, None

    key = (_hash(normalized), PARSE_PROMPT_VERSION)

    cached = _MEM_CACHE.get(key)
    if cached is not None:
        return cached, None

    stored = get_cached_parse(key[0], key[1])
    if stored is not None:
        _MEM_CACHE[key] = stored
        return stored, None

    structure, usage = ai_analyze_structure(normalized)
    _MEM_CACHE[key] = structure
    save_parse(
        sentence_hash=key[0],
        prompt_version=key[1],
        model=settings.gemini_model,
        sentence=normalized,
        structure=structure,
    )
    return structure, usage
