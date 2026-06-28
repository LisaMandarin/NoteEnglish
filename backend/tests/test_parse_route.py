import unittest
from unittest.mock import patch, MagicMock

from fastapi import HTTPException

from app.routes import parse as parse_route
from app.models.parse import ParseRequest

USER = {"id": "user-1"}
USAGE = {"prompt_tokens": 1, "response_tokens": 2, "total_tokens": 3}

# spaCy's wrong parse for "Washington, aware …, began …": root is the adjective.
UNRELIABLE = {
    "tokens": [
        {"text": "Washington", "dep": "nsubj", "head": 1},
        {"text": "aware", "dep": "ROOT", "head": 1},
        {"text": "began", "dep": "conj", "head": 1},
    ],
    "reliable": False,
}
# Gemini's corrected parse: the finite verb is the root.
FIXED_TOKENS = [
    {"text": "Washington", "dep": "nsubj", "head": 2},
    {"text": "aware", "dep": "amod", "head": 0},
    {"text": "began", "dep": "ROOT", "head": 2},
]


class ParseRouteTests(unittest.TestCase):
    def _call(self, sentence="s"):
        return parse_route.parse(ParseRequest(sentence=sentence), user=USER)

    def test_reliable_parse_skips_gemini(self):
        reliable = {"tokens": [{"text": "ran", "dep": "ROOT", "head": 0}], "reliable": True}
        with (
            patch.object(parse_route, "parse_dependencies", return_value=reliable),
            patch.object(parse_route, "ai_reparse_dependencies") as reparse,
            patch.object(parse_route, "log_api_usage") as log,
            patch.object(parse_route, "cache_parse") as cache,
        ):
            res = self._call()

        reparse.assert_not_called()
        log.assert_not_called()
        cache.assert_not_called()
        self.assertTrue(res.reliable)
        self.assertEqual(res.tokens[0].text, "ran")

    def test_unreliable_parse_falls_back_to_gemini_and_caches(self):
        with (
            patch.object(parse_route, "parse_dependencies", return_value=UNRELIABLE),
            patch.object(parse_route, "ai_reparse_dependencies", return_value=(FIXED_TOKENS, USAGE)) as reparse,
            patch.object(parse_route, "log_api_usage") as log,
            patch.object(parse_route, "cache_parse") as cache,
        ):
            res = self._call("Washington, aware …, began …")

        reparse.assert_called_once_with(UNRELIABLE["tokens"])
        log.assert_called_once()
        self.assertEqual(log.call_args.args[0], "user-1")
        self.assertEqual(log.call_args.args[1], "parse")
        self.assertEqual(log.call_args.args[3], USAGE)
        cache.assert_called_once()
        self.assertEqual(cache.call_args.kwargs, {"reliable": True})
        # Corrected parse is returned, now flagged reliable.
        self.assertTrue(res.reliable)
        self.assertEqual([t.dep for t in res.tokens], ["nsubj", "amod", "ROOT"])

    def test_gemini_failure_keeps_spacy_parse_and_warns(self):
        with (
            patch.object(parse_route, "parse_dependencies", return_value=UNRELIABLE),
            patch.object(parse_route, "ai_reparse_dependencies", side_effect=HTTPException(502, "boom")),
            patch.object(parse_route, "log_api_usage") as log,
            patch.object(parse_route, "cache_parse") as cache,
        ):
            res = self._call()

        # No usage logged, nothing cached, and the spaCy parse survives with the warning.
        log.assert_not_called()
        cache.assert_not_called()
        self.assertFalse(res.reliable)
        self.assertEqual([t.text for t in res.tokens], ["Washington", "aware", "began"])

    def test_empty_parse_does_not_trigger_gemini(self):
        empty = {"tokens": [], "reliable": True}
        with (
            patch.object(parse_route, "parse_dependencies", return_value=empty),
            patch.object(parse_route, "ai_reparse_dependencies") as reparse,
        ):
            res = self._call("")

        reparse.assert_not_called()
        self.assertEqual(res.tokens, [])


if __name__ == "__main__":
    unittest.main()
