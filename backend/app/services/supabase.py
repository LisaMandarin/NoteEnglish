import json
import logging
import re
import ssl
from datetime import datetime, timezone
from typing import Any
from urllib import error, parse, request

import certifi
from fastapi import HTTPException

from app.core.config import settings

logger = logging.getLogger(__name__)

# Python.org macOS installs do not always have a system CA bundle configured.
# certifi is installed with the application and gives urllib a portable trust store.
_SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
_REQUEST_TIMEOUT_SECONDS = 15


def _require_supabase_config() -> None:
    if (
        not settings.supabase_url
        or not settings.supabase_anon_key
        or not settings.supabase_service_role_key
    ):
        raise HTTPException(
            status_code=500,
            detail=(
                "Missing Supabase backend configuration. Set SUPABASE_URL, "
                "SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY."
            ),
        )


def _request_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    payload: dict | list | None = None,
) -> Any:
    body = None
    final_headers = {"Content-Type": "application/json"}
    if headers:
        final_headers.update(headers)

    if payload is not None:
        body = json.dumps(payload).encode("utf-8")

    req = request.Request(url, data=body, headers=final_headers, method=method)

    try:
        with request.urlopen(
            req,
            context=_SSL_CONTEXT,
            timeout=_REQUEST_TIMEOUT_SECONDS,
        ) as resp:
            raw = resp.read().decode("utf-8")
            if not raw:
                return None
            return json.loads(raw)
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        detail = raw
        if raw:
            try:
                parsed = json.loads(raw)
                detail = parsed.get("message") or parsed.get("msg") or raw
            except json.JSONDecodeError:
                detail = raw
        raise HTTPException(status_code=exc.code, detail=detail) from exc
    except error.URLError as exc:
        raise HTTPException(status_code=502, detail=str(exc.reason)) from exc


def _service_headers(prefer: str | None = None) -> dict[str, str]:
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def get_authenticated_user(authorization: str | None) -> dict:
    _require_supabase_config()

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token.")

    return _request_json(
        "GET",
        f"{settings.supabase_url}/auth/v1/user",
        headers={
            "apikey": settings.supabase_anon_key,
            "Authorization": f"Bearer {token}",
        },
    )


def build_session_title(text: str) -> str:
    first_line = next((line.strip() for line in text.splitlines() if line.strip()), "")
    return first_line[:80] if first_line else "Untitled session"


def ensure_profile(user: dict, display_name: str) -> None:
    payload = {
        "id": user["id"],
        "email": user.get("email"),
        "display_name": display_name,
    }
    _request_json(
        "POST",
        f"{settings.supabase_url}/rest/v1/profiles",
        headers=_service_headers("resolution=merge-duplicates,return=minimal"),
        payload=payload,
    )


def list_sessions(user_id: str, limit: int = 5, offset: int = 0) -> dict:
    query = parse.urlencode(
        {
            "user_id": f"eq.{user_id}",
            "select": "id,title,source_text,created_at,updated_at",
            "order": "updated_at.desc",
            "limit": limit + 1,
            "offset": offset,
        }
    )
    data = _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/study_sessions?{query}",
        headers=_service_headers(),
    )
    rows = data or []
    has_more = len(rows) > limit
    return {"items": rows[:limit], "has_more": has_more}


