import base64

from fastapi import APIRouter, Depends, HTTPException
from app.models.ocr import OcrRequest, OcrResponse
from app.services.gemini import ai_ocr_image
from app.services.supabase import log_api_usage
from app.core.config import settings
from app.core.auth import require_user

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024

# Router for image-to-text (OCR) endpoints.
router = APIRouter(tags=["ocr"])

# Extract text from an uploaded image via Gemini vision.
@router.post("/ocr", response_model=OcrResponse)
def ocr(req: OcrRequest, user: dict = Depends(require_user)):
    """
    Decode the base64 image, run OCR through Gemini vision, log token usage,
    and return the extracted text.
    """
    if req.mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    try:
        image_bytes = base64.b64decode(req.image_base64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image data")

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large")

    text, usage = ai_ocr_image(image_bytes, req.mime_type)
    log_api_usage(user["id"], "ocr", settings.gemini_model, usage)

    return OcrResponse(text=text)
