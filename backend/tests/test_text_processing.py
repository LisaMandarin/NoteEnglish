import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.models.vocab import VocabOptions
from app.services import gemini
from app.services.gemini import _strip_echoed_indices
from app.services.nlp import is_complete_sentence, split_sentences


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


class CompleteSentenceTests(unittest.TestCase):
    def test_declarative_and_question_are_complete(self):
        self.assertTrue(is_complete_sentence("She reads books"))
        self.assertTrue(is_complete_sentence("Are you ready?"))

    def test_imperative_is_complete_without_explicit_subject(self):
        self.assertTrue(is_complete_sentence("Please sit down."))

    def test_phrases_and_non_finite_fragments_are_incomplete(self):
        self.assertFalse(is_complete_sentence("In the morning."))
        self.assertFalse(is_complete_sentence("To learn English."))
        self.assertFalse(is_complete_sentence("Running in the park."))

    def test_dependent_clause_is_incomplete(self):
        self.assertFalse(is_complete_sentence("Because I was tired."))

    def test_bare_verb_is_incomplete(self):
        # "Live" leaked to Gemini in production — a lone verb is a title/label.
        self.assertFalse(is_complete_sentence("Live"))
        self.assertFalse(is_complete_sentence("Stop!"))
        self.assertTrue(is_complete_sentence("Close the door."))

    def test_wh_fronted_dependent_clause_is_incomplete(self):
        self.assertFalse(is_complete_sentence("When they grew up"))
        self.assertFalse(is_complete_sentence("While she was sleeping"))
        # Real WH-questions invert (finite verb before subject) and stay valid.
        self.assertTrue(is_complete_sentence("When did they grow up?"))
        self.assertTrue(is_complete_sentence("How are you?"))
        # A fronted when-clause attached to a later main clause is a sentence.
        self.assertTrue(
            is_complete_sentence("When they grew up, they left their parents.")
        )

    def test_lowercase_coordinator_tail_is_incomplete(self):
        self.assertFalse(is_complete_sentence("and he never gave up"))
        # Articles legitimately start sentences with capitalized And/But.
        self.assertTrue(is_complete_sentence("But that was not enough."))
        self.assertTrue(is_complete_sentence("And then she smiled."))

    def test_relative_clause_fragment_is_incomplete(self):
        self.assertFalse(
            is_complete_sentence("which supports health and social programs")
        )
        self.assertTrue(is_complete_sentence("Who came to the party?"))
        self.assertTrue(is_complete_sentence("Which team won the game?"))


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
                '"example":"I run daily.","example_translation":"我每天跑步。",'
                '"level":"B1"}'
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
        self.assertEqual(result["example_translation"], "")
        self.assertEqual(result["level"], "")
        self.assertEqual(usage["total_tokens"], 0)

    def test_lookup_example_brings_its_translation_along(self):
        response = SimpleNamespace(
            text=(
                '{"text":"run","lemma":"run","pos":"verb",'
                '"translation":"","definition":"",'
                '"example":"I run daily.","example_translation":"我每天跑步。",'
                '"level":""}'
            ),
            usage_metadata=None,
        )

        with patch.object(
            gemini.client.models,
            "generate_content",
            return_value=response,
        ):
            result, _ = gemini.ai_lookup_word(
                "run",
                "They run fast.",
                VocabOptions(example=True),
            )

        self.assertEqual(result["example"], "I run daily.")
        self.assertEqual(result["example_translation"], "我每天跑步。")

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


if __name__ == "__main__":
    unittest.main()
