import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.models.profile import UpdateProfileRequest
from app.routes import profile as profile_route
from app.services import supabase

USER = {"id": "user-1", "email": "lisa@example.com"}

PROFILE_ROW = {
    "id": "user-1",
    "email": "lisa@example.com",
    "display_name": "Lisa",
    "bio": "hi",
    "links": [{"label": "Blog", "url": "https://example.com/blog"}],
    "is_public": True,
}


class FakeRequestJson:
    """Same shape as the fake in test_share_route: consume (method, url_part,
    response) rules in order so repeated endpoints can answer differently."""

    def __init__(self, rules):
        self.rules = list(rules)
        self.calls = []

    def __call__(self, method, url, *, headers=None, payload=None):
        self.calls.append({"method": method, "url": url, "payload": payload})
        for i, (rule_method, url_part, response) in enumerate(self.rules):
            if rule_method == method and url_part in url:
                self.rules.pop(i)
                return response
        raise AssertionError(f"Unexpected request: {method} {url}")


class UpdateProfileValidationTests(unittest.TestCase):
    def _valid_payload(self, **overrides):
        payload = {
            "display_name": "Lisa",
            "bio": "hello",
            "links": [{"label": "Blog", "url": "https://example.com"}],
            "is_public": True,
        }
        payload.update(overrides)
        return payload

    def test_valid_payload_passes(self):
        req = UpdateProfileRequest(**self._valid_payload())
        self.assertEqual(req.display_name, "Lisa")

    def test_bio_over_500_chars_rejected(self):
        with self.assertRaises(ValidationError):
            UpdateProfileRequest(**self._valid_payload(bio="x" * 501))

    def test_more_than_five_links_rejected(self):
        links = [
            {"label": f"L{i}", "url": f"https://example.com/{i}"}
            for i in range(6)
        ]
        with self.assertRaises(ValidationError):
            UpdateProfileRequest(**self._valid_payload(links=links))

    def test_non_http_scheme_rejected(self):
        for url in ("javascript:alert(1)", "ftp://example.com", "data:text/html,x"):
            with self.assertRaises(ValidationError, msg=url):
                UpdateProfileRequest(
                    **self._valid_payload(links=[{"label": "x", "url": url}])
                )

    def test_empty_display_name_rejected(self):
        with self.assertRaises(ValidationError):
            UpdateProfileRequest(**self._valid_payload(display_name=""))

    def test_whitespace_only_display_name_rejected(self):
        with self.assertRaises(ValidationError):
            UpdateProfileRequest(**self._valid_payload(display_name="   "))

    def test_whitespace_only_link_label_rejected(self):
        with self.assertRaises(ValidationError):
            UpdateProfileRequest(
                **self._valid_payload(
                    links=[{"label": " \t ", "url": "https://example.com"}]
                )
            )

    def test_values_are_stripped(self):
        req = UpdateProfileRequest(
            **self._valid_payload(
                display_name="  Lisa  ",
                links=[{"label": "  Blog  ", "url": "https://example.com"}],
            )
        )
        self.assertEqual(req.display_name, "Lisa")
        self.assertEqual(req.links[0].label, "Blog")


class UpdateProfileRouteTests(unittest.TestCase):
    def test_update_serializes_links_and_targets_caller(self):
        req = UpdateProfileRequest(
            display_name="Lisa",
            bio="hi",
            links=[{"label": "Blog", "url": "https://example.com/blog"}],
            is_public=False,
        )
        with patch.object(
            profile_route, "update_profile", return_value=dict(PROFILE_ROW)
        ) as update_mock:
            profile_route.update_profile_route(req, user=USER)

        update_mock.assert_called_once()
        user_id, payload = update_mock.call_args[0]
        self.assertEqual(user_id, "user-1")
        self.assertEqual(payload["display_name"], "Lisa")
        self.assertFalse(payload["is_public"])
        # HttpUrl objects must be dumped to plain JSON-safe strings.
        self.assertIsInstance(payload["links"][0]["url"], str)
        self.assertTrue(payload["links"][0]["url"].startswith("https://example.com"))


