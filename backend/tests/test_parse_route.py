import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.routes import parse as parse_route
from app.models.parse import ParseRequest

USER = {"id": "user-1"}
USAGE = {"prompt_tokens": 1, "response_tokens": 2, "total_tokens": 3}

STRUCTURE = {
    "text": "She reads books.",
    "role": "ROOT",
    "type": "clause",
    "label": "主要子句",
    "pattern": "SVO",
    "children": [
        {"text": "She", "role": "S", "type": "word", "label": "主詞"},
        {"text": "reads", "role": "V", "type": "word", "label": "動詞"},
        {"text": "books", "role": "O", "type": "word", "label": "受詞"},
        {"text": ".", "role": "PUNCT", "type": "word", "label": "標點"},
    ],
}


class ParseRouteTests(unittest.TestCase):
    def _call(self, sentence="She reads books."):
        return parse_route.parse(ParseRequest(sentence=sentence), user=USER)

    def test_fresh_analysis_logs_usage(self):
        with (
            patch.object(parse_route, "get_structure", return_value=(STRUCTURE, USAGE)),
            patch.object(parse_route, "log_api_usage") as log,
        ):
            res = self._call()

        log.assert_called_once()
        self.assertEqual(log.call_args.args[0], "user-1")
        self.assertEqual(log.call_args.args[1], "parse")
        self.assertEqual(log.call_args.args[3], USAGE)
        self.assertEqual(res.structure.pattern, "SVO")

    def test_cache_hit_does_not_log_usage(self):
        with (
            patch.object(parse_route, "get_structure", return_value=(STRUCTURE, None)),
            patch.object(parse_route, "log_api_usage") as log,
        ):
            res = self._call()

        log.assert_not_called()
        self.assertEqual(res.structure.role, "ROOT")

    def test_incomplete_sentence_error_propagates(self):
        with (
            patch.object(
                parse_route,
                "get_structure",
                side_effect=HTTPException(422, "分析句構只適用於完整的句子"),
            ),
            patch.object(parse_route, "log_api_usage") as log,
        ):
            with self.assertRaises(HTTPException) as raised:
                self._call("In the morning.")

        self.assertEqual(raised.exception.status_code, 422)
        log.assert_not_called()

    def test_ai_failure_propagates(self):
        with (
            patch.object(parse_route, "get_structure", side_effect=HTTPException(502, "boom")),
            patch.object(parse_route, "log_api_usage") as log,
        ):
            with self.assertRaises(HTTPException) as raised:
                self._call()

        self.assertEqual(raised.exception.status_code, 502)
        log.assert_not_called()


if __name__ == "__main__":
    unittest.main()
