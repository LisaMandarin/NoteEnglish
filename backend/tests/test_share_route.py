import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.services import supabase

OWNER = "owner-1"
VIEWER = "viewer-1"
TOKEN = "8b2e6f0a-1d3c-4e5f-9a7b-2c4d6e8f0a1b"


class FakeRequestJson:
    """Replaces supabase._request_json. Matches each call against a queue of
    (method, url_substring, response) rules, consuming the first hit so the
    same endpoint can answer differently across successive calls."""

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


class CreateShareTokenTests(unittest.TestCase):
    def test_generates_token_once_then_reuses_it(self):
        fake = FakeRequestJson([
            ("GET", "study_sessions", [{"id": "s-1", "share_token": None}]),
            ("PATCH", "study_sessions", None),
            ("GET", "study_sessions", [{"id": "s-1", "share_token": "existing-token"}]),
        ])
        with patch.object(supabase, "_request_json", fake):
            first = supabase.create_share_token(OWNER, "s-1")
            second = supabase.create_share_token(OWNER, "s-1")

        self.assertTrue(first["share_token"])
        patch_call = fake.calls[1]
        self.assertEqual(patch_call["payload"], {"share_token": first["share_token"]})
        # Sharing must not touch updated_at (it would reorder the session list).
        self.assertNotIn("updated_at", patch_call["payload"])
        self.assertEqual(second["share_token"], "existing-token")

    def test_non_owner_gets_404(self):
        fake = FakeRequestJson([("GET", "study_sessions", [])])
        with patch.object(supabase, "_request_json", fake):
            with self.assertRaises(HTTPException) as ctx:
                supabase.create_share_token("someone-else", "s-1")
        self.assertEqual(ctx.exception.status_code, 404)


class RevokeShareTokenTests(unittest.TestCase):
    def test_revoke_sets_token_null(self):
        fake = FakeRequestJson([("PATCH", "study_sessions", [{"id": "s-1"}])])
        with patch.object(supabase, "_request_json", fake):
            supabase.revoke_share_token(OWNER, "s-1")
        self.assertEqual(fake.calls[0]["payload"], {"share_token": None})

    def test_non_owner_gets_404(self):
        fake = FakeRequestJson([("PATCH", "study_sessions", [])])
        with patch.object(supabase, "_request_json", fake):
            with self.assertRaises(HTTPException) as ctx:
                supabase.revoke_share_token("someone-else", "s-1")
        self.assertEqual(ctx.exception.status_code, 404)


class SharedSessionLookupTests(unittest.TestCase):
    def test_unknown_or_revoked_token_404(self):
        fake = FakeRequestJson([("GET", "study_sessions", [])])
        with patch.object(supabase, "_request_json", fake):
            with self.assertRaises(HTTPException) as ctx:
                supabase._get_shared_session_row(TOKEN)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_malformed_token_404_without_any_request(self):
        fake = FakeRequestJson([])
        with patch.object(supabase, "_request_json", fake):
            with self.assertRaises(HTTPException) as ctx:
                supabase._get_shared_session_row("not-a-uuid")
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(fake.calls, [])

    def test_get_shared_session_marks_favorite_and_creator(self):
        session_row = {
            "id": "s-1",
            "user_id": OWNER,
            "title": "T",
            "source_text": "text",
            "created_at": "c",
            "updated_at": "u",
        }
        fake = FakeRequestJson([
            ("GET", "study_sessions", [session_row]),
            ("GET", "shared_favorites", [{"session_id": "s-1"}]),
            ("GET", "profiles", [{"display_name": "Lisa"}]),
        ])
        detail = {"text": "text", "sentences": [], "session": {"id": "s-1"}}
        with (
            patch.object(supabase, "_request_json", fake),
            patch.object(supabase, "get_session_detail", return_value=dict(detail)) as detail_mock,
        ):
            result = supabase.get_shared_session(VIEWER, TOKEN)

        # The detail is loaded with the OWNER's id — the viewer owns nothing here.
        detail_mock.assert_called_once_with(OWNER, "s-1")
        self.assertTrue(result["is_favorited"])
        self.assertEqual(result["creator_name"], "Lisa")


class FavoritesTests(unittest.TestCase):
    def test_list_filters_out_unshared_sessions(self):
        fake = FakeRequestJson([
            (
                "GET",
                "shared_favorites",
                [
                    {"session_id": "s-shared", "created_at": "2026-07-09T01:00:00Z"},
                    {"session_id": "s-revoked", "created_at": "2026-07-08T01:00:00Z"},
                ],
            ),
            # The in.() query asks for both, but share_token=not.is.null only
            # returns the still-shared one.
            (
                "GET",
                "study_sessions",
                [
                    {
                        "id": "s-shared",
                        "user_id": OWNER,
                        "title": "",
                        "source_text": "First line\nrest",
                        "share_token": TOKEN,
                    }
                ],
            ),
            ("GET", "profiles", [{"id": OWNER, "display_name": "Lisa"}]),
        ])
        with patch.object(supabase, "_request_json", fake):
            result = supabase.list_favorites(VIEWER)

        self.assertEqual(len(result["items"]), 1)
        item = result["items"][0]
        self.assertEqual(item["session_id"], "s-shared")
        self.assertEqual(item["title"], "First line")  # falls back to first line
        self.assertEqual(item["creator_name"], "Lisa")
        self.assertEqual(item["share_token"], TOKEN)
        self.assertEqual(item["favorited_at"], "2026-07-09T01:00:00Z")

    def test_empty_favorites_short_circuits(self):
        fake = FakeRequestJson([("GET", "shared_favorites", [])])
        with patch.object(supabase, "_request_json", fake):
            result = supabase.list_favorites(VIEWER)
        self.assertEqual(result, {"items": []})
        self.assertEqual(len(fake.calls), 1)

    def test_add_favorite_upserts_resolved_session(self):
        fake = FakeRequestJson([
            ("GET", "study_sessions", [{"id": "s-1", "user_id": OWNER}]),
            ("POST", "shared_favorites", None),
        ])
        with patch.object(supabase, "_request_json", fake):
            supabase.add_favorite(VIEWER, TOKEN)
        self.assertEqual(
            fake.calls[1]["payload"], {"user_id": VIEWER, "session_id": "s-1"}
        )


class ForkTests(unittest.TestCase):
    def test_fork_saves_copy_under_caller(self):
        fake = FakeRequestJson([
            ("GET", "study_sessions", [{"id": "s-1", "user_id": OWNER}]),
        ])
        detail = {
            "text": "article text",
            "sentences": [{"id": 0, "original": "a", "translation": "b", "vocab": [], "note": ""}],
            "session": {"id": "s-1"},
        }
        saved = {"saved_at": "now", "session": {"id": "s-new"}}
        with (
            patch.object(supabase, "_request_json", fake),
            patch.object(supabase, "get_session_detail", return_value=detail),
            patch.object(supabase, "save_session", return_value=saved) as save_mock,
        ):
            result = supabase.fork_shared_session(VIEWER, TOKEN)

        # New session: caller's user_id, no session_id (never overwrites).
        save_mock.assert_called_once_with(VIEWER, "article text", detail["sentences"], None)
        self.assertEqual(result["session"]["id"], "s-new")