def get_session_detail(user_id: str, session_id: str) -> dict:
    session_query = parse.urlencode(
        {
            "id": f"eq.{session_id}",
            "user_id": f"eq.{user_id}",
            "select": "id,title,source_text,created_at,updated_at",
        }
    )
    session_rows = _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/study_sessions?{session_query}",
        headers=_service_headers(),
    ) or []

    if not session_rows:
        raise HTTPException(status_code=404, detail="Study session not found.")

    session = session_rows[0]

    sentence_query = parse.urlencode(
        {
            "session_id": f"eq.{session_id}",
            "user_id": f"eq.{user_id}",
            "select": "sentence_index,original_text,translated_text,note",
            "order": "sentence_index.asc",
        }
    )
    vocab_query = parse.urlencode(
        {
            "session_id": f"eq.{session_id}",
            "user_id": f"eq.{user_id}",
            "select": (
                "sentence_index,vocab_index,selected_text,lemma,pos,translation,"
                "definition,example,level,other_1,other_2,other_3,other_4,other_5"
            ),
            "order": "sentence_index.asc,vocab_index.asc",
        }
    )

    sentences = _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/session_sentences?{sentence_query}",
        headers=_service_headers(),
    ) or []
    vocab_rows = _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/vocab_notes?{vocab_query}",
        headers=_service_headers(),
    ) or []

    queried_by_sentence: dict[int, list[dict]] = {}
    for vocab in vocab_rows:
        idx = vocab["sentence_index"]
        item: dict = {
            "text": vocab.get("selected_text") or "",
            "lemma": vocab["lemma"],
            "pos": vocab.get("pos"),
            "translation": vocab.get("translation"),
            "definition": vocab.get("definition"),
            "example": vocab.get("example"),
            "level": vocab.get("level"),
        }
        for i in range(1, 6):
            val = vocab.get(f"other_{i}")
            if val is not None:
                item[f"other_{i}"] = val
        queried_by_sentence.setdefault(idx, []).append(item)

    hydrated = []
    for sentence in sentences:
        idx = sentence["sentence_index"]
        queried_list = queried_by_sentence.get(idx, [])

        merged_vocab = queried_list

        hydrated.append({
            "id": idx,
            "original": sentence["original_text"],
            "translation": sentence["translated_text"],
            "note": sentence.get("note") or "",
            "vocab": merged_vocab,
        })

    title = session.get("title") or build_session_title(session.get("source_text") or "")
    return {
        "text": session.get("source_text") or "",
        "sentences": hydrated,
        "session": {
            "id": session["id"],
            "title": title,
            "source_text": session.get("source_text") or "",
            "created_at": session["created_at"],
            "updated_at": session["updated_at"],
        },
    }


def update_session_title(user_id: str, session_id: str, title: str) -> dict:
    query = parse.urlencode({"id": f"eq.{session_id}", "user_id": f"eq.{user_id}"})
    updated_rows = _request_json(
        "PATCH",
        f"{settings.supabase_url}/rest/v1/study_sessions?{query}",
        headers=_service_headers("return=representation"),
        payload={"title": title.strip(), "updated_at": datetime.now(timezone.utc).isoformat()},
    ) or []
    if not updated_rows:
        raise HTTPException(status_code=404, detail="Study session not found.")
    return updated_rows[0]


def _delete_session_children(user_id: str, session_id: str) -> None:
    vocab_query = parse.urlencode({"session_id": f"eq.{session_id}", "user_id": f"eq.{user_id}"})
    sentence_query = parse.urlencode({"session_id": f"eq.{session_id}", "user_id": f"eq.{user_id}"})
    _request_json(
        "DELETE",
        f"{settings.supabase_url}/rest/v1/vocab_notes?{vocab_query}",
        headers=_service_headers(),
    )
    _request_json(
        "DELETE",
        f"{settings.supabase_url}/rest/v1/session_sentences?{sentence_query}",
        headers=_service_headers(),
    )


def _insert_session_children(user_id: str, session_id: str, sentences: list[dict]) -> None:
    sentence_rows = [
        {
            "session_id": session_id,
            "user_id": user_id,
            "sentence_index": idx,
            "original_text": sentence.get("original", ""),
            "translated_text": sentence.get("translation", ""),
            "note": sentence.get("note", "") or "",
        }
        for idx, sentence in enumerate(sentences)
    ]
    if sentence_rows:
        _request_json(
            "POST",
            f"{settings.supabase_url}/rest/v1/session_sentences",
            headers=_service_headers(),
            payload=sentence_rows,
        )

    vocab_rows = []
    for idx, sentence in enumerate(sentences):
        vocab_index = 0
        for vocab in sentence.get("vocab", []):
            if not vocab.get("lemma"):
                continue
            row: dict = {
                "session_id": session_id,
                "user_id": user_id,
                "sentence_index": idx,
                "vocab_index": vocab_index,
                "selected_text": vocab.get("text") or None,
                "lemma": vocab["lemma"],
                "pos": vocab.get("pos"),
                "translation": vocab.get("translation"),
                "definition": vocab.get("definition"),
                "example": vocab.get("example"),
                "level": vocab.get("level"),
            }
            for i in range(1, 6):
                row[f"other_{i}"] = vocab.get(f"other_{i}")
            vocab_rows.append(row)
            vocab_index += 1
    if vocab_rows:
        _request_json(
            "POST",
            f"{settings.supabase_url}/rest/v1/vocab_notes",
            headers=_service_headers(),
            payload=vocab_rows,
        )


