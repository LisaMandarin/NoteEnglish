import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.services import supabase as sb

NOW = datetime(2026, 7, 9, 12, 0, 0, tzinfo=timezone.utc)


class ComputeMasteryUpdateTests(unittest.TestCase):
    def test_first_correct_answer_is_learning_with_one_day_review(self):
        update = sb.compute_mastery_update({}, {"correct": 1, "wrong": 0}, 1, NOW)

        self.assertEqual(update["level"], sb.MASTERY_LEARNING)
        self.assertEqual(update["correct_count"], 1)
        self.assertEqual(update["wrong_count"], 0)
        self.assertEqual(update["review_interval_days"], 1)
        self.assertEqual(update["next_review_at"], (NOW + timedelta(days=1)).isoformat())

    def test_two_correct_types_reach_mastered(self):
        update = sb.compute_mastery_update(
            {"correct_count": 3, "wrong_count": 1, "review_interval_days": 1},
            {"correct": 1, "wrong": 0},
            2,
            NOW,
        )

        self.assertEqual(update["level"], sb.MASTERY_MASTERED)
        self.assertEqual(update["review_interval_days"], 3)
        self.assertEqual(update["next_review_at"], (NOW + timedelta(days=3)).isoformat())

    def test_wrong_answer_drops_back_and_resets_review_to_tomorrow(self):
        update = sb.compute_mastery_update(
            {"correct_count": 5, "wrong_count": 0, "review_interval_days": 7},
            {"correct": 1, "wrong": 1},
            3,
            NOW,
        )

        self.assertEqual(update["level"], sb.MASTERY_LEARNING)
        self.assertEqual(update["review_interval_days"], 0)
        self.assertEqual(update["next_review_at"], (NOW + timedelta(days=1)).isoformat())
        self.assertEqual(update["correct_count"], 6)
        self.assertEqual(update["wrong_count"], 1)

    def test_interval_ladder_climbs_and_caps_at_fourteen(self):
        self.assertEqual(sb._next_interval_days(0), 1)
        self.assertEqual(sb._next_interval_days(1), 3)
        self.assertEqual(sb._next_interval_days(3), 7)
        self.assertEqual(sb._next_interval_days(7), 14)
        self.assertEqual(sb._next_interval_days(14), 14)


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
    def test_upsert_payload_contains_level_and_srs_fields(self):
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
                     "wrong_count": 0, "level": 1, "review_interval_days": 1},
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
        self.assertEqual(row["review_interval_days"], 3)
        self.assertIn("next_review_at", row)

    def test_failure_is_swallowed(self):
        with patch.object(sb, "_request_json", side_effect=RuntimeError("boom")):
            sb.update_word_mastery(
                "user-1",
                [{"quiz_type": "cloze", "lemma": "x", "pos": "n.", "correct": True}],
            )  # must not raise
