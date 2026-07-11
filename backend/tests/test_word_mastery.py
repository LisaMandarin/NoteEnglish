import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from app.services import supabase as sb

NOW = datetime(2026, 7, 9, 12, 0, 0, tzinfo=timezone.utc)


class ComputeMasteryUpdateTests(unittest.TestCase):
    def test_first_correct_answer_is_learning(self):
        update = sb.compute_mastery_update({}, {"correct": 1, "wrong": 0}, 1, NOW)

        self.assertEqual(update["level"], sb.MASTERY_LEARNING)
        self.assertEqual(update["correct_count"], 1)
        self.assertEqual(update["wrong_count"], 0)
        self.assertEqual(update["last_result_at"], NOW.isoformat())

    def test_two_correct_types_reach_mastered(self):
        update = sb.compute_mastery_update(
            {"correct_count": 3, "wrong_count": 1},
            {"correct": 1, "wrong": 0},
            2,
            NOW,
        )

        self.assertEqual(update["level"], sb.MASTERY_MASTERED)

    def test_wrong_answer_drops_back_to_learning(self):
        update = sb.compute_mastery_update(
            {"correct_count": 5, "wrong_count": 0},
            {"correct": 1, "wrong": 1},
            3,
            NOW,
        )

        self.assertEqual(update["level"], sb.MASTERY_LEARNING)
        self.assertEqual(update["correct_count"], 6)
        self.assertEqual(update["wrong_count"], 1)


class ProficiencyTests(unittest.TestCase):
    def _rows(self):
        return [
            # session-1, older word run (2/4): must be ignored — latest run wins.
            {"session_id": "session-1", "quiz_type": "cloze", "correct": True, "answered_at": "2026-07-08T10:00:00+00:00"},
            {"session_id": "session-1", "quiz_type": "cloze", "correct": True, "answered_at": "2026-07-08T10:00:00+00:00"},
            {"session_id": "session-1", "quiz_type": "matching", "correct": False, "answered_at": "2026-07-08T10:00:00+00:00"},
            {"session_id": "session-1", "quiz_type": "spelling", "correct": False, "answered_at": "2026-07-08T10:00:00+00:00"},
            # session-1, latest word run: all correct → 100%.
            {"session_id": "session-1", "quiz_type": "cloze", "correct": True, "answered_at": "2026-07-09T10:00:00+00:00"},
            {"session_id": "session-1", "quiz_type": "matching", "correct": True, "answered_at": "2026-07-09T10:00:00+00:00"},
            # session-1, article group (dictation 1/2, earlier run than the word one).
            {"session_id": "session-1", "quiz_type": "dictation", "correct": True, "answered_at": "2026-07-08T10:00:00+00:00"},
            {"session_id": "session-1", "quiz_type": "dictation", "correct": False, "answered_at": "2026-07-08T10:00:00+00:00"},
            # session-2: comprehension only, 1/2 → article 50%, no word score.
            {"session_id": "session-2", "quiz_type": "comprehension", "correct": True, "answered_at": "2026-07-09T09:00:00+00:00"},
            {"session_id": "session-2", "quiz_type": "comprehension", "correct": False, "answered_at": "2026-07-09T09:00:00+00:00"},
        ]

    def test_latest_run_per_group_no_weights_no_history(self):
        with patch.object(sb, "_request_json", return_value=self._rows()):
            scores = sb.proficiency_by_session("user-1", ["session-1", "session-2"])

        # Word score = latest word run only (2/2), not the older 2/4 run.
        # Article score = latest dictation run (1/2); groups stay independent.
        self.assertEqual(scores["session-1"], {"word": 100, "article": 50})
        # Never took a word quiz → no "word" key at all.
        self.assertEqual(scores["session-2"], {"article": 50})

    def test_failure_returns_empty_and_never_raises(self):
        with patch.object(sb, "_request_json", side_effect=RuntimeError("boom")):
            self.assertEqual(sb.proficiency_by_session("user-1", ["session-1"]), {})

    def test_no_sessions_short_circuits(self):
        self.assertEqual(sb.proficiency_by_session("user-1", []), {})


class UpdateWordMasteryTests(unittest.TestCase):
    def test_upsert_payload_contains_level_and_counters(self):
        results = [
            {"quiz_type": "cloze", "lemma": "abandon", "pos": "v.", "correct": True},
            {"quiz_type": "matching", "lemma": "abandon", "pos": "v.", "correct": True},
            {"quiz_type": "dictation", "lemma": None, "pos": None, "correct": True},
        ]
        calls = []

        def fake_request(method, url, headers=None, payload=None):
            calls.append((method, url, payload))
            if "word_mastery" in url and method == "GET":
                return [
                    {"lemma": "abandon", "pos": "v.", "correct_count": 1,
                     "wrong_count": 0, "level": 1},
                ]
            if "quiz_results" in url:
                return [
                    {"lemma": "abandon", "pos": "v.", "quiz_type": "cloze"},
                    {"lemma": "abandon", "pos": "v.", "quiz_type": "matching"},
                ]
            return []

        with patch.object(sb, "_request_json", side_effect=fake_request):
            sb.update_word_mastery("user-1", results)

        upserts = [c for c in calls if c[0] == "POST" and "word_mastery" in c[1]]
        self.assertEqual(len(upserts), 1)
        rows = upserts[0][2]
        self.assertEqual(len(rows), 1)  # dictation row has no word identity
        row = rows[0]
        self.assertEqual(row["lemma"], "abandon")
        self.assertEqual(row["level"], sb.MASTERY_MASTERED)
        self.assertEqual(row["correct_count"], 3)
        self.assertNotIn("next_review_at", row)

    def test_failure_is_swallowed(self):
        with patch.object(sb, "_request_json", side_effect=RuntimeError("boom")):
            sb.update_word_mastery(
                "user-1",
                [{"quiz_type": "cloze", "lemma": "x", "pos": "n.", "correct": True}],
            )  # must not raise


