import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import require_user
from app.models.link_preview import LinkPreviewResponse
from app.services.link_preview import LinkPreviewError, get_link_preview

logger = logging.getLogger(__name__)

# Router for note link previews. Requires a Bearer token like every other
# route; does NOT use Gemini (not an AI route).
router = APIRouter(tags=["link-preview"])


# Fetch the target page's OG meta tags and return a preview card payload.
# SSRF-guarded in the service: http(s) only, public IPs only (each redirect
# hop re-checked and the connection pinned to the validated IP), 5s timeout,
# 512KB read cap, text/html only; results go through an in-memory TTL cache.
# Sync def on purpose — the blocking http.client fetch runs in FastAPI's
# threadpool instead of the event loop.
@router.get("/link-preview", response_model=LinkPreviewResponse)
def link_preview(
    url: str = Query(..., description="http(s) URL to preview"),
    user: dict = Depends(require_user),
) -> LinkPreviewResponse:
    try:
        return get_link_preview(url)
    except LinkPreviewError as exc:
        # Rejected or unfetchable target: the client falls back to a
        # domain-only card, so a 4xx with the reason is all it needs.
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("link preview failed for url=%s", url)
        raise HTTPException(status_code=502, detail="Link preview failed")
