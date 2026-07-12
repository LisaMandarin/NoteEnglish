import ssl
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.services import supabase


class SupabaseRequestTests(unittest.TestCase):
    def test_request_uses_packaged_ca_bundle(self):
        response = MagicMock()
        response.read.return_value = b'{"ok": true}'
        response.__enter__.return_value = response

        with patch.object(supabase.request, "urlopen", return_value=response) as urlopen:
            result = supabase._request_json("GET", "https://example.test/resource")

        self.assertEqual(result, {"ok": True})
        self.assertIs(urlopen.call_args.kwargs["context"], supabase._SSL_CONTEXT)
        self.assertEqual(
            urlopen.call_args.kwargs["timeout"],
            supabase._REQUEST_TIMEOUT_SECONDS,
        )
        self.assertEqual(supabase._SSL_CONTEXT.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(supabase._SSL_CONTEXT.check_hostname)


class GetAuthenticatedUserTests(unittest.TestCase):
    """Supabase rejects stale/revoked tokens (e.g. after a global sign-out on
    another device) with 401/403; those must normalize to 401 session_expired
    so the frontend's recovery path signs the client out instead of wedging."""

    def _call_with_upstream_error(self, status: int) -> HTTPException:
        def raise_http(*_args, **_kwargs):
            raise HTTPException(
                status_code=status,
                detail="Session from session_id claim in JWT does not exist",
            )

        with (
            patch.object(supabase, "_require_supabase_config"),
            patch.object(supabase, "_request_json", side_effect=raise_http),
        ):
            with self.assertRaises(HTTPException) as ctx:
                supabase.get_authenticated_user("Bearer some-token")
        return ctx.exception

    def test_upstream_401_and_403_normalize_to_session_expired(self):
        for status in (401, 403):
            with self.subTest(status=status):
                exc = self._call_with_upstream_error(status)
                self.assertEqual(exc.status_code, 401)
                self.assertEqual(exc.detail, "session_expired")

    def test_missing_token_keeps_original_detail(self):
        with patch.object(supabase, "_require_supabase_config"):
            with self.assertRaises(HTTPException) as ctx:
                supabase.get_authenticated_user(None)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Missing bearer token.")

    def test_upstream_server_errors_pass_through(self):
        exc = self._call_with_upstream_error(502)
        self.assertEqual(exc.status_code, 502)


class SessionGroupTests(unittest.TestCase):
    def test_create_group_rejects_blank_name(self):
        with self.assertRaises(HTTPException) as ctx:
            supabase.create_session_group("u1", "   ")
        self.assertEqual(ctx.exception.status_code, 422)

    def test_set_group_rejects_group_not_owned(self):
        # Ownership check returns empty → the group isn't the caller's → 404,
        # and the session PATCH must never run.
        with patch.object(supabase, "_request_json", return_value=[]) as rj:
            with self.assertRaises(HTTPException) as ctx:
                supabase.set_session_group("u1", "s1", "g-other")
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(rj.call_count, 1)

    def test_set_group_to_none_skips_ownership_check(self):
        # group_id=None means "ungroup" — no group to verify, straight to PATCH.
        with patch.object(
            supabase, "_request_json", return_value=[{"id": "s1", "group_id": None}]
        ) as rj:
            result = supabase.set_session_group("u1", "s1", None)
        self.assertIsNone(result["group_id"])
        self.assertEqual(rj.call_count, 1)
        self.assertEqual(rj.call_args.args[0], "PATCH")

    def test_set_group_owned_assigns(self):
        with patch.object(
            supabase,
            "_request_json",
            side_effect=[[{"id": "g1"}], [{"id": "s1", "group_id": "g1"}]],
        ):
            result = supabase.set_session_group("u1", "s1", "g1")
        self.assertEqual(result["group_id"], "g1")


if __name__ == "__main__":
    unittest.main()
