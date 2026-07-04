from pydantic import BaseModel


class IssueReportRequest(BaseModel):
    title: str | None = None
    severity: str | None = None
    description: str
