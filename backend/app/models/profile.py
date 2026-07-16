from pydantic import BaseModel, Field, HttpUrl


class ProfileLink(BaseModel):
    label: str = Field(min_length=1, max_length=40)
    # HttpUrl only accepts http(s) schemes, so javascript:/data: URLs are
    # rejected at validation time.
    url: HttpUrl


class UpdateProfileRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)
    bio: str = Field(default="", max_length=500)
    links: list[ProfileLink] = Field(default_factory=list, max_length=5)
    is_public: bool = True


class MyProfile(BaseModel):
    """Owner-only view — the only profile shape that carries email/is_public."""

    id: str
    email: str | None = None
    display_name: str | None = None
    bio: str | None = None
    links: list[ProfileLink] = Field(default_factory=list)
    is_public: bool = True


class PublicProfile(BaseModel):
    """What any logged-in user may see. Never includes email."""

    id: str
    display_name: str | None = None
    bio: str | None = None
    links: list[ProfileLink] = Field(default_factory=list)
