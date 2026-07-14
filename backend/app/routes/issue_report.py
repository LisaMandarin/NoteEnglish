from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import require_user
from app.models.issue_report import IssueReportRequest
from app.services.mailer import send_email

router = APIRouter(tags=["issue-report"])


@router.post("/issue-report")
def submit_issue_report(req: IssueReportRequest, user: dict = Depends(require_user)):
    reporter_email = user.get("email") or "unknown"

    lines = [
        f"Reporter: {reporter_email}",
        f"Severity: {req.severity or 'Not specified'}",
    ]
    if req.title:
        lines.append(f"Title: {req.title}")
    lines.append("")
    lines.append(req.description)

    try:
        send_email("句句通 問題回報", "\n".join(lines))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to send issue report: {exc}") from exc

    return {"ok": True}
