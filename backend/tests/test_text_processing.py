import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.services import gemini
from app.services.gemini import _strip_echoed_indices
from app.services.nlp import split_sentences


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


if __name__ == "__main__":
    unittest.main()
