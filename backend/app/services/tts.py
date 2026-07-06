import logging
from collections import OrderedDict

import edge_tts

from app.core.config import settings

logger = logging.getLogger(__name__)

# In-memory LRU cache keyed by voice|text so repeated plays don't re-synthesize.
# ~50KB per sentence; 300 entries keeps the cache under ~20MB on Render Starter.
_MAX_ENTRIES = 300
AUDIO_CACHE: OrderedDict[str, bytes] = OrderedDict()


async def synthesize_speech(text: str) -> bytes:
    """Return MP3 audio for the given text, using the cache when possible."""
    key = f"{settings.tts_voice}|{text}"
    cached = AUDIO_CACHE.get(key)
    if cached is not None:
        AUDIO_CACHE.move_to_end(key)
        logger.info("tts cache HIT len=%d", len(text))
        return cached

    logger.info("tts cache MISS len=%d", len(text))
    communicate = edge_tts.Communicate(text, settings.tts_voice)
    audio = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]

    if not audio:
        raise RuntimeError("edge-tts returned no audio")

    AUDIO_CACHE[key] = audio
    if len(AUDIO_CACHE) > _MAX_ENTRIES:
        AUDIO_CACHE.popitem(last=False)
    return audio
