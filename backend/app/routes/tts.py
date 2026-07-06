import logging

from fastapi import APIRouter, Depends, HTTPException, Response

from app.models.tts import TtsRequest
from app.services.tts import synthesize_speech
from app.core.auth import require_user

logger = logging.getLogger(__name__)

# Router for text-to-speech endpoints.
router = APIRouter(tags=["tts"])

# Synthesize the given text into MP3 audio via edge-tts.
@router.post("/tts")
async def tts(req: TtsRequest, user: dict = Depends(require_user)) -> Response:
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is empty")

    try:
        audio = await synthesize_speech(text)
    except Exception:
        logger.exception("tts synthesis failed")
        raise HTTPException(status_code=502, detail="Speech synthesis failed")

    return Response(content=audio, media_type="audio/mpeg")
