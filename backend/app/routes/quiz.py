from fastapi import APIRouter, Depends, HTTPException
from google.genai.errors import APIError

from app.core.auth import require_user
from app.core.config import settings
from app.models.quiz import (
    QuizGenerateRequest,
    QuizGenerateResponse,
    QuizResultsRequest,
    QuizResultsResponse,
    QuizRunDeleteResponse,
    QuizRunsResponse,
    VocabPoolResponse,
    WordMasteryResponse,
)
from app.services.gemini import ai_generate_quiz
from app.services.supabase import (
    delete_quiz_run,
    get_quiz_questions,
    get_quiz_runs,
    get_session_detail,
    get_vocab_pool,
    get_word_mastery,
    insert_quiz_results,
    log_api_usage,
    replace_quiz_questions,
    update_word_mastery,
)

router = APIRouter(tags=["quiz"])


# Generate (or return cached) reading-comprehension questions for a session.
# Answers are included: the frontend grades locally without another AI call.
@router.post("/quiz/generate", response_model=QuizGenerateResponse)
def quiz_generate(req: QuizGenerateRequest, user: dict = Depends(require_user)):
    # Also enforces ownership: 404 when the session is not the user's.
    detail = get_session_detail(user["id"], req.session_id)

    if not req.regenerate:
        cached = get_quiz_questions(user["id"], req.session_id)
        if cached:
            return {"questions": cached}

    article = (detail.get("text") or "").strip()
    if not article:
        raise HTTPException(status_code=422, detail="這個學習紀錄沒有文章內容，無法出題。")

    try:
        questions, usage = ai_generate_quiz(article)
    except APIError as e:
        msg = str(e)
        if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
            raise HTTPException(status_code=429, detail="AI 查詢額度已用盡，請稍後再試。")
        if "UNAVAILABLE" in msg or "503" in msg:
            raise HTTPException(status_code=503, detail="AI 服務暫時忙碌，請稍後再試。")
        raise HTTPException(status_code=502, detail="AI 服務發生錯誤，請稍後再試。")

    log_api_usage(user["id"], "quiz", settings.gemini_model, usage)
    replace_quiz_questions(user["id"], req.session_id, questions)
    return {"questions": questions}


@router.post("/quiz/results", response_model=QuizResultsResponse)
def quiz_results(req: QuizResultsRequest, user: dict = Depends(require_user)):
    results = [item.model_dump() for item in req.results]
    insert_quiz_results(user["id"], req.session_id, results)
    # Derived counters; failures are logged inside and never fail the request.
    update_word_mastery(user["id"], results)
    return {"saved": len(results)}


# Cross-article distractor pool for multiple-choice options.
@router.get("/quiz/vocab-pool", response_model=VocabPoolResponse)
def quiz_vocab_pool(user: dict = Depends(require_user)):
    return {"items": get_vocab_pool(user["id"])}


# Per-word mastery levels for the badges on vocab cards.
@router.get("/quiz/mastery", response_model=WordMasteryResponse)
def quiz_mastery(user: dict = Depends(require_user)):
    return {"items": get_word_mastery(user["id"])}


# Quiz history: one item per submitted run, newest first.
@router.get("/quiz/runs", response_model=QuizRunsResponse)
def quiz_runs(user: dict = Depends(require_user)):
    return {"items": get_quiz_runs(user["id"])}


# Delete one run; affected words' mastery is rebuilt from what remains.
@router.delete("/quiz/runs", response_model=QuizRunDeleteResponse)
def quiz_run_delete(
    answered_at: str,
    session_id: str | None = None,
    user: dict = Depends(require_user),
):
    deleted = delete_quiz_run(user["id"], answered_at, session_id)
    if deleted == 0:
        raise HTTPException(status_code=404, detail="找不到這筆測驗紀錄。")
    return {"deleted": deleted}
