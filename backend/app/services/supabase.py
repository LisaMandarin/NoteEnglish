import json
import logging
import re
import ssl
import uuid
from datetime import datetime, timedelta, timezone
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

    try:
        return _request_json(
            "GET",
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "apikey": settings.supabase_anon_key,
                "Authorization": f"Bearer {token}",
            },
        )
    except HTTPException as exc:
        # Supabase rejects stale/revoked tokens with 401/403 and messages like
        # "Session from session_id claim in JWT does not exist" (e.g. after a
        # global sign-out from another device). Normalize to the session_expired
        # contract so the client signs out locally and shows the login page
        # instead of wedging on endless 403s.
        if exc.status_code in (401, 403):
            raise HTTPException(status_code=401, detail="session_expired") from exc
        raise


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
            "select": "id,title,source_text,created_at,updated_at,share_token",
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
    items = rows[:limit]
    scores = proficiency_by_session(user_id, [str(row["id"]) for row in items])
    for row in items:
        session_scores = scores.get(str(row["id"])) or {}
        row["word_proficiency"] = session_scores.get("word")
        row["article_proficiency"] = session_scores.get("article")
    return {"items": items, "has_more": has_more}


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


def get_quiz_questions(user_id: str, session_id: str) -> list[dict]:
    """Cached comprehension questions for a session, ordered by index."""
    query = parse.urlencode(
        {
            "session_id": f"eq.{session_id}",
            "user_id": f"eq.{user_id}",
            "select": "question,options,answer_index,explanation",
            "order": "question_index.asc",
        }
    )
    return _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/quiz_questions?{query}",
        headers=_service_headers(),
    ) or []


def replace_quiz_questions(user_id: str, session_id: str, questions: list[dict]) -> None:
    """Overwrite a session's cached comprehension questions."""
    query = parse.urlencode({"session_id": f"eq.{session_id}", "user_id": f"eq.{user_id}"})
    _request_json(
        "DELETE",
        f"{settings.supabase_url}/rest/v1/quiz_questions?{query}",
        headers=_service_headers(),
    )
    rows = [
        {
            "session_id": session_id,
            "user_id": user_id,
            "question_index": idx,
            "question": question["question"],
            "options": question["options"],
            "answer_index": question["answer_index"],
            "explanation": question.get("explanation") or "",
        }
        for idx, question in enumerate(questions)
    ]
    if rows:
        _request_json(
            "POST",
            f"{settings.supabase_url}/rest/v1/quiz_questions",
            headers=_service_headers(),
            payload=rows,
        )


def insert_quiz_results(user_id: str, session_id: str | None, results: list[dict]) -> None:
    rows = [
        {
            "user_id": user_id,
            "session_id": session_id,
            "quiz_type": result["quiz_type"],
            "lemma": result.get("lemma") or None,
            "pos": result.get("pos") or None,
            "correct": result["correct"],
        }
        for result in results
    ]
    if rows:
        _request_json(
            "POST",
            f"{settings.supabase_url}/rest/v1/quiz_results",
            headers=_service_headers(),
            payload=rows,
        )


# Mastery levels: 0 = never quizzed (no row), 1 = 學習中, 2 = 已掌握.
MASTERY_LEARNING = 1
MASTERY_MASTERED = 2

# Spaced-repetition ladder in days. A wrong answer resets the position to 0
# (review again tomorrow); each correct review climbs to the next step.
_REVIEW_LADDER = [1, 3, 7, 14]


def _next_interval_days(current: int) -> int:
    for step in _REVIEW_LADDER:
        if step > current:
            return step
    return _REVIEW_LADDER[-1]


