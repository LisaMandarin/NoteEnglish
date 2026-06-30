import ssl
import unittest
from unittest.mock import MagicMock, patch

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


if __name__ == "__main__":
    unittest.main()
