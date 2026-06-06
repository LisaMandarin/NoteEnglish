from fastapi import APIRouter, Depends
from app.core.auth import require_user
from app.services.supabase import get_usage_stats

router = APIRouter(tags=["usage"])


@router.get("/usage")
def usage(user: dict = Depends(require_user)) -> dict:
    return get_usage_stats(user["id"])
