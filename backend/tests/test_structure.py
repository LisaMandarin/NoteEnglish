import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.services import gemini, structure


# A minimal valid analysis of "She reads books." whose leaf texts reconstruct it.
VALID_TREE = {
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


def _response(payload) -> SimpleNamespace:
    return SimpleNamespace(text=json.dumps(payload), usage_metadata=None)


class ReconstructionTests(unittest.TestCase):
    def test_leaf_texts_reproduce_sentence_ignoring_whitespace(self):
        self.assertTrue(gemini._reconstructs_sentence(VALID_TREE, "She reads books."))
        self.assertTrue(gemini._reconstructs_sentence(VALID_TREE, "She  reads books ."))

    def test_dropped_word_is_detected(self):
        self.assertFalse(gemini._reconstructs_sentence(VALID_TREE, "She reads many books."))

    def test_quote_and_case_style_is_tolerated(self):
        tree = {
            "text": "", "role": "ROOT", "type": "clause", "label": "主要子句", "pattern": "SVO",
            "children": [
                {"text": "He", "role": "S", "type": "word", "label": "主詞"},
                {"text": "said", "role": "V", "type": "word", "label": "動詞"},
                {"text": '"ok"', "role": "O", "type": "word", "label": "受詞"},
            ],
        }
        # Sentence uses curly quotes + different case; must still reconstruct.
        self.assertTrue(gemini._reconstructs_sentence(tree, "he said “OK”"))


class AnalyzeStructureTests(unittest.TestCase):
    def test_valid_output_is_accepted(self):
        with patch.object(
            gemini.client.models, "generate_content", return_value=_response(VALID_TREE)
        ) as gen:
            result, usage = gemini.ai_analyze_structure("She reads books.")

        gen.assert_called_once()
        self.assertEqual(result["pattern"], "SVO")
        self.assertEqual([c["role"] for c in result["children"]], ["S", "V", "O", "PUNCT"])
        self.assertIn("total_tokens", usage)

    def test_invalid_schema_raises_after_retries(self):
        bad = {"text": "x", "role": "SUBJECT", "type": "word", "label": "主詞"}
        with patch.object(
            gemini.client.models, "generate_content", return_value=_response(bad)
        ) as gen:
            with self.assertRaises(HTTPException) as raised:
                gemini.ai_analyze_structure("x")

        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(gen.call_count, gemini._STRUCTURE_ATTEMPTS)

    def test_retry_uses_corrective_hint_and_nonzero_temperature(self):
        with patch.object(
            gemini.client.models,
            "generate_content",
            side_effect=[_response({"nope": 1}), _response(VALID_TREE)],
        ) as gen:
            gemini.ai_analyze_structure("She reads books.")

        first, second = gen.call_args_list
        self.assertEqual(first.kwargs["config"]["temperature"], 0.0)
        self.assertNotIn(gemini._STRUCTURE_RETRY_HINT, first.kwargs["contents"])
        self.assertGreater(second.kwargs["config"]["temperature"], 0.0)
        self.assertIn(gemini._STRUCTURE_RETRY_HINT, second.kwargs["contents"])

    def test_reconstruction_mismatch_raises(self):
        with patch.object(
            gemini.client.models, "generate_content", return_value=_response(VALID_TREE)
        ):
            with self.assertRaises(HTTPException) as raised:
                gemini.ai_analyze_structure("A different sentence.")

        self.assertEqual(raised.exception.status_code, 502)

    def test_retry_recovers_from_a_transient_bad_response(self):
        with patch.object(
            gemini.client.models,
            "generate_content",
            side_effect=[_response({"nope": 1}), _response(VALID_TREE)],
        ) as gen:
            result, _ = gemini.ai_analyze_structure("She reads books.")

        self.assertEqual(gen.call_count, 2)
        self.assertEqual(result["role"], "ROOT")


class GetStructureCacheTests(unittest.TestCase):
    def setUp(self):
        structure._MEM_CACHE.clear()

    def test_empty_sentence_short_circuits(self):
        with patch.object(structure, "ai_analyze_structure") as ai:
            result, usage = structure.get_structure("   ")
        self.assertEqual((result, usage), (None, None))
        ai.assert_not_called()

    def test_miss_calls_ai_saves_and_returns_usage(self):
        usage = {"prompt_tokens": 1, "response_tokens": 2, "total_tokens": 3}
        with (
            patch.object(structure, "get_cached_parse", return_value=None) as l2,
            patch.object(structure, "ai_analyze_structure", return_value=(VALID_TREE, usage)) as ai,
            patch.object(structure, "save_parse") as save,
        ):
            result, got_usage = structure.get_structure("She reads books.")

        l2.assert_called_once()
        ai.assert_called_once()
        save.assert_called_once()
        self.assertEqual(result, VALID_TREE)
        self.assertEqual(got_usage, usage)

    def test_supabase_hit_skips_ai_and_bills_nothing(self):
        with (
            patch.object(structure, "get_cached_parse", return_value=VALID_TREE) as l2,
            patch.object(structure, "ai_analyze_structure") as ai,
            patch.object(structure, "save_parse") as save,
        ):
            result, usage = structure.get_structure("She reads books.")

        l2.assert_called_once()
        ai.assert_not_called()
        save.assert_not_called()
        self.assertEqual(result, VALID_TREE)
        self.assertIsNone(usage)

    def test_memory_hit_skips_supabase(self):
        with (
            patch.object(structure, "get_cached_parse", return_value=None),
            patch.object(structure, "ai_analyze_structure", return_value=(VALID_TREE, {"total_tokens": 1})),
            patch.object(structure, "save_parse"),
        ):
            structure.get_structure("She reads books.")  # populate L1

        with (
            patch.object(structure, "get_cached_parse") as l2,
            patch.object(structure, "ai_analyze_structure") as ai,
        ):
            result, usage = structure.get_structure("She reads books.")

        l2.assert_not_called()
        ai.assert_not_called()
        self.assertEqual(result, VALID_TREE)
        self.assertIsNone(usage)

    def test_whitespace_variants_share_one_cache_entry(self):
        with (
            patch.object(structure, "get_cached_parse", return_value=None),
            patch.object(structure, "ai_analyze_structure", return_value=(VALID_TREE, {"total_tokens": 1})) as ai,
            patch.object(structure, "save_parse"),
        ):
            structure.get_structure("She reads books.")
            structure.get_structure("She   reads books.")  # only spacing differs

        ai.assert_called_once()


if __name__ == "__main__":
    unittest.main()
