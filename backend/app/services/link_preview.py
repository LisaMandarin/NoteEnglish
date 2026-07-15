import http.client
import ipaddress
import logging
import socket
import ssl
import time
from html.parser import HTMLParser
from urllib import parse

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


def _resolve_public_ip(host: str) -> str:
    """SSRF guard: resolve the hostname, refuse anything that isn't a public
    unicast address (loopback, RFC1918, link-local, reserved, …), and return
    one validated IP. The connection MUST be made to that IP — resolving the
    hostname again at connect time would allow a DNS-rebinding TOCTOU."""
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except OSError as exc:
        raise LinkPreviewError("Host could not be resolved") from exc
    if not infos:
        raise LinkPreviewError("Host could not be resolved")

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            raise LinkPreviewError("URL resolves to a non-public address")
    return infos[0][4][0]


def _validate_url(url: str) -> tuple[parse.ParseResult, str]:
    """Returns (parsed URL, validated public IP to connect to)."""
    parsed = parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise LinkPreviewError("Only http(s) URLs are allowed")
    if not parsed.hostname:
        raise LinkPreviewError("URL has no host")
    return parsed, _resolve_public_ip(parsed.hostname)


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """TLS connection that dials a pre-validated IP while certificate
    verification and SNI still use the original hostname."""

    def __init__(self, hostname: str, ip: str, port: int) -> None:
        super().__init__(
            ip, port, timeout=FETCH_TIMEOUT_SECONDS, context=_SSL_CONTEXT
        )
        self._server_hostname = hostname

    def connect(self) -> None:
        self.sock = socket.create_connection(
            (self.host, self.port), self.timeout
        )
        self.sock = self._context.wrap_socket(
            self.sock, server_hostname=self._server_hostname
        )


def _open_connection(
    parsed: parse.ParseResult, ip: str
) -> http.client.HTTPConnection:
    if parsed.scheme == "https":
        return _PinnedHTTPSConnection(parsed.hostname, ip, parsed.port or 443)
    return http.client.HTTPConnection(
        ip, parsed.port or 80, timeout=FETCH_TIMEOUT_SECONDS
    )


def _request_target(parsed: parse.ParseResult) -> tuple[str, str]:
    """Returns (path with query, Host header value) for the request line."""
    path = parsed.path or "/"
    if parsed.query:
        path += "?" + parsed.query
    default_port = 443 if parsed.scheme == "https" else 80
    port = parsed.port or default_port
    host = parsed.hostname
    if ":" in host:  # IPv6 literal needs brackets in the Host header
        host = f"[{host}]"
    return path, host if port == default_port else f"{host}:{port}"


def _fetch_html(url: str) -> tuple[str, str]:
    """Fetch the target page, re-validating each redirect hop.

    Each hop connects to the IP validated for that hop (never re-resolving
    the hostname) so a rebinding DNS server can't swap in a private address
    between check and use. Returns (html, final_url); final_url anchors
    relative og:image paths.
    """
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        parsed, ip = _validate_url(current)
        path, host_header = _request_target(parsed)
        conn = _open_connection(parsed, ip)
        try:
            # Passing Host explicitly stops http.client from deriving it
            # from the connection target (the bare IP).
            conn.request(
                "GET",
                path,
                headers={
                    "Host": host_header,
                    "User-Agent": USER_AGENT,
                    "Accept": "text/html",
                    "Connection": "close",
                },
            )
            resp = conn.getresponse()
            if resp.status in (301, 302, 303, 307, 308):
                location = resp.getheader("Location")
                if not location:
                    raise LinkPreviewError("Redirect without Location")
                current = parse.urljoin(current, location)
                continue
            if not 200 <= resp.status < 300:
                raise LinkPreviewError(f"Target returned HTTP {resp.status}")
            content_type = resp.getheader("Content-Type", "")
            if "text/html" not in content_type.lower():
                raise LinkPreviewError("Target is not an HTML page")
            raw = resp.read(MAX_READ_BYTES)
            charset = resp.headers.get_content_charset() or "utf-8"
            return raw.decode(charset, errors="replace"), current
        except LinkPreviewError:
            raise
        except (OSError, http.client.HTTPException) as exc:
            raise LinkPreviewError("Target could not be fetched") from exc
        finally:
            conn.close()
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


def _safe_image_url(url: str) -> str | None:
    """og:image is loaded directly by the reader's browser, so refuse
    anything that isn't public http(s) — a page must not be able to point
    the preview image at localhost or a private network."""
    try:
        _validate_url(url)
    except LinkPreviewError:
        return None
    return url


def _parse_preview(html: str, base_url: str) -> LinkPreviewResponse:
    parser = _MetaParser()
    try:
        parser.feed(html)
    except Exception:  # malformed HTML: keep whatever was collected
        logger.debug("meta parse aborted for %s", base_url, exc_info=True)

    image = parser.og.get("image")
    if image:
        image = _safe_image_url(parse.urljoin(base_url, image))

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
