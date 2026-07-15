import ipaddress
import logging
import socket
import ssl
import time
from html.parser import HTMLParser
from urllib import parse, request

import certifi

from app.models.link_preview import LinkPreviewResponse

logger = logging.getLogger(__name__)

# In-memory TTL cache keyed by URL (vocab_cache pattern: resets on restart).
PREVIEW_CACHE: dict[str, tuple[float, LinkPreviewResponse]] = {}
CACHE_TTL_SECONDS = 3600
CACHE_MAX_ENTRIES = 256

FETCH_TIMEOUT_SECONDS = 5
# Only the head of the document is needed for meta tags.
MAX_READ_BYTES = 512 * 1024
MAX_REDIRECTS = 3
USER_AGENT = "NoteEnglishLinkPreview/1.0 (+https://noteenglish.app)"

_SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


class LinkPreviewError(Exception):
    """URL rejected or unfetchable; the route maps this to a 4xx."""


def _reject_non_public_host(host: str) -> None:
    """SSRF guard: resolve the hostname and refuse anything that isn't a
    public unicast address (loopback, RFC1918, link-local, reserved, …)."""
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError as exc:
        raise LinkPreviewError("Host could not be resolved") from exc

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            raise LinkPreviewError("URL resolves to a non-public address")


def _validate_url(url: str) -> parse.ParseResult:
    parsed = parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise LinkPreviewError("Only http(s) URLs are allowed")
    if not parsed.hostname:
        raise LinkPreviewError("URL has no host")
    _reject_non_public_host(parsed.hostname)
    return parsed


class _NoRedirect(request.HTTPRedirectHandler):
    # Redirects are followed manually so every hop re-passes the SSRF check.
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


_OPENER = request.build_opener(
    _NoRedirect, request.HTTPSHandler(context=_SSL_CONTEXT)
)


def _fetch_html(url: str) -> tuple[str, str]:
    """Fetch the target page, re-validating each redirect hop.

    Returns (html, final_url); final_url anchors relative og:image paths.
    """
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        _validate_url(current)
        req = request.Request(current, headers={"User-Agent": USER_AGENT})
        try:
            with _OPENER.open(req, timeout=FETCH_TIMEOUT_SECONDS) as resp:
                content_type = resp.headers.get("Content-Type", "")
                if "text/html" not in content_type.lower():
                    raise LinkPreviewError("Target is not an HTML page")
                raw = resp.read(MAX_READ_BYTES)
                charset = resp.headers.get_content_charset() or "utf-8"
                return raw.decode(charset, errors="replace"), current
        except LinkPreviewError:
            raise
        except request.HTTPError as exc:
            if exc.code in (301, 302, 303, 307, 308):
                location = exc.headers.get("Location")
                exc.close()
                if not location:
                    raise LinkPreviewError("Redirect without Location") from exc
                current = parse.urljoin(current, location)
                continue
            raise LinkPreviewError(f"Target returned HTTP {exc.code}") from exc
        except OSError as exc:  # timeout, connection refused, TLS failure …
            raise LinkPreviewError("Target could not be fetched") from exc
    raise LinkPreviewError("Too many redirects")


class _MetaParser(HTMLParser):
    """Collects OG meta tags plus <title> / meta description fallbacks."""

    def __init__(self) -> None:
        super().__init__()
        self.og: dict[str, str] = {}
        self.meta_description: str | None = None
        self.title: str | None = None
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title":
            self._in_title = True
            return
        if tag != "meta":
            return
        attr = dict(attrs)
        prop = (attr.get("property") or attr.get("name") or "").lower()
        content = attr.get("content")
        if not content:
            return
        if prop.startswith("og:"):
            key = prop[3:]
            if key in ("title", "description", "image", "site_name") and key not in self.og:
                self.og[key] = content.strip()
        elif prop == "description" and self.meta_description is None:
            self.meta_description = content.strip()

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title and self.title is None and data.strip():
            self.title = data.strip()


def _parse_preview(html: str, base_url: str) -> LinkPreviewResponse:
    parser = _MetaParser()
    try:
        parser.feed(html)
    except Exception:  # malformed HTML: keep whatever was collected
        logger.debug("meta parse aborted for %s", base_url, exc_info=True)

    image = parser.og.get("image")
    if image:
        image = parse.urljoin(base_url, image)
        if not image.lower().startswith(("http://", "https://")):
            image = None

    return LinkPreviewResponse(
        title=parser.og.get("title") or parser.title,
        description=parser.og.get("description") or parser.meta_description,
        image=image,
        site_name=parser.og.get("site_name"),
    )


def get_link_preview(url: str) -> LinkPreviewResponse:
    now = time.monotonic()
    cached = PREVIEW_CACHE.get(url)
    if cached and cached[0] > now:
        logger.info("link-preview cache HIT url=%s", url)
        return cached[1]

    html, final_url = _fetch_html(url)
    preview = _parse_preview(html, final_url)

    if len(PREVIEW_CACHE) >= CACHE_MAX_ENTRIES:
        # Drop the entry closest to expiry; a plain dict keeps this simple.
        oldest = min(PREVIEW_CACHE, key=lambda k: PREVIEW_CACHE[k][0])
        del PREVIEW_CACHE[oldest]
    PREVIEW_CACHE[url] = (now + CACHE_TTL_SECONDS, preview)
    logger.info("link-preview cache SET url=%s size=%d", url, len(PREVIEW_CACHE))
    return preview
