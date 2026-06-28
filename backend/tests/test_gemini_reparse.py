import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.services import gemini


VALID_TREE = [
    {"text": "She", "dep": "nsubj", "head": 1},
    {"text": "reads", "dep": "ROOT", "head": 1},
    {"text": "books", "dep": "dobj", "head": 1},
    {"text": ".", "dep": "punct", "head": 1},
]


class DependencyTreeValidationTests(unittest.TestCase):
    def assert_invalid(self, tokens: list[dict], detail: str) -> None:
        with self.assertRaises(HTTPException) as raised:
            gemini._validate_dependency_tree(tokens)

        self.assertEqual(raised.exception.status_code, 502)
        self.assertIn(detail, raised.exception.detail)

    def test_valid_tree_is_accepted(self):
        gemini._validate_dependency_tree(VALID_TREE)

    def test_multilevel_tree_is_accepted(self):
        tokens = [
            {"text": "wants", "dep": "ROOT", "head": 0},
            {"text": "read", "dep": "xcomp", "head": 0},
            {"text": "books", "dep": "dobj", "head": 1},
        ]

        gemini._validate_dependency_tree(tokens)

    def test_tree_requires_exactly_one_root(self):
        no_root = [
            {"text": "She", "dep": "nsubj", "head": 1},
            {"text": "reads", "dep": "conj", "head": 0},
        ]
        two_roots = [
            {"text": "She", "dep": "ROOT", "head": 0},
            {"text": "reads", "dep": "ROOT", "head": 1},
        ]

        self.assert_invalid(no_root, "exactly one ROOT")
        self.assert_invalid(two_roots, "exactly one ROOT")

    def test_root_must_point_to_itself(self):
        tokens = [dict(token) for token in VALID_TREE]
        tokens[1]["head"] = 2

        self.assert_invalid(tokens, "ROOT must point to itself")

    def test_non_root_cannot_point_to_itself(self):
        tokens = [dict(token) for token in VALID_TREE]
        tokens[0]["head"] = 0

        self.assert_invalid(tokens, "non-ROOT token points to itself")

    def test_disconnected_cycle_is_rejected(self):
        tokens = [dict(token) for token in VALID_TREE]
        tokens[2]["head"] = 3
        tokens[3]["head"] = 2

        self.assert_invalid(tokens, "dependency cycle detected")


class DependencyLabelValidationTests(unittest.TestCase):
    def test_unknown_dependency_label_is_rejected(self):
        model_output = [
            {"i": 0, "dep": "subject", "head": 1},
            {"i": 1, "dep": "ROOT", "head": 1},
        ]
        response = SimpleNamespace(
            text=json.dumps(model_output),
            usage_metadata=None,
        )
        source_tokens = [{"text": "She"}, {"text": "reads"}]

        with (
            patch.object(
                gemini.client.models,
                "generate_content",
                return_value=response,
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            gemini.ai_reparse_dependencies(source_tokens)

        self.assertEqual(raised.exception.status_code, 502)
        self.assertIn("unsupported dependency label", raised.exception.detail)


if __name__ == "__main__":
    unittest.main()
