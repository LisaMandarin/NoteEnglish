import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.models.vocab import VocabOptions
from app.services import gemini
from app.services.gemini import _strip_echoed_indices
from app.services.nlp import parse_dependencies, split_sentences


class SentenceSplittingTests(unittest.TestCase):
    def test_option_lines_are_attached_to_question_stem(self):
        text = "What is correct?\nA. One\nB. Two\nC. Three"

        self.assertEqual(
            split_sentences(text),
            ["What is correct?\nA. One\nB. Two\nC. Three"],
        )

    def test_consecutive_questions_with_inline_options_remain_separate(self):
        text = (
            "113. First question? (A) One (B) Two\n"
            "114. Second question? (A) Red (B) Blue"
        )

        self.assertEqual(
            split_sentences(text),
            [
                "113. First question?\n(A) One (B) Two",
                "114. Second question?\n(A) Red (B) Blue",
            ],
        )

    def test_question_number_can_cross_a_line_break(self):
        self.assertEqual(
            split_sentences("114.\nWhat is correct?"),
            ["114. What is correct?"],
        )

    def test_punctuation_only_line_is_not_carried_forward(self):
        self.assertEqual(
            split_sentences("...\nThe next sentence."),
            ["The next sentence."],
        )


class TranslationCleanupTests(unittest.TestCase):
    def test_decimal_values_are_not_treated_as_indices(self):
        self.assertEqual(
            _strip_echoed_indices(["0.5 公升", "1.25 美元"]),
            ["0.5 公升", "1.25 美元"],
        )

    def test_aligned_echoed_indices_are_removed_as_a_batch(self):
        self.assertEqual(
            _strip_echoed_indices(["0. first", "1. second"]),
            ["first", "second"],
        )

    def test_partial_index_pattern_is_left_unchanged(self):
        self.assertEqual(
            _strip_echoed_indices(["0. first", "second"]),
            ["0. first", "second"],
        )


