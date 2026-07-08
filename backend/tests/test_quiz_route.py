import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.routes import quiz as quiz_route
from app.models.quiz import QuizGenerateRequest, QuizResultItem, QuizResultsRequest

USER = {"id": "user-1"}
USAGE = {"prompt_tokens": 10, "response_tokens": 20, "total_tokens": 30}

QUESTIONS = [
    {
        "question": "What did the government decide?",
        "options": ["Keep the policy", "Abandon the policy", "Fund the policy", "Debate forever"],
        "answer_index": 1,
        "explanation": "文章提到政府決定放棄舊政策。",
    },
    {
        "question": "How was the harvest?",
        "options": ["Poor", "Average", "Abundant", "Delayed"],
        "answer_index": 2,
        "explanation": "文中說今年豐收。",
    },
    {
        "question": "What preceded the decision?",
        "options": ["An election", "Years of debate", "A drought", "A protest"],
        "answer_index": 1,
        "explanation": "決定前經過多年辯論。",
    },
]

SESSION_DETAIL = {
    "session": {"id": "session-1", "title": "Test"},
    "text": "The government decided to abandon the old policy after years of debate.",
    "sentences": [],
}


class QuizGenerateTests(unittest.TestCase):
    def _call(self, regenerate=False):
        return quiz_route.quiz_generate(
            QuizGenerateRequest(session_id="session-1", regenerate=regenerate),
            user=USER,
        )

    def test_cache_hit_skips_ai_and_usage(self):
        with (
            patch.object(quiz_route, "get_session_detail", return_value=SESSION_DETAIL),
            patch.object(quiz_route, "get_quiz_questions", return_value=QUESTIONS),
            patch.object(quiz_route, "ai_generate_quiz") as generate,
            patch.object(quiz_route, "log_api_usage") as log,
            patch.object(quiz_route, "replace_quiz_questions") as replace,
        ):
            res = self._call()

        generate.assert_not_called()
        log.assert_not_called()
        replace.assert_not_called()
        self.assertEqual(len(res["questions"]), 3)

    def test_cache_miss_generates_saves_and_logs(self):
        with (
            patch.object(quiz_route, "get_session_detail", return_value=SESSION_DETAIL),
            patch.object(quiz_route, "get_quiz_questions", return_value=[]),
            patch.object(quiz_route, "ai_generate_quiz", return_value=(QUESTIONS, USAGE)) as generate,
            patch.object(quiz_route, "log_api_usage") as log,
            patch.object(quiz_route, "replace_quiz_questions") as replace,
        ):
            res = self._call()

        generate.assert_called_once_with(SESSION_DETAIL["text"])
        log.assert_called_once()
        self.assertEqual(log.call_args.args[0], "user-1")
        self.assertEqual(log.call_args.args[1], "quiz")
        self.assertEqual(log.call_args.args[3], USAGE)
        replace.assert_called_once_with("user-1", "session-1", QUESTIONS)
        self.assertEqual(len(res["questions"]), 3)

    def test_regenerate_bypasses_cache(self):
        with (
            patch.object(quiz_route, "get_session_detail", return_value=SESSION_DETAIL),
            patch.object(quiz_route, "get_quiz_questions", return_value=QUESTIONS) as cached,
            patch.object(quiz_route, "ai_generate_quiz", return_value=(QUESTIONS, USAGE)) as generate,
            patch.object(quiz_route, "log_api_usage"),
            patch.object(quiz_route, "replace_quiz_questions"),
        ):
            self._call(regenerate=True)

        cached.assert_not_called()
        generate.assert_called_once()

    def test_empty_article_rejected(self):
        with (
            patch.object(
                quiz_route,
                "get_session_detail",
                return_value={"session": {}, "text": "  ", "sentences": []},
            ),
            patch.object(quiz_route, "get_quiz_questions", return_value=[]),
            patch.object(quiz_route, "ai_generate_quiz") as generate,
        ):
            with self.assertRaises(HTTPException) as raised:
                self._call()

        self.assertEqual(raised.exception.status_code, 422)
        generate.assert_not_called()

    def test_unowned_session_propagates_404(self):
        with patch.object(
            quiz_route,
            "get_session_detail",
            side_effect=HTTPException(404, "Study session not found."),
        ):
            with self.assertRaises(HTTPException) as raised:
                self._call()

        self.assertEqual(raised.exception.status_code, 404)


class QuizResultsTests(unittest.TestCase):
    def _request(self):
        return QuizResultsRequest(
            session_id="session-1",
            results=[
                QuizResultItem(quiz_type="cloze", lemma="abandon", pos="v.", correct=True),
                QuizResultItem(quiz_type="dictation", correct=False),
            ],
        )

    def test_inserts_results_and_updates_mastery(self):
        with (
            patch.object(quiz_route, "insert_quiz_results") as insert,
            patch.object(quiz_route, "update_word_mastery") as mastery,
        ):
            res = quiz_route.quiz_results(self._request(), user=USER)

        self.assertEqual(res, {"saved": 2})
        insert.assert_called_once()
        self.assertEqual(insert.call_args.args[0], "user-1")
        self.assertEqual(insert.call_args.args[1], "session-1")
        self.assertEqual(len(insert.call_args.args[2]), 2)
        mastery.assert_called_once()
        self.assertEqual(mastery.call_args.args[1][0]["lemma"], "abandon")


class VocabPoolTests(unittest.TestCase):
    def test_returns_pool_items(self):
        pool = [{"lemma": "abandon", "pos": "v.", "text": "abandon", "translation": "放棄"}]
        with patch.object(quiz_route, "get_vocab_pool", return_value=pool) as get_pool:
            res = quiz_route.quiz_vocab_pool(user=USER)

        get_pool.assert_called_once_with("user-1")
        self.assertEqual(res, {"items": pool})


class MasteryAndReviewTests(unittest.TestCase):
    def test_mastery_returns_rows(self):
        rows = [{"lemma": "abandon", "pos": "v.", "level": 2, "correct_count": 3,
                 "wrong_count": 1, "next_review_at": "2026-07-12T00:00:00+00:00"}]
        with patch.object(quiz_route, "get_word_mastery", return_value=rows) as get_rows:
            res = quiz_route.quiz_mastery(user=USER)

        get_rows.assert_called_once_with("user-1")
        self.assertEqual(res, {"items": rows})

    def test_review_words_returns_due_vocab(self):
        words = [{"lemma": "abandon", "pos": "v.", "text": "abandon",
                  "translation": "放棄", "definition": "to give up"}]
        with patch.object(quiz_route, "get_review_words", return_value=words) as get_words:
            res = quiz_route.quiz_review_words(user=USER)

        get_words.assert_called_once_with("user-1")
        self.assertEqual(res, {"items": words})
