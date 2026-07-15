import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.routes import link_preview as link_preview_route
from app.services import link_preview as lp

USER = {"id": "user-1"}

OG_HTML = """<!doctype html>
<html><head>
<title>Fallback Title</title>
<meta property="og:title" content="OG Title">
<meta property="og:description" content="OG description here.">
<meta property="og:image" content="/img/cover.png">
<meta property="og:site_name" content="Example Site">
<meta name="description" content="Plain meta description.">
</head><body>hi</body></html>"""

NO_OG_HTML = """<html><head>
<title>Only A Title</title>
<meta name="description" content="Plain meta description.">
</head><body></body></html>"""


def _addrinfo(ip):
    return [(2, 1, 6, "", (ip, 0))]


class ValidateUrlTests(unittest.TestCase):
    def test_non_http_scheme_rejected(self):
        for url in ("javascript:alert(1)", "ftp://example.com/x", "file:///etc/passwd"):
            with self.assertRaises(lp.LinkPreviewError):
                lp._validate_url(url)

    def test_private_ips_rejected(self):
        for ip in ("127.0.0.1", "10.0.0.5", "169.254.1.1", "192.168.1.1", "::1"):
            with patch.object(lp.socket, "getaddrinfo", return_value=_addrinfo(ip)):
                with self.assertRaises(lp.LinkPreviewError):
                    lp._validate_url("https://example.com/page")

    def test_public_ip_allowed(self):
        with patch.object(lp.socket, "getaddrinfo", return_value=_addrinfo("93.184.216.34")):
            parsed = lp._validate_url("https://example.com/page")
        self.assertEqual(parsed.hostname, "example.com")

    def test_unresolvable_host_rejected(self):
        with patch.object(lp.socket, "getaddrinfo", side_effect=OSError):
            with self.assertRaises(lp.LinkPreviewError):
                lp._validate_url("https://nope.invalid/")


class ParsePreviewTests(unittest.TestCase):
    def test_og_tags_win(self):
        res = lp._parse_preview(OG_HTML, "https://example.com/article")
        self.assertEqual(res.title, "OG Title")
        self.assertEqual(res.description, "OG description here.")
        # Relative og:image resolves against the page URL.
        self.assertEqual(res.image, "https://example.com/img/cover.png")
        self.assertEqual(res.site_name, "Example Site")

    def test_falls_back_to_title_and_meta_description(self):
        res = lp._parse_preview(NO_OG_HTML, "https://example.com/")
        self.assertEqual(res.title, "Only A Title")
        self.assertEqual(res.description, "Plain meta description.")
        self.assertIsNone(res.image)
        self.assertIsNone(res.site_name)


class CacheTests(unittest.TestCase):
    def setUp(self):
        lp.PREVIEW_CACHE.clear()

    def test_second_call_hits_cache(self):
        with patch.object(
            lp, "_fetch_html", return_value=(OG_HTML, "https://example.com/a")
        ) as fetch:
            first = lp.get_link_preview("https://example.com/a")
            second = lp.get_link_preview("https://example.com/a")
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(first, second)

    def test_cache_evicts_beyond_cap(self):
        with patch.object(lp, "CACHE_MAX_ENTRIES", 2), patch.object(
            lp, "_fetch_html", return_value=(NO_OG_HTML, "https://example.com/")
        ):
            lp.get_link_preview("https://example.com/1")
            lp.get_link_preview("https://example.com/2")
            lp.get_link_preview("https://example.com/3")
        self.assertEqual(len(lp.PREVIEW_CACHE), 2)


class RouteTests(unittest.TestCase):
    def test_rejected_url_maps_to_422(self):
        with self.assertRaises(HTTPException) as ctx:
            link_preview_route.link_preview(url="file:///etc/passwd", user=USER)
        self.assertEqual(ctx.exception.status_code, 422)

    def test_timeout_maps_to_422(self):
        # urllib timeouts surface as OSError → LinkPreviewError in the service.
        with patch.object(
            link_preview_route,
            "get_link_preview",
            side_effect=lp.LinkPreviewError("Target could not be fetched"),
        ):
            with self.assertRaises(HTTPException) as ctx:
                link_preview_route.link_preview(url="https://slow.example.com/", user=USER)
        self.assertEqual(ctx.exception.status_code, 422)

    def test_unexpected_error_maps_to_502(self):
        with patch.object(
            link_preview_route, "get_link_preview", side_effect=RuntimeError
        ):
            with self.assertRaises(HTTPException) as ctx:
                link_preview_route.link_preview(url="https://example.com/", user=USER)
        self.assertEqual(ctx.exception.status_code, 502)

    def test_ok_returns_preview(self):
        with patch.object(
            link_preview_route,
            "get_link_preview",
            return_value=lp.LinkPreviewResponse(title="T"),
        ):
            res = link_preview_route.link_preview(url="https://example.com/", user=USER)
        self.assertEqual(res.title, "T")