def compute_mastery_update(
    existing_row: dict,
    counts: dict[str, int],
    correct_type_count: int,
    now: datetime,
) -> dict:
    """Level and SRS fields for one word after a batch of quiz results.

    Mastered requires correct answers in at least two different quiz types;
    any wrong answer in the batch drops the word back to learning and resets
    its review to tomorrow."""
    had_wrong = counts["wrong"] > 0
    level = (
        MASTERY_MASTERED
        if not had_wrong and correct_type_count >= 2
        else MASTERY_LEARNING
    )
    if had_wrong:
        interval = 0
        next_review = now + timedelta(days=1)
    else:
        interval = _next_interval_days(int(existing_row.get("review_interval_days", 0)))
        next_review = now + timedelta(days=interval)
    return {
        "correct_count": int(existing_row.get("correct_count", 0)) + counts["correct"],
        "wrong_count": int(existing_row.get("wrong_count", 0)) + counts["wrong"],
        "level": level,
        "review_interval_days": interval,
        "next_review_at": next_review.isoformat(),
        "last_result_at": now.isoformat(),
    }


def update_word_mastery(user_id: str, results: list[dict]) -> None:
    """Fold vocab-question results into per-word counters, mastery levels, and
    the spaced-repetition schedule.

    Keyed by (user_id, lemma, pos) — the app's vocab identity — because
    vocab_notes rows are deleted and reinserted on every session save. A
    mastery-update failure must not fail the request: quiz_results already
    holds the raw data, so everything here can always be rebuilt."""
    counters: dict[tuple[str, str], dict[str, int]] = {}
    for result in results:
        lemma = (result.get("lemma") or "").strip().lower()
        if not lemma:
            continue  # dictation/comprehension results carry no word identity
        pos = (result.get("pos") or "").strip().lower()
        entry = counters.setdefault((lemma, pos), {"correct": 0, "wrong": 0})
        entry["correct" if result["correct"] else "wrong"] += 1
    if not counters:
        return

    try:
        lemma_list = ",".join(
            '"{}"'.format(lemma.replace('"', "")) for lemma, _ in counters
        )
        query = parse.urlencode(
            {
                "user_id": f"eq.{user_id}",
                "lemma": f"in.({lemma_list})",
                "select": "lemma,pos,correct_count,wrong_count,level,review_interval_days",
            }
        )
        existing_rows = _request_json(
            "GET",
            f"{settings.supabase_url}/rest/v1/word_mastery?{query}",
            headers=_service_headers(),
        ) or []
        existing = {(row["lemma"], row["pos"]): row for row in existing_rows}

        # Distinct quiz types answered correctly per word (including the batch
        # just inserted into quiz_results), for the two-different-types rule.
        # Normalized in Python because PostgREST cannot lower() a filter.
        types_query = parse.urlencode(
            {
                "user_id": f"eq.{user_id}",
                "correct": "eq.true",
                "select": "lemma,pos,quiz_type",
                "limit": 10000,
            }
        )
        correct_rows = _request_json(
            "GET",
            f"{settings.supabase_url}/rest/v1/quiz_results?{types_query}",
            headers=_service_headers(),
        ) or []
        correct_types: dict[tuple[str, str], set[str]] = {}
        for row in correct_rows:
            key = (
                (row.get("lemma") or "").strip().lower(),
                (row.get("pos") or "").strip().lower(),
            )
            if key in counters:
                correct_types.setdefault(key, set()).add(row["quiz_type"])

        now = datetime.now(timezone.utc)
        payload = []
        for (lemma, pos), counts in counters.items():
            update = compute_mastery_update(
                existing.get((lemma, pos), {}),
                counts,
                len(correct_types.get((lemma, pos), set())),
                now,
            )
            payload.append({"user_id": user_id, "lemma": lemma, "pos": pos, **update})
        _request_json(
            "POST",
            f"{settings.supabase_url}/rest/v1/word_mastery"
            "?on_conflict=user_id,lemma,pos",
            headers=_service_headers("resolution=merge-duplicates,return=minimal"),
            payload=payload,
        )
    except Exception:
        logger.warning("Failed to update word mastery for user=%s", user_id)


