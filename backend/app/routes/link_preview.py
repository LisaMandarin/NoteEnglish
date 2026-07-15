from fastapi import APIRouter, Depends, Query

from app.core.auth import require_user
from app.models.link_preview import LinkPreviewResponse

# Router for note link previews. Requires a Bearer token like every other
# route; does NOT use Gemini (not an AI route).
router = APIRouter(tags=["link-preview"])


# Fetch the target page's OG meta tags and return a preview card payload.
# SSRF-guarded: http(s) only, public IPs only, 5s timeout, ~512KB read cap,
# text/html only; results go through an in-memory TTL cache.
@router.get("/link-preview", response_model=LinkPreviewResponse)
async def link_preview(
    url: str = Query(..., description="http(s) URL to preview"),
    user: dict = Depends(require_user),
) -> LinkPreviewResponse:
    raise NotImplementedError  # contract only — implementation lands in the next commit
