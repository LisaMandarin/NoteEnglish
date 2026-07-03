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

DETAILED_TREE = {
    "text": "The deep sea is calm.",
    "role": "ROOT",
    "type": "clause",
    "label": "主要子句",
    "pattern": "SVC",
    "children": [
        {
            "text": "The deep sea",
            "role": "S",
            "type": "phrase",
            "label": "名詞片語",
            "children": [
                {"text": "The", "role": "DET", "type": "word", "label": "限定詞"},
                {"text": "deep", "role": "ADJ", "type": "word", "label": "形容詞"},
                {"text": "sea", "role": "HEAD", "type": "word", "label": "名詞"},
            ],
        },
        {"text": "is", "role": "V", "type": "word", "label": "動詞"},
        {"text": "calm", "role": "SC", "type": "word", "label": "主詞補語"},
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

    def test_detailed_tree_requires_children_on_long_phrase(self):
        self.assertTrue(gemini._is_detailed_tree(DETAILED_TREE))

        shallow = {
            **DETAILED_TREE,
            "children": [
                {
                    "text": "The deep sea",
                    "role": "S",
                    "type": "phrase",
                    "label": "名詞片語",
                },
                *DETAILED_TREE["children"][1:],
            ],
        }
        self.assertFalse(gemini._is_detailed_tree(shallow))
        self.assertIn("unexpanded phrase has 3", gemini._detail_issue(shallow))

    def test_compact_phrase_may_remain_a_leaf(self):
        compact_phrase = {
            "text": "Earth's surface",
            "role": "HEAD",
            "type": "phrase",
            "label": "名詞片語",
        }
        self.assertTrue(gemini._is_detailed_tree(compact_phrase))

    def test_long_phrase_can_contain_compact_phrase_leaves(self):
        phrase = {
            "text": "more than 70 percent of Earth's surface",
            "role": "O",
            "type": "phrase",
            "label": "名詞片語",
            "children": [
                {
                    "text": "more than",
                    "role": "MOD",
                    "type": "phrase",
                    "label": "副詞片語",
                },
                {
                    "text": "70 percent",
                    "role": "HEAD",
                    "type": "phrase",
                    "label": "名詞片語",
                },
                {
                    "text": "of Earth's surface",
                    "role": "ADJ",
                    "type": "phrase",
                    "label": "介系詞片語",
                    "children": [
                        {
                            "text": "of",
                            "role": "PREP",
                            "type": "word",
                            "label": "介系詞",
                        },
                        {
                            "text": "Earth's surface",
                            "role": "HEAD",
                            "type": "phrase",
                            "label": "名詞片語",
                        },
                    ],
                },
            ],
        }
        self.assertTrue(gemini._is_detailed_tree(phrase))

    def test_each_parent_span_must_match_its_children(self):
        mismatched = {
            **DETAILED_TREE,
            "children": [
                {
                    **DETAILED_TREE["children"][0],
                    "text": "A shallow sea",
                },
                *DETAILED_TREE["children"][1:],
            ],
        }
        self.assertFalse(gemini._is_detailed_tree(mismatched))
        self.assertIn("node text does not match", gemini._detail_issue(mismatched))


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
        self.assertEqual(
            first.kwargs["config"]["thinking_config"]["thinking_budget"],
            gemini._STRUCTURE_THINKING_BUDGET,
        )

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

    def test_shallow_long_phrase_is_expanded_locally(self):
        shallow = {
            **DETAILED_TREE,
            "children": [
                {
                    "text": "The deep sea",
                    "role": "S",
                    "type": "phrase",
                    "label": "名詞片語",
                },
                *DETAILED_TREE["children"][1:],
            ],
        }
        with patch.object(
            gemini.client.models,
            "generate_content",
            return_value=_response(shallow),
        ) as gen:
            result, _ = gemini.ai_analyze_structure("The deep sea is calm.")

        subject = result["children"][0]
        self.assertEqual([child["text"] for child in subject["children"]], ["The", "deep", "sea"])
        self.assertEqual(
            [child["role"] for child in subject["children"]],
            ["DET", "ADJ", "HEAD"],
        )
        gen.assert_called_once()


class GetStructureCacheTests(unittest.TestCase):
    def setUp(self):
        structure._MEM_CACHE.clear()

    def test_empty_sentence_is_rejected_without_calling_ai(self):
        with (
            patch.object(structure, "ai_analyze_structure") as ai,
            self.assertRaises(HTTPException) as raised,
        ):
            structure.get_structure("   ")

        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(raised.exception.detail, structure.INCOMPLETE_SENTENCE_MESSAGE)
        ai.assert_not_called()

    def test_incomplete_sentence_does_not_call_ai_or_cache(self):
        with (
            patch.object(structure, "is_complete_sentence", return_value=False),
            patch.object(structure, "get_cached_parse") as l2,
            patch.object(structure, "ai_analyze_structure") as ai,
            patch.object(structure, "save_parse") as save,
            self.assertRaises(HTTPException) as raised,
        ):
            structure.get_structure("In the morning.")

        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(raised.exception.detail, structure.INCOMPLETE_SENTENCE_MESSAGE)
        l2.assert_not_called()
        ai.assert_not_called()
        save.assert_not_called()

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