def get_word_mastery(user_id: str, limit: int = 2000) -> list[dict]:
    """Every mastery row for the user, for badges on vocab cards."""
    query = parse.urlencode(
        {
            "user_id": f"eq.{user_id}",
            "select": "lemma,pos,level,correct_count,wrong_count,next_review_at",
            "limit": limit,
        }
    )
    return _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/word_mastery?{query}",
        headers=_service_headers(),
    ) or []


def get_review_words(user_id: str, limit: int = 50) -> list[dict]:
    """Words due for review (next_review_at <= now), joined with their vocab
    fields so the frontend can build matching/spelling questions. Words whose
    vocab notes were deleted are skipped — there is nothing to quiz."""
    now_iso = datetime.now(timezone.utc).isoformat()
    query = parse.urlencode(
        {
            "user_id": f"eq.{user_id}",
            "next_review_at": f"lte.{now_iso}",
            "select": "lemma,pos",
            "order": "next_review_at.asc",
            "limit": limit,
        }
    )
    due_rows = _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/word_mastery?{query}",
        headers=_service_headers(),
    ) or []
    if not due_rows:
        return []

    pool = {
        (
            (item.get("lemma") or "").strip().lower(),
            (item.get("pos") or "").strip().lower(),
        ): item
        for item in get_vocab_pool(user_id)
    }
    words: list[dict] = []
    for row in due_rows:
        key = ((row.get("lemma") or "").lower(), (row.get("pos") or "").lower())
        item = pool.get(key)
        if item:
            words.append(item)
    return words


# Two separate proficiency scores per session, each from the LATEST quiz run
# only (no weights, no history): word = cloze/matching/spelling, article =
# comprehension/dictation. A run is identified by answered_at — all rows of one
# results submission share the same insert timestamp.
_WORD_QUIZ_TYPES = {"cloze", "matching", "spelling"}
_ARTICLE_QUIZ_TYPES = {"comprehension", "dictation"}


def proficiency_by_session(
    user_id: str, session_ids: list[str]
) -> dict[str, dict[str, int]]:
    """Per session: {"word": 0-100, "article": 0-100}, each the plain accuracy
    of that group's questions in the most recent run containing them; the key
    is absent when the group was never quizzed. Failures return {} — the score
    is decoration and must never break session lists."""
    if not session_ids:
        return {}
    try:
        id_list = ",".join(f'"{sid}"' for sid in session_ids)
        query = parse.urlencode(
            {
                "user_id": f"eq.{user_id}",
                "session_id": f"in.({id_list})",
                "select": "session_id,quiz_type,correct,answered_at",
                "limit": 10000,
            }
        )
        rows = _request_json(
            "GET",
            f"{settings.supabase_url}/rest/v1/quiz_results?{query}",
            headers=_service_headers(),
        ) or []
    except Exception:
        logger.warning("Failed to load quiz results for proficiency: user=%s", user_id)
        return {}

    # latest[(session, group)] = [answered_at, correct, total]
    latest: dict[tuple[str, str], list] = {}
    for row in rows:
        quiz_type = row.get("quiz_type")
        if quiz_type in _WORD_QUIZ_TYPES:
            group = "word"
        elif quiz_type in _ARTICLE_QUIZ_TYPES:
            group = "article"
        else:
            continue
        answered_at = row.get("answered_at") or ""
        key = (str(row["session_id"]), group)
        tally = latest.get(key)
        if tally is None or answered_at > tally[0]:
            tally = [answered_at, 0, 0]
            latest[key] = tally
        elif answered_at < tally[0]:
            continue
        tally[1] += 1 if row.get("correct") else 0
        tally[2] += 1

    scores: dict[str, dict[str, int]] = {}
    for (session_id, group), (_, correct, total) in latest.items():
        if total > 0:
            scores.setdefault(session_id, {})[group] = round(100 * correct / total)
    return scores


