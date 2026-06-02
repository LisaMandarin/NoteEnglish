import logging

from app.models.vocab import CachedLookup, VocabLookupRequest, VocabLookupResponse, VocabOptions
from app.services.gemini import ai_lookup_word, normalize_pos

logger = logging.getLogger(__name__)

# In-memory cache keyed by sentence_id|word_index to avoid repeated AI calls.
LOOKUP_CACHE: dict[str, CachedLookup] = {}

def get_vocab_lookup(req: VocabLookupRequest) -> VocabLookupResponse:
    session_prefix = req.session_id if req.session_id else "unsaved"
    key = f"{session_prefix}|{req.sentence_id}|{req.word_index}"
    cached = LOOKUP_CACHE.get(key)

    missing = VocabOptions(
        translation=req.options.translation and (cached is None or not cached.translation),
        definition=req.options.definition and (cached is None or not cached.definition),
        example=req.options.example and (cached is None or not cached.example),
        level=req.options.level and (cached is None or not cached.level),
    )
    need_ai = cached is None or any([missing.translation, missing.definition, missing.example, missing.level])

    if need_ai:
        if cached is None:
            logger.info("cache MISS key=%s word=%r", key, req.selected_text)
        else:
            missing_fields = [f for f in ["translation", "definition", "example", "level"] if getattr(missing, f)]
            logger.info("cache PARTIAL key=%s word=%r missing=%s", key, req.selected_text, missing_fields)

        ai_data = ai_lookup_word(req.selected_text, req.sentence, missing)

        if cached is None:
            cached = CachedLookup(
                sentence=req.sentence,
                text=ai_data.get("text") or req.selected_text,
                lemma=ai_data.get("lemma") or req.selected_text.lower(),
                pos=normalize_pos(ai_data.get("pos") or ""),
            )

        for field in ["translation", "definition", "example", "level"]:
            value = ai_data.get(field)
            if value:
                setattr(cached, field, value)

        LOOKUP_CACHE[key] = cached
        logger.debug("cache SET key=%s size=%d", key, len(LOOKUP_CACHE))
    else:
        logger.info("cache HIT key=%s word=%r", key, req.selected_text)

    return VocabLookupResponse(
        text=cached.text,
        lemma=cached.lemma,
        pos=cached.pos,
        translation=cached.translation if req.options.translation else None,
        definition=cached.definition if req.options.definition else None,
        example=cached.example if req.options.example else None,
        level=cached.level if req.options.level else None,
    )