def save_session(
    user_id: str,
    text: str,
    sentences: list[dict],
    session_id: str | None,
) -> dict:
    saved_at = datetime.now(timezone.utc).isoformat()

    if session_id:
        query = parse.urlencode({"id": f"eq.{session_id}", "user_id": f"eq.{user_id}"})
        updated_rows = _request_json(
            "PATCH",
            f"{settings.supabase_url}/rest/v1/study_sessions?{query}",
            headers=_service_headers("return=representation"),
            payload={
                "source_text": text,
                "updated_at": saved_at,
            },
        ) or []
        if not updated_rows:
            raise HTTPException(status_code=404, detail="Study session not found.")
        session = updated_rows[0]
    else:
        title = build_session_title(text)
        created_rows = _request_json(
            "POST",
            f"{settings.supabase_url}/rest/v1/study_sessions",
            headers=_service_headers("return=representation"),
            payload={"user_id": user_id, "title": title, "source_text": text},
        ) or []
        if not created_rows:
            raise HTTPException(status_code=500, detail="Could not create the study session.")
        session = created_rows[0]

    session_id = str(session["id"])
    _delete_session_children(user_id, session_id)
    _insert_session_children(user_id, session_id, sentences)

    refreshed = get_session_detail(user_id, session_id)
    return {
        "saved_at": refreshed["session"].get("updated_at") or saved_at,
        "session": refreshed["session"],
    }


def get_cached_parse(sentence_hash: str, prompt_version: int) -> dict | None:
    """Return the cached structure tree for a sentence, or None on a cache miss."""
    query = parse.urlencode(
        {
            "sentence_hash": f"eq.{sentence_hash}",
            "prompt_version": f"eq.{prompt_version}",
            "select": "structure",
            "limit": 1,
        }
    )
    rows = _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/sentence_parses?{query}",
        headers=_service_headers(),
    ) or []
    return rows[0]["structure"] if rows else None


def save_parse(
    sentence_hash: str,
    prompt_version: int,
    model: str,
    sentence: str,
    structure: dict,
) -> None:
    """Persist a structure analysis. Upserts on (sentence_hash, prompt_version)
    so a race between two first-time requests can't 409. A cache-write failure
    must not fail the user's request — the analysis is already computed."""
    try:
        _request_json(
            "POST",
            f"{settings.supabase_url}/rest/v1/sentence_parses"
            "?on_conflict=sentence_hash,prompt_version",
            headers=_service_headers("resolution=merge-duplicates,return=minimal"),
            payload={
                "sentence_hash": sentence_hash,
                "prompt_version": prompt_version,
                "model": model,
                "sentence": sentence,
                "structure": structure,
            },
        )
    except Exception:
        logger.warning("Failed to cache sentence parse (hash=%s)", sentence_hash)


def log_api_usage(user_id: str, endpoint: str, model: str, usage: dict) -> None:
    try:
        _request_json(
            "POST",
            f"{settings.supabase_url}/rest/v1/api_usage",
            headers=_service_headers(),
            payload={
                "user_id": user_id,
                "endpoint": endpoint,
                "model": model,
                "prompt_tokens": usage.get("prompt_tokens", 0),
                "response_tokens": usage.get("response_tokens", 0),
                "total_tokens": usage.get("total_tokens", 0),
            },
        )
    except Exception:
        logger.warning("Failed to log API usage: user=%s endpoint=%s", user_id, endpoint)


_FRACTIONAL_SECONDS_RE = re.compile(r"\.(\d+)")