class ProfileServiceTests(unittest.TestCase):
    def test_update_profile_patches_by_id(self):
        fake = FakeRequestJson([("PATCH", "profiles", [dict(PROFILE_ROW)])])
        with patch.object(supabase, "_request_json", fake):
            row = supabase.update_profile("user-1", {"display_name": "Lisa"})
        self.assertEqual(row["display_name"], "Lisa")
        self.assertIn("id=eq.user-1", fake.calls[0]["url"])

    def test_update_profile_unknown_user_404(self):
        fake = FakeRequestJson([("PATCH", "profiles", [])])
        with patch.object(supabase, "_request_json", fake):
            with self.assertRaises(HTTPException) as ctx:
                supabase.update_profile("ghost", {"display_name": "x"})
        self.assertEqual(ctx.exception.status_code, 404)

    def test_public_profile_never_selects_email(self):
        public_row = {
            "id": "user-1",
            "display_name": "Lisa",
            "bio": "hi",
            "links": [],
            "is_public": True,
        }
        fake = FakeRequestJson([("GET", "profiles", [dict(public_row)])])
        with patch.object(supabase, "_request_json", fake):
            profile = supabase.get_public_profile("user-1")
        self.assertNotIn("email", fake.calls[0]["url"])
        self.assertNotIn("email", profile)
        # is_public is an owner-only detail; the public shape drops it.
        self.assertNotIn("is_public", profile)

    def test_public_profile_unknown_user_404(self):
        fake = FakeRequestJson([("GET", "profiles", [])])
        with patch.object(supabase, "_request_json", fake):
            with self.assertRaises(HTTPException) as ctx:
                supabase.get_public_profile("ghost")
        self.assertEqual(ctx.exception.status_code, 404)

    def test_private_profile_404_like_missing(self):
        private_row = {
            "id": "user-1",
            "display_name": "Lisa",
            "bio": "hi",
            "links": [],
            "is_public": False,
        }
        fake = FakeRequestJson([("GET", "profiles", [private_row])])
        with patch.object(supabase, "_request_json", fake):
            with self.assertRaises(HTTPException) as ctx:
                supabase.get_public_profile("user-1")
        self.assertEqual(ctx.exception.status_code, 404)


class SharedSessionCreatorIdTests(unittest.TestCase):
    SESSION_ROW = {
        "id": "s-1",
        "user_id": "owner-1",
        "title": "T",
        "source_text": "text",
        "created_at": "c",
        "updated_at": "u",
    }
    DETAIL = {"text": "text", "sentences": [], "session": {"id": "s-1"}}

    def _shared_detail(self, creator_row):
        fake = FakeRequestJson([
            ("GET", "study_sessions", [dict(self.SESSION_ROW)]),
            ("GET", "shared_favorites", []),
            ("GET", "profiles", creator_row),
        ])
        token = "00000000-0000-0000-0000-000000000e2e"
        with (
            patch.object(supabase, "_request_json", fake),
            patch.object(
                supabase, "get_session_detail", return_value=dict(self.DETAIL)
            ),
        ):
            return supabase.get_shared_session("viewer-1", token)

    def test_public_creator_exposes_creator_id(self):
        result = self._shared_detail(
            [{"display_name": "Lisa", "is_public": True}]
        )
        self.assertEqual(result["creator_name"], "Lisa")
        self.assertEqual(result["creator_id"], "owner-1")

    def test_private_creator_hides_creator_id(self):
        result = self._shared_detail(
            [{"display_name": "Lisa", "is_public": False}]
        )
        self.assertEqual(result["creator_name"], "Lisa")
        self.assertIsNone(result["creator_id"])

    def test_missing_creator_profile_hides_creator_id(self):
        result = self._shared_detail([])
        self.assertIsNone(result["creator_name"])
        self.assertIsNone(result["creator_id"])
