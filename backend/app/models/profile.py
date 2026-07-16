from pydantic import BaseModel, Field, HttpUrl, field_validator


def _stripped_non_blank(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("must not be blank")
    return value


class ProfileLink(BaseModel):
    label: str = Field(min_length=1, max_length=40)
    # HttpUrl only accepts http(s) schemes, so javascript:/data: URLs are
    # rejected at validation time.
    url: HttpUrl

    # The API enforces its own invariant — whitespace-only labels must not
    # rely on the frontend form to be rejected.
    _label_not_blank = field_validator("label")(_stripped_non_blank)


class UpdateProfileRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)
    bio: str = Field(default="", max_length=500)
    links: list[ProfileLink] = Field(default_factory=list, max_length=5)
    is_public: bool = True

    _display_name_not_blank = field_validator("display_name")(_stripped_non_blank)


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