def _parse_timestamp_utc(ts: str) -> datetime:
    """Parse an ISO 8601 timestamp into a UTC-aware datetime.

    Supabase trims trailing zeros from fractional seconds, yielding values
    like '2026-06-10T03:07:47.71418+00:00' (5 digits). Python 3.10's
    fromisoformat only accepts 3 or 6 fractional digits, so pad to 6 first.
    """
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    ts = _FRACTIONAL_SECONDS_RE.sub(
        lambda m: "." + m.group(1)[:6].ljust(6, "0"), ts, count=1
    )
    dt = datetime.fromisoformat(ts)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def get_usage_stats(user_id: str) -> dict:
    from datetime import timedelta

    def _subtract_months(dt: datetime, n: int) -> datetime:
        m = dt.month - n
        y = dt.year
        while m <= 0:
            m += 12
            y -= 1
        return dt.replace(year=y, month=m, day=1, hour=0, minute=0, second=0, microsecond=0)

    now = datetime.now(timezone.utc)
    three_months_start = _subtract_months(now, 2)
    recent_hours_start = now.replace(
        minute=0, second=0, microsecond=0
    ) - timedelta(hours=11)

    query = parse.urlencode({
        "user_id": f"eq.{user_id}",
        "created_at": f"gte.{three_months_start.isoformat()}",
        "select": "total_tokens,created_at",
        "order": "created_at.asc",
    })
    rows = _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/api_usage?{query}",
        headers=_service_headers(),
    ) or []

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    hourly: dict[int, int] = {h: 0 for h in range(24)}
    recent_hourly: dict[datetime, int] = {
        recent_hours_start + timedelta(hours=i): 0 for i in range(12)
    }
    daily: dict[str, int] = {}
    monthly: dict[str, int] = {}

    for row in rows:
        dt = _parse_timestamp_utc(row["created_at"])
        tokens: int = row.get("total_tokens") or 0

        if dt >= today_start:
            hourly[dt.hour] += tokens

        hour_start = dt.replace(minute=0, second=0, microsecond=0)
        if hour_start in recent_hourly:
            recent_hourly[hour_start] += tokens

        date_str = dt.strftime("%Y-%m-%d")
        daily[date_str] = daily.get(date_str, 0) + tokens

        month_str = dt.strftime("%Y-%m")
        monthly[month_str] = monthly.get(month_str, 0) + tokens

    hourly_list = [{"hour": h, "tokens": hourly[h]} for h in range(24)]
    today_total = sum(hourly.values())
    recent_hourly_list = [
        {
            "timestamp": hour_start.isoformat().replace("+00:00", "Z"),
            "tokens": recent_hourly[hour_start],
        }
        for hour_start in recent_hourly
    ]
    recent_hours_total = sum(recent_hourly.values())

    week_days = []
    for i in range(6, -1, -1):
        d = today_start - timedelta(days=i)
        date_str = d.strftime("%Y-%m-%d")
        week_days.append({"date": date_str, "tokens": daily.get(date_str, 0)})
    week_total = sum(entry["tokens"] for entry in week_days)

    month_list = []
    for i in range(2, -1, -1):
        m = _subtract_months(now.replace(day=1), i)
        month_str = m.strftime("%Y-%m")
        month_list.append({"month": month_str, "tokens": monthly.get(month_str, 0)})
    months_total = sum(entry["tokens"] for entry in month_list)

    return {
        "today": {"total": today_total, "hourly": hourly_list},
        "last_12_hours": {
            "total": recent_hours_total,
            "hourly": recent_hourly_list,
        },
        "week": {"total": week_total, "daily": week_days},
        "months": {"total": months_total, "monthly": month_list},
    }


def list_all_users(page: int = 1, per_page: int = 50) -> list[dict]:
    query = parse.urlencode({"page": page, "per_page": per_page})
    data = _request_json(
        "GET",
        f"{settings.supabase_url}/auth/v1/admin/users?{query}",
        headers={
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
        },
    )
    users = (data or {}).get("users") or []
    return [
        {
            "id": u["id"],
            "email": u.get("email"),
            "display_name": (u.get("user_metadata") or {}).get("display_name"),
            "role": (u.get("app_metadata") or {}).get("role"),
            "created_at": u.get("created_at"),
            "last_sign_in_at": u.get("last_sign_in_at"),
        }
        for u in users
    ]


def delete_session(user_id: str, session_id: str) -> None:
    _delete_session_children(user_id, session_id)
    query = parse.urlencode({"id": f"eq.{session_id}", "user_id": f"eq.{user_id}"})
    _request_json(
        "DELETE",
        f"{settings.supabase_url}/rest/v1/study_sessions?{query}",
        headers=_service_headers(),
    )