def get_vocab_pool(user_id: str, limit: int = 1000) -> list[dict]:
    """The user's vocab across all sessions, deduped by (lemma, pos) — used as
    the cross-article distractor pool for quiz multiple-choice options."""
    query = parse.urlencode(
        {
            "user_id": f"eq.{user_id}",
            "select": "lemma,pos,selected_text,translation,definition",
            "limit": limit,
        }
    )
    rows = _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/vocab_notes?{query}",
        headers=_service_headers(),
    ) or []

    seen: set[tuple[str, str]] = set()
    items: list[dict] = []
    for row in rows:
        lemma = (row.get("lemma") or "").strip()
        if not lemma:
            continue
        key = (lemma.lower(), (row.get("pos") or "").strip().lower())
        if key in seen:
            continue
        seen.add(key)
        items.append(
            {
                "lemma": lemma,
                "pos": row.get("pos"),
                "text": row.get("selected_text"),
                "translation": row.get("translation"),
                "definition": row.get("definition"),
            }
        )
    return items


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


def parse_timestamp_utc(ts: str) -> datetime:
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
        dt = parse_timestamp_utc(row["created_at"])
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


# ── Sharing ───────────────────────────────────────────────────────────────────
# A share token turns a session into a read-only article any signed-in user can
# open. Favorites reference the session (never copy it); the shared_favorites
# FK cascades on session delete, and revoking a token merely hides favorites
# until the owner re-shares.


def _get_shared_session_row(token: str) -> dict:
    """Resolve a share token to its study_sessions row. 404 covers unknown,
    revoked, and malformed tokens alike so the URL leaks nothing."""
    try:
        uuid.UUID(token)
    except ValueError:
        raise HTTPException(status_code=404, detail="Shared article not found.")
    query = parse.urlencode(
        {
            "share_token": f"eq.{token}",
            "select": "id,user_id,title,source_text,created_at,updated_at",
        }
    )
    rows = _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/study_sessions?{query}",
        headers=_service_headers(),
    ) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Shared article not found.")
    return rows[0]


def _creator_name(owner_id: str) -> str | None:
    query = parse.urlencode({"id": f"eq.{owner_id}", "select": "display_name"})
    rows = _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/profiles?{query}",
        headers=_service_headers(),
    ) or []
    return rows[0].get("display_name") if rows else None


def create_share_token(user_id: str, session_id: str) -> dict:
    """Idempotent: re-sharing returns the existing token so a link once handed
    out keeps working. The PATCH is guarded with share_token=is.null so two
    concurrent requests cannot both mint a token and leave one caller holding
    a link that was immediately overwritten — the loser re-reads the winner's
    token. updated_at is left alone — sharing is not a content edit and must
    not reorder the session list."""
    for _ in range(2):
        query = parse.urlencode(
            {"id": f"eq.{session_id}", "user_id": f"eq.{user_id}", "select": "id,share_token"}
        )
        rows = _request_json(
            "GET",
            f"{settings.supabase_url}/rest/v1/study_sessions?{query}",
            headers=_service_headers(),
        ) or []
        if not rows:
            raise HTTPException(status_code=404, detail="Study session not found.")

        existing = rows[0].get("share_token")
        if existing:
            return {"share_token": existing}

        update_query = parse.urlencode(
            {"id": f"eq.{session_id}", "user_id": f"eq.{user_id}", "share_token": "is.null"}
        )
        updated_rows = _request_json(
            "PATCH",
            f"{settings.supabase_url}/rest/v1/study_sessions?{update_query}",
            headers=_service_headers("return=representation"),
            payload={"share_token": str(uuid.uuid4())},
        ) or []
        if updated_rows:
            return {"share_token": updated_rows[0]["share_token"]}
        # Guarded update matched no row: another request set a token between
        # the read and the PATCH. Loop once to pick up the winner's token.
    raise HTTPException(status_code=500, detail="Could not create the share link.")


def revoke_share_token(user_id: str, session_id: str) -> None:
    query = parse.urlencode({"id": f"eq.{session_id}", "user_id": f"eq.{user_id}"})
    updated_rows = _request_json(
        "PATCH",
        f"{settings.supabase_url}/rest/v1/study_sessions?{query}",
        headers=_service_headers("return=representation"),
        payload={"share_token": None},
    ) or []
    if not updated_rows:
        raise HTTPException(status_code=404, detail="Study session not found.")