class QuizRunHistoryTests(unittest.TestCase):
    def test_get_quiz_runs_groups_by_batch_and_joins_titles(self):
        def fake_request(method, url, headers=None, payload=None):
            if "quiz_results" in url:
                return [
                    {"session_id": "s1", "quiz_type": "cloze", "correct": True,
                     "answered_at": "2026-07-11T10:00:00+00:00"},
                    {"session_id": "s1", "quiz_type": "dictation", "correct": False,
                     "answered_at": "2026-07-11T10:00:00+00:00"},
                    {"session_id": None, "quiz_type": "matching", "correct": True,
                     "answered_at": "2026-07-10T09:00:00+00:00"},
                ]
            if "study_sessions" in url:
                return [{"id": "s1", "title": "文章一"}]
            return []

        with patch.object(sb, "_request_json", side_effect=fake_request):
            runs = sb.get_quiz_runs("user-1")

        self.assertEqual(len(runs), 2)
        self.assertEqual(runs[0]["session_title"], "文章一")
        self.assertEqual(runs[0]["quiz_types"], ["cloze", "dictation"])
        self.assertEqual(runs[0]["correct"], 1)
        self.assertEqual(runs[0]["total"], 2)
        self.assertIsNone(runs[1]["session_id"])
        self.assertIsNone(runs[1]["session_title"])

    def test_delete_quiz_run_deletes_batch_and_rebuilds_words(self):
        calls = []

        def fake_request(method, url, headers=None, payload=None):
            calls.append((method, url))
            if method == "GET" and "quiz_results" in url:
                return [
                    {"lemma": "abandon", "pos": "v."},
                    {"lemma": None, "pos": None},  # dictation row: no word
                ]
            return []

        with patch.object(sb, "_request_json", side_effect=fake_request), \
                patch.object(sb, "rebuild_word_mastery") as rebuild:
            deleted = sb.delete_quiz_run("user-1", "2026-07-11T10:00:00+00:00", "s1")

        self.assertEqual(deleted, 2)
        self.assertTrue(any(m == "DELETE" and "quiz_results" in u for m, u in calls))
        rebuild.assert_called_once_with("user-1", [("abandon", "v.")])

    def test_delete_quiz_run_missing_returns_zero(self):
        with patch.object(sb, "_request_json", return_value=[]), \
                patch.object(sb, "rebuild_word_mastery") as rebuild:
            deleted = sb.delete_quiz_run("user-1", "2026-07-11T10:00:00+00:00", None)

        self.assertEqual(deleted, 0)
        rebuild.assert_not_called()

    def test_rebuild_replays_remaining_batches(self):
        calls = []

        def fake_request(method, url, headers=None, payload=None):
            calls.append((method, url, payload))
            if method == "GET" and "quiz_results" in url:
                return [
                    # one remaining batch: correct in two different types
                    {"lemma": "abandon", "pos": "v.", "quiz_type": "cloze",
                     "correct": True, "answered_at": "2026-07-10T09:00:00+00:00"},
                    {"lemma": "abandon", "pos": "v.", "quiz_type": "matching",
                     "correct": True, "answered_at": "2026-07-10T09:00:00+00:00"},
                ]
            return []

        with patch.object(sb, "_request_json", side_effect=fake_request):
            sb.rebuild_word_mastery("user-1", [("abandon", "v."), ("vanish", "v.")])

        upserts = [c for c in calls if c[0] == "POST" and "word_mastery" in c[1]]
        self.assertEqual(len(upserts), 1)
        rows = upserts[0][2]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["lemma"], "abandon")
        self.assertEqual(rows[0]["level"], sb.MASTERY_MASTERED)
        self.assertEqual(rows[0]["correct_count"], 2)
        self.assertEqual(rows[0]["last_result_at"], "2026-07-10T09:00:00+00:00")
        # vanish has no remaining rows → its mastery row is deleted
        deletes = [c for c in calls if c[0] == "DELETE" and "word_mastery" in c[1]]
        self.assertEqual(len(deletes), 1)
        self.assertIn("vanish", deletes[0][1])


class DeleteSessionQuizResultsTests(unittest.TestCase):
    def test_deletes_results_and_rebuilds_words(self):
        calls = []

        def fake_request(method, url, headers=None, payload=None):
            calls.append((method, url))
            if method == "GET" and "quiz_results" in url:
                return [
                    {"lemma": "abandon", "pos": "v."},
                    {"lemma": None, "pos": None},
                ]
            return []

        with patch.object(sb, "_request_json", side_effect=fake_request), \
                patch.object(sb, "rebuild_word_mastery") as rebuild:
            sb.delete_session_quiz_results("user-1", "s1")

        self.assertTrue(any(m == "DELETE" and "quiz_results" in u for m, u in calls))
        rebuild.assert_called_once_with("user-1", [("abandon", "v.")])

    def test_no_results_is_a_noop(self):
        calls = []

        def fake_request(method, url, headers=None, payload=None):
            calls.append((method, url))
            return []

        with patch.object(sb, "_request_json", side_effect=fake_request), \
                patch.object(sb, "rebuild_word_mastery") as rebuild:
            sb.delete_session_quiz_results("user-1", "s1")

        self.assertFalse(any(m == "DELETE" for m, _ in calls))
        rebuild.assert_not_called()

    def test_failure_is_swallowed(self):
        with patch.object(sb, "_request_json", side_effect=RuntimeError("boom")):
            sb.delete_session_quiz_results("user-1", "s1")  # must not raise
