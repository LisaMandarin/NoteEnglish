from fastapi import APIRouter, Depends

from app.core.auth import require_admin
from app.services.supabase import get_usage_stats, list_all_users

router = APIRouter()


@router.get("/admin/check")
def admin_check(user: dict = Depends(require_admin)) -> dict:
    return {"ok": True, "user_id": user["id"]}


@router.get("/admin/users")
def get_users(
    page: int = 1,
    per_page: int = 50,
    user: dict = Depends(require_admin),
) -> list[dict]:
    return list_all_users(page=page, per_page=per_page)


@router.get("/admin/users/{target_user_id}/usage")
def get_user_usage(
    target_user_id: str,
    _admin: dict = Depends(require_admin),
) -> dict:
    return get_usage_stats(target_user_id)