class TranslationRequestTests(unittest.TestCase):
    def test_translation_input_uses_json_without_prompt_indices(self):
        response = SimpleNamespace(
            text='["翻譯一", "翻譯二"]',
            usage_metadata=None,
        )

        with patch.object(
            gemini.client.models,
            "generate_content",
            return_value=response,
        ) as generate_content:
            translations, usage = gemini.ai_translate_list(
                ["First sentence.", "Second sentence."],
            )

        prompt = generate_content.call_args.kwargs["contents"]
        self.assertIn('["First sentence.", "Second sentence."]', prompt)
        self.assertNotIn("0. First sentence.", prompt)
        self.assertEqual(translations, ["翻譯一", "翻譯二"])
        self.assertEqual(usage["total_tokens"], 0)

    def test_translation_length_mismatch_is_rejected(self):
        response = SimpleNamespace(text='["only one"]', usage_metadata=None)

        with (
            patch.object(
                gemini.client.models,
                "generate_content",
                return_value=response,
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            gemini.ai_translate_list(["First.", "Second."])

        self.assertEqual(raised.exception.status_code, 502)
        self.assertIn("expected 2, got 1", raised.exception.detail)

    def test_empty_translation_input_returns_an_aligned_tuple(self):
        self.assertEqual(
            gemini.ai_translate_list([]),
            (
                [],
                {
                    "prompt_tokens": 0,
                    "response_tokens": 0,
                    "total_tokens": 0,
                },
            ),
        )


class VocabLookupTests(unittest.TestCase):
    def test_lookup_preserves_selected_text_and_clears_unrequested_fields(self):
        response = SimpleNamespace(
            text=(
                '{"text":"changed","lemma":"run","pos":"verb",'
                '"translation":"跑","definition":"move quickly",'
                '"example":"I run daily.","level":"B1"}'
            ),
            usage_metadata=None,
        )

        with patch.object(
            gemini.client.models,
            "generate_content",
            return_value=response,
        ):
            result, usage = gemini.ai_lookup_word(
                "running",
                "She is running.",
                VocabOptions(translation=True),
            )

        self.assertEqual(result["text"], "running")
        self.assertEqual(result["translation"], "跑")
        self.assertEqual(result["definition"], "")
        self.assertEqual(result["example"], "")
        self.assertEqual(result["level"], "")
        self.assertEqual(usage["total_tokens"], 0)

    def test_lookup_invalid_level_becomes_502(self):
        response = SimpleNamespace(
            text=(
                '{"text":"word","lemma":"word","pos":"noun",'
                '"translation":"","definition":"",'
                '"example":"","level":"B3"}'
            ),
            usage_metadata=None,
        )

        with (
            patch.object(
                gemini.client.models,
                "generate_content",
                return_value=response,
            ),
            patch.object(gemini.logger, "warning"),
            self.assertRaises(HTTPException) as raised,
        ):
            gemini.ai_lookup_word(
                "word",
                "A word.",
                VocabOptions(level=True),
            )

        self.assertEqual(raised.exception.status_code, 502)

    def test_lookup_api_failure_becomes_502(self):
        with (
            patch.object(
                gemini.client.models,
                "generate_content",
                side_effect=RuntimeError("provider secret"),
            ),
            patch.object(gemini.logger, "exception"),
            self.assertRaises(HTTPException) as raised,
        ):
            gemini.ai_lookup_word(
                "word",
                "A word.",
                VocabOptions(translation=True),
            )

        self.assertEqual(raised.exception.status_code, 502)
        self.assertNotIn("provider secret", raised.exception.detail)

    def test_lookup_invalid_json_becomes_502(self):
        response = SimpleNamespace(text="not json", usage_metadata=None)

        with (
            patch.object(
                gemini.client.models,
                "generate_content",
                return_value=response,
            ),
            patch.object(gemini.logger, "warning"),
            self.assertRaises(HTTPException) as raised,
        ):
            gemini.ai_lookup_word(
                "word",
                "A word.",
                VocabOptions(definition=True),
            )

        self.assertEqual(raised.exception.status_code, 502)
        self.assertIn("invalid response", raised.exception.detail)


class ParseReliabilityTests(unittest.TestCase):
    """The `reliable` flag drives the structure-view warning and the Gemini
    fallback. These run the real spaCy model (like the splitting tests above)."""

    def test_clean_sentence_is_reliable(self):
        result = parse_dependencies(
            "China filled the void and gained influence in the island nation."
        )
        self.assertTrue(result["reliable"])

    def test_copular_sentence_is_reliable(self):
        # spaCy roots copular sentences on "is" (AUX) — must not be flagged.
        result = parse_dependencies("Seychelles is an archipelago of 115 islands.")
        self.assertTrue(result["reliable"])

    def test_non_verbal_root_is_flagged(self):
        # spaCy mis-roots this on the adjective "aware" instead of "began".
        result = parse_dependencies(
            "Washington, aware that Beijing had gained a foothold, began reengaging."
        )
        self.assertFalse(result["reliable"])

    def test_duplicate_core_argument_is_flagged(self):
        # spaCy mis-roots "cancel" as a verb with two dobj children
        # ("experience" and "suffering"), which the duplicate-role check catches.
        result = parse_dependencies(
            "People who are the targets of cancel culture experience severe "
            "emotional suffering as a result of cyberbullying, reputational harm, "
            "and public humiliation."
        )
        self.assertFalse(result["reliable"])

    def test_nonfinite_conj_of_root_is_flagged(self):
        # spaCy mis-attaches the trailing non-finite verbs "to act" (infinitive)
        # and "received" (participle) as conj of the main verb "comes" instead of
        # to the nearer phrases they parallel — a coordination-scope misparse.
        result = parse_dependencies(
            "A personal testimony comes in response to our sincere and dedicated "
            "quest to want to know for ourselves and then to act upon the "
            "impressions and the knowledge received."
        )
        self.assertFalse(result["reliable"])

    def test_finite_coordination_is_reliable(self):
        # Genuine main-clause coordination is finite ("sang and danced") and must
        # not be flagged by the non-finite-conj rule.
        result = parse_dependencies("She sang and danced all night.")
        self.assertTrue(result["reliable"])


if __name__ == "__main__":
    unittest.main()
