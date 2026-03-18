import json
from datetime import datetime, timezone
from urllib import error, parse, request

from fastapi import HTTPException

from app.core.config import settings


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
):
    body = None
    final_headers = {"Content-Type": "application/json"}
    if headers:
        final_headers.update(headers)

    if payload is not None:
        body = json.dumps(payload).encode("utf-8")

    req = request.Request(url, data=body, headers=final_headers, method=method)

    try:
        with request.urlopen(req) as resp:
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


def list_sessions(user_id: str) -> list[dict]:
    query = parse.urlencode(
        {
            "user_id": f"eq.{user_id}",
            "select": "id,title,source_text,created_at,updated_at",
            "order": "updated_at.desc",
        }
    )
    data = _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/study_sessions?{query}",
        headers=_service_headers(),
    )
    return data or []


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
            "select": "sentence_index,original_text,translated_text",
            "order": "sentence_index.asc",
        }
    )
    vocab_query = parse.urlencode(
        {
            "session_id": f"eq.{session_id}",
            "user_id": f"eq.{user_id}",
            "select": (
                "sentence_index,selected_text,lemma,pos,translation,"
                "definition,example,level,queried"
            ),
            "order": "sentence_index.asc",
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

    vocab_by_sentence: dict[int, list[dict]] = {}
    for vocab in vocab_rows:
        idx = vocab["sentence_index"]
        vocab_by_sentence.setdefault(idx, []).append(
            {
                "text": vocab.get("selected_text") or "",
                "lemma": vocab["lemma"],
                "pos": vocab.get("pos"),
                "translation": vocab.get("translation"),
                "definition": vocab.get("definition"),
                "example": vocab.get("example"),
                "level": vocab.get("level"),
                "queried": vocab.get("queried", True),
            }
        )

    hydrated = [
        {
            "id": sentence["sentence_index"],
            "original": sentence["original_text"],
            "translation": sentence["translated_text"],
            "vocab": vocab_by_sentence.get(sentence["sentence_index"], []),
        }
        for sentence in sentences
    ]

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
        "last_saved_at": session.get("updated_at") or session.get("created_at"),
    }


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
        for vocab in sentence.get("vocab", []):
            if not vocab.get("queried", True) or not vocab.get("lemma"):
                continue
            vocab_rows.append(
                {
                    "session_id": session_id,
                    "user_id": user_id,
                    "sentence_index": idx,
                    "selected_text": vocab.get("text") or None,
                    "lemma": vocab["lemma"],
                    "pos": vocab.get("pos"),
                    "translation": vocab.get("translation"),
                    "definition": vocab.get("definition"),
                    "example": vocab.get("example"),
                    "level": vocab.get("level"),
                    "queried": vocab.get("queried", True),
                }
            )
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
    title = build_session_title(text)
    saved_at = datetime.now(timezone.utc).isoformat()

    if session_id:
        query = parse.urlencode({"id": f"eq.{session_id}", "user_id": f"eq.{user_id}"})
        updated_rows = _request_json(
            "PATCH",
            f"{settings.supabase_url}/rest/v1/study_sessions?{query}",
            headers=_service_headers("return=representation"),
            payload={
                "title": title,
                "source_text": text,
                "updated_at": saved_at,
            },
        ) or []
        if not updated_rows:
            raise HTTPException(status_code=404, detail="Study session not found.")
        session = updated_rows[0]
    else:
        created_rows = _request_json(
            "POST",
            f"{settings.supabase_url}/rest/v1/study_sessions",
            headers=_service_headers("return=representation"),
            payload={"user_id": user_id, "title": title, "source_text": text},
        ) or []
        if not created_rows:
            raise HTTPException(status_code=500, detail="Could not create the study session.")
        session = created_rows[0]
        session_id = session["id"]

    _delete_session_children(user_id, session_id)
    _insert_session_children(user_id, session_id, sentences)

    refreshed = get_session_detail(user_id, session_id)
    return {
        "saved_at": refreshed["last_saved_at"] or saved_at,
        "session": refreshed["session"],
    }
