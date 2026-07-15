from pydantic import BaseModel


class LinkPreviewResponse(BaseModel):
    """OG-meta preview of an external page linked from a sentence note.

    Every field is optional: pages without OG tags (or that time out) still
    return 200 with whatever could be extracted; the client falls back to
    showing just the domain.
    """

    title: str | None = None
    description: str | None = None
    image: str | None = None
    site_name: str | None = None