def get_shared_session(viewer_id: str, token: str) -> dict:
    row = _get_shared_session_row(token)
    owner_id = str(row["user_id"])
    session_id = str(row["id"])
    # Reuse the owner-scoped loader; its extra study_sessions read is the price
    # of not refactoring get_session_detail.
    detail = get_session_detail(owner_id, session_id)

    fav_query = parse.urlencode(
        {"user_id": f"eq.{viewer_id}", "session_id": f"eq.{session_id}", "select": "session_id"}
    )
    fav_rows = _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/shared_favorites?{fav_query}",
        headers=_service_headers(),
    ) or []

    detail["creator_name"] = _creator_name(owner_id)
    detail["is_favorited"] = bool(fav_rows)
    return detail


def add_favorite(user_id: str, token: str) -> None:
    row = _get_shared_session_row(token)
    _request_json(
        "POST",
        f"{settings.supabase_url}/rest/v1/shared_favorites",
        headers=_service_headers("resolution=merge-duplicates,return=minimal"),
        payload={"user_id": user_id, "session_id": str(row["id"])},
    )


def remove_favorite(user_id: str, session_id: str) -> None:
    query = parse.urlencode({"user_id": f"eq.{user_id}", "session_id": f"eq.{session_id}"})
    _request_json(
        "DELETE",
        f"{settings.supabase_url}/rest/v1/shared_favorites?{query}",
        headers=_service_headers(),
    )


def list_favorites(user_id: str) -> dict:
    fav_query = parse.urlencode(
        {
            "user_id": f"eq.{user_id}",
            "select": "session_id,created_at",
            "order": "created_at.desc",
        }
    )
    favorites = _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/shared_favorites?{fav_query}",
        headers=_service_headers(),
    ) or []
    if not favorites:
        return {"items": []}

    # Deleted sessions are already gone from favorites via ON DELETE CASCADE;
    # this filter additionally hides revoked (unshared) ones, which reappear if
    # the owner re-shares.
    session_ids = ",".join(str(fav["session_id"]) for fav in favorites)
    session_query = parse.urlencode(
        {
            "id": f"in.({session_ids})",
            "share_token": "not.is.null",
            "select": "id,user_id,title,source_text,share_token",
        }
    )
    sessions = _request_json(
        "GET",
        f"{settings.supabase_url}/rest/v1/study_sessions?{session_query}",
        headers=_service_headers(),
    ) or []
    sessions_by_id = {str(session["id"]): session for session in sessions}

    owner_ids = {str(session["user_id"]) for session in sessions}
    names: dict[str, str | None] = {}
    if owner_ids:
        profile_query = parse.urlencode(
            {"id": f"in.({','.join(sorted(owner_ids))})", "select": "id,display_name"}
        )
        profile_rows = _request_json(
            "GET",
            f"{settings.supabase_url}/rest/v1/profiles?{profile_query}",
            headers=_service_headers(),
        ) or []
        names = {str(profile["id"]): profile.get("display_name") for profile in profile_rows}

    items = []
    for fav in favorites:
        session = sessions_by_id.get(str(fav["session_id"]))
        if not session:
            continue
        title = session.get("title") or build_session_title(session.get("source_text") or "")
        items.append(
            {
                "session_id": str(session["id"]),
                "title": title,
                "creator_name": names.get(str(session["user_id"])),
                "share_token": session["share_token"],
                "favorited_at": fav["created_at"],
            }
        )
    return {"items": items}


def fork_shared_session(user_id: str, token: str) -> dict:
    """Copy a shared article into the caller's own sessions. The copy belongs
    entirely to the caller — deleting or unsharing the original never touches
    it. No AI calls: all fields were computed when the owner built the article."""
    row = _get_shared_session_row(token)
    detail = get_session_detail(str(row["user_id"]), str(row["id"]))
    return save_session(user_id, detail["text"], detail["sentences"], None)
