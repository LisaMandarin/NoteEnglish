from app.models.vocab import CachedVocab, VocabDetailRequest, VocabDetailResponse
from app.services.gemini import ai_fill_vocab_fields

# In-memory cache keyed by lemma|pos to avoid repeated AI calls.
VOCAB_CACHE: dict[str, CachedVocab] = {}

# Fetch vocab details; fill missing fields via Gemini and cache results.
def get_vocab_detail(req: VocabDetailRequest) -> VocabDetailResponse:
    key = f"{req.lemma.lower()}|{req.pos}"
    cached = VOCAB_CACHE.get(key, CachedVocab(lemma=req.lemma, pos=req.pos))

    need_ai = (
        (req.options.translation and not cached.translation)
        or (req.options.definition and not cached.definition)
        or (req.options.example and not cached.example)
        or (req.options.level and not cached.level)
    )

    if need_ai:
        ai_data = ai_fill_vocab_fields(req.lemma, req.pos, req.options)

        ALLOWED_FIELDS = ["translation", "definition", "example", "level"]

        for field, value in ai_data.items():
            if field in ALLOWED_FIELDS:
                setattr(cached, field, value)
        VOCAB_CACHE[key] = cached

    return VocabDetailResponse(
        lemma=req.lemma,
        pos=req.pos,
        translation=cached.translation if req.options.translation else None,
        definition=cached.definition if req.options.definition else None,
        example=cached.example if req.options.example else None,
        level=cached.level if req.options.level else None,
    )
