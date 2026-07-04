import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.services import gemini, nlp, structure


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

EMPTY_NESTED_CLAUSE_TREE = {
    "text": (
        "She joined the Church in August 1957 in Mendoza, Argentina, 32 years "
        "after South America was dedicated for the preaching of the gospel."
    ),
    "role": "ROOT",
    "type": "clause",
    "label": "主要子句",
    "pattern": "SVO",
    "children": [
        {"text": "She", "role": "S", "type": "word", "label": "主詞"},
        {"text": "joined", "role": "V", "type": "word", "label": "動詞"},
        {
            "text": "the Church",
            "role": "O",
            "type": "phrase",
            "label": "名詞片語",
        },
        {
            "text": "in August 1957",
            "role": "ADV",
            "type": "phrase",
            "label": "介系詞片語",
            "children": [
                {"text": "in", "role": "PREP", "type": "word", "label": "介系詞"},
                {"text": "August", "role": "HEAD", "type": "word", "label": "名詞"},
                {"text": "1957", "role": "DET", "type": "word", "label": "限定詞"},
            ],
        },
        {
            "text": "in Mendoza, Argentina",
            "role": "ADV",
            "type": "phrase",
            "label": "介系詞片語",
            "children": [
                {"text": "in", "role": "PREP", "type": "word", "label": "介系詞"},
                {"text": "Mendoza", "role": "HEAD", "type": "word", "label": "名詞"},
                {"text": ",", "role": "PUNCT", "type": "word", "label": "標點"},
                {"text": "Argentina", "role": "MOD", "type": "word", "label": "名詞"},
            ],
        },
        {"text": ",", "role": "PUNCT", "type": "word", "label": "標點"},
        {
            "text": (
                "32 years after South America was dedicated for the preaching "
                "of the gospel"
            ),
            "role": "ADV",
            "type": "phrase",
            "label": "副詞片語",
            "children": [
                {
                    "text": "32 years",
                    "role": "MOD",
                    "type": "phrase",
                    "label": "名詞片語",
                },
                {
                    "text": (
                        "after South America was dedicated for the preaching "
                        "of the gospel"
                    ),
                    "role": "MOD",
                    "type": "clause",
                    "label": "副詞子句",
                    "pattern": "SV",
                },
            ],
        },
        {"text": ".", "role": "PUNCT", "type": "word", "label": "標點"},
    ],
}

# A correct rule-4 analysis (V + O + infinitive OC) that spaCy's parser sees
# as an embedded clause; the validator must accept it as-is.
SVOC_GEMINI_TREE = {
    "text": "he never allowed those challenges to define him",
    "role": "ROOT",
    "type": "clause",
    "label": "主要子句",
    "pattern": "SVOC",
    "children": [
        {"text": "he", "role": "S", "type": "word", "label": "主詞"},
        {"text": "never", "role": "ADV", "type": "word", "label": "副詞"},
        {"text": "allowed", "role": "V", "type": "word", "label": "動詞"},
        {"text": "those challenges", "role": "O", "type": "phrase", "label": "名詞片語"},
        {"text": "to define him", "role": "OC", "type": "phrase", "label": "不定詞片語"},
    ],
}

# Reconstructs its sentence but keeps a relative clause flattened inside the
# subject phrase — well-formed yet under-nested.
UNDER_NESTED_TREE = {
    "text": "The man who came stayed.",
    "role": "ROOT",
    "type": "clause",
    "label": "主要子句",
    "pattern": "SV",
    "children": [
        {
            "text": "The man who came",
            "role": "S",
            "type": "phrase",
            "label": "名詞片語",
            "children": [
                {"text": "The", "role": "DET", "type": "word", "label": "限定詞"},
                {"text": "man", "role": "HEAD", "type": "word", "label": "名詞"},
                {"text": "who", "role": "MOD", "type": "word", "label": "代名詞"},
                {"text": "came", "role": "MOD", "type": "word", "label": "動詞"},
            ],
        },
        {"text": "stayed", "role": "V", "type": "word", "label": "動詞"},
        {"text": ".", "role": "PUNCT", "type": "word", "label": "標點"},
    ],
}

# Leaf texts reproduce the sentence, but the subject node's text contradicts
# its children — corrupt, so it must never be served.
MISMATCHED_SPAN_TREE = {
    "text": "She reads books.",
    "role": "ROOT",
    "type": "clause",
    "label": "主要子句",
    "pattern": "SVO",
    "children": [
        {
            "text": "She herself",
            "role": "S",
            "type": "phrase",
            "label": "名詞片語",
            "children": [
                {"text": "She", "role": "HEAD", "type": "word", "label": "代名詞"},
            ],
        },
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

    def test_detailed_tree_requires_children_on_long_phrase(self):
        self.assertIsNone(gemini._nesting_issue(DETAILED_TREE))

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
        self.assertIn("unexpanded phrase has 3", gemini._nesting_issue(shallow))

    def test_compact_phrase_may_remain_a_leaf(self):
        compact_phrase = {
            "text": "Earth's surface",
            "role": "HEAD",
            "type": "phrase",
            "label": "名詞片語",
        }
        self.assertIsNone(gemini._nesting_issue(compact_phrase))

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
        self.assertIsNone(gemini._nesting_issue(phrase))

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
        self.assertIn("node text does not match", gemini._malformed_issue(mismatched))

    def test_complex_phrase_cannot_be_flattened_into_word_nodes(self):
        text = "of the promise that you have come by the word of Christ"
        flattened = {
            "text": text,
            "role": "ADJ",
            "type": "phrase",
            "label": "介系詞片語",
            "children": [
                gemini._phrase_word_node(token)
                for token in gemini.analyze_tokens(text)
            ],
        }

        self.assertIn("flattened into word nodes", gemini._nesting_issue(flattened))

    def test_missing_embedded_finite_clause_is_detected(self):
        phrase = {
            "text": "the promise that you have come by faith",
            "role": "HEAD",
            "type": "phrase",
            "label": "名詞片語",
            "children": [
                {"text": "the", "role": "DET", "type": "word", "label": "限定詞"},
                {"text": "promise", "role": "HEAD", "type": "word", "label": "名詞"},
                {
                    "text": "that you have come by faith",
                    "role": "MOD",
                    "type": "phrase",
                    "label": "名詞片語",
                    "children": [
                        {
                            "text": "that you have come",
                            "role": "MOD",
                            "type": "phrase",
                            "label": "名詞片語",
                        },
                        {
                            "text": "by faith",
                            "role": "ADV",
                            "type": "phrase",
                            "label": "介系詞片語",
                        },
                    ],
                },
            ],
        }

        self.assertIn("embedded clause", gemini._nesting_issue(phrase))

    def test_deep_quote_phrase_is_nested_semantically(self):
        phrase = {
            "text": (
                "of the promise that you have come “by the word of Christ with "
                "unshaken faith in him, relying wholly upon the merits of him who "
                "is mighty to save.”"
            ),
            "role": "ADJ",
            "type": "phrase",
            "label": "介系詞片語",
        }

        gemini._expand_missing_details(phrase)

        labels: list[str] = []
        clauses: list[dict] = []

        def collect(node):
            labels.append(node["label"])
            if node["type"] == "clause":
                clauses.append(node)
            for child in node.get("children") or []:
                collect(child)

        collect(phrase)
        self.assertIsNone(gemini._malformed_issue(phrase))
        self.assertIsNone(gemini._nesting_issue(phrase))
        self.assertEqual([node["label"] for node in clauses], ["同位子句", "關係子句"])
        self.assertIn("分詞片語", labels)
        self.assertIn("不定詞片語", labels)
        self.assertGreaterEqual(labels.count("介系詞片語"), 6)


class ValidatorAlignmentTests(unittest.TestCase):
    """The deterministic checks must agree with prompt rule 4: a causative or
    perception verb's non-finite complement is O + OC, never a clause node."""

    def test_nonfinite_complements_do_not_demand_clause_nodes(self):
        self.assertEqual(
            gemini._embedded_finite_clause_count(
                "He never allowed those challenges to define him."
            ),
            0,
        )
        # Only the finite that-clause counts; "helps him prepare" does not.
        self.assertEqual(
            gemini._embedded_finite_clause_count(
                'He has explained that embracing his "inner child" helps him '
                "prepare for complex roles."
            ),
            1,
        )

    def test_finite_clauses_are_still_required(self):
        self.assertEqual(
            gemini._embedded_finite_clause_count(
                "In 2017, the Holland family founded The Brothers Trust, "
                "which supports health and social programs."
            ),
            1,
        )

    def test_svoc_tree_for_causative_verb_passes_validation(self):
        # Same order as ai_analyze_structure: local expansion, then validation.
        tree = copy.deepcopy(SVOC_GEMINI_TREE)
        gemini._expand_missing_details(tree)
        self.assertIsNone(gemini._malformed_issue(tree))
        self.assertIsNone(gemini._nesting_issue(tree))

    def test_causative_pattern_is_svoc(self):
        for clause in (
            "he never allowed those challenges to define him",
            'embracing his "inner child" helps him prepare for complex roles',
        ):
            tokens = gemini.analyze_tokens(clause)
            self.assertEqual(gemini._infer_clause_pattern(tokens), "SVOC", clause)

    def test_clausal_object_pattern_is_svo(self):
        for clause in ("She wants to leave early", "He said that she left"):
            tokens = gemini.analyze_tokens(clause)
            self.assertEqual(gemini._infer_clause_pattern(tokens), "SVO", clause)

    def test_clause_fallback_marks_only_the_root_verb_group_as_v(self):
        node = {
            "text": "he never allowed those challenges to define him",
            "role": "ROOT",
            "type": "clause",
            "label": "主要子句",
            "pattern": "SVOC",
        }
        roles = {w["text"]: w["role"] for w in gemini._clause_word_nodes(node)}
        self.assertEqual(roles["allowed"], "V")
        self.assertNotEqual(roles["to"], "V")
        self.assertNotEqual(roles["challenges"], "V")

    def test_expand_never_relabels_gemini_nodes(self):
        def nodes(node):
            yield (node["text"], node["role"], node["label"], node["type"])
            for child in node.get("children") or []:
                yield from nodes(child)

        tree = copy.deepcopy(SVOC_GEMINI_TREE)
        gemini._expand_missing_details(tree)

        # Expansion may add children under leaves but must keep every node
        # Gemini produced, with its role and label untouched.
        self.assertLessEqual(set(nodes(SVOC_GEMINI_TREE)), set(nodes(tree)))


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

    def test_under_nested_answer_is_served_after_retries(self):
        with patch.object(
            gemini.client.models,
            "generate_content",
            return_value=_response(UNDER_NESTED_TREE),
        ) as gen:
            result, usage = gemini.ai_analyze_structure("The man who came stayed.")

        self.assertEqual(gen.call_count, gemini._STRUCTURE_ATTEMPTS)
        # The served tree additionally carries the derived constituent sequence.
        self.assertEqual(result, {**UNDER_NESTED_TREE, "display_pattern": "S+V"})
        self.assertIn("total_tokens", usage)

    def test_malformed_answer_still_raises(self):
        with patch.object(
            gemini.client.models,
            "generate_content",
            return_value=_response(MISMATCHED_SPAN_TREE),
        ) as gen:
            with self.assertRaises(HTTPException) as raised:
                gemini.ai_analyze_structure("She reads books.")

        self.assertEqual(gen.call_count, gemini._STRUCTURE_ATTEMPTS)
        self.assertEqual(raised.exception.status_code, 502)
        self.assertIn("malformed", raised.exception.detail)

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

    def test_complex_phrase_is_nested_locally(self):
        phrase = {
            "text": "the promise that you have come by faith",
            "role": "SC",
            "type": "phrase",
            "label": "名詞片語",
        }

        gemini._expand_missing_details(phrase)

        self.assertGreaterEqual(gemini._descendant_clause_count(phrase), 1)
        self.assertIsNone(gemini._nesting_issue(phrase))

    def test_empty_nested_clause_is_expanded_locally(self):
        sentence = EMPTY_NESTED_CLAUSE_TREE["text"]
        with patch.object(
            gemini.client.models,
            "generate_content",
            return_value=_response(EMPTY_NESTED_CLAUSE_TREE),
        ) as gen:
            result, _ = gemini.ai_analyze_structure(sentence)

        clause = result["children"][6]["children"][1]
        self.assertEqual(clause["type"], "clause")
        self.assertTrue(clause["children"])
        self.assertIsNone(gemini._nesting_issue(result))
        self.assertEqual(
            [child["role"] for child in clause["children"][:5]],
            ["MARK", "S", "V", "V", "ADV"],
        )
        # A clause arriving childless is retried before the spaCy fill ships.
        self.assertEqual(gen.call_count, gemini._STRUCTURE_ATTEMPTS)


class ReportedRegressionTests(unittest.TestCase):
    """Regressions reported from real PDF-sourced sentences."""

    FEFF_SENTENCE = "But that was not enough﻿—I needed to know for myself."

    def test_invisible_characters_are_normalized_away(self):
        clean = self.FEFF_SENTENCE.replace("﻿", "")
        self.assertEqual(
            structure._normalize(self.FEFF_SENTENCE), structure._normalize(clean)
        )
        self.assertEqual(
            gemini._normalize_for_compare(self.FEFF_SENTENCE),
            gemini._normalize_for_compare(clean),
        )
        self.assertNotIn("﻿", nlp.split_sentences(self.FEFF_SENTENCE)[0])

    def test_inverted_copular_sentence_is_complete(self):
        self.assertTrue(
            nlp.is_complete_sentence(
                "Most inspiring is that their faithfulness depends not only on "
                "their spiritual heritage but on their personal decision to "
                "follow the Savior."
            )
        )

    def test_predicative_fragment_is_still_incomplete(self):
        self.assertFalse(nlp.is_complete_sentence("Most inspiring of all."))

    def test_relative_pronoun_is_not_merged_into_the_subject(self):
        clause = {
            "text": (
                "that time gives to see the refining and perfecting hand of "
                "our Savior, Jesus Christ, in my life and in my family's life"
            ),
            "role": "MOD",
            "type": "clause",
            "label": "關係子句",
            "pattern": "SVO",
        }
        gemini._expand_missing_details(clause)

        first = clause["children"][0]
        self.assertEqual((first["text"], first["role"]), ("that", "MARK"))
        subject_roles = {
            child["text"]: child["role"] for child in clause["children"]
        }
        self.assertEqual(subject_roles.get("time"), "S")

        labels: list[str] = []

        def collect(node):
            labels.append(node["label"])
            for child in node.get("children") or []:
                collect(child)

        collect(clause)
        # "to see ..." is a purpose infinitive, not a participle phrase.
        self.assertIn("不定詞片語", labels)
        self.assertNotIn("分詞片語", labels)

    def test_missing_trailing_period_is_repaired(self):
        tree = {
            "text": "She reads books",
            "role": "ROOT",
            "type": "clause",
            "label": "主要子句",
            "pattern": "SVO",
            "children": [
                {"text": "She", "role": "S", "type": "word", "label": "主詞"},
                {"text": "reads", "role": "V", "type": "word", "label": "動詞"},
                {"text": "books", "role": "O", "type": "word", "label": "受詞"},
            ],
        }
        gemini._repair_missing_trailing_punct(tree, "She reads books.")

        self.assertTrue(gemini._reconstructs_sentence(tree, "She reads books."))
        self.assertEqual(tree["children"][-1]["role"], "PUNCT")
        self.assertEqual(tree["text"], "She reads books.")
        self.assertIsNone(gemini._malformed_issue(tree))

    def test_missing_word_is_not_repaired(self):
        tree = {
            "text": "She reads",
            "role": "ROOT",
            "type": "clause",
            "label": "主要子句",
            "pattern": "SVO",
            "children": [
                {"text": "She", "role": "S", "type": "word", "label": "主詞"},
                {"text": "reads", "role": "V", "type": "word", "label": "動詞"},
            ],
        }
        gemini._repair_missing_trailing_punct(tree, "She reads books.")

        self.assertFalse(gemini._reconstructs_sentence(tree, "She reads books."))
        self.assertEqual(len(tree["children"]), 2)

    def test_clause_without_children_is_retried_then_recovered(self):
        childless = {
            key: value for key, value in VALID_TREE.items() if key != "children"
        }
        with patch.object(
            gemini.client.models,
            "generate_content",
            side_effect=[_response(childless), _response(VALID_TREE)],
        ) as gen:
            result, _ = gemini.ai_analyze_structure("She reads books.")

        self.assertEqual(gen.call_count, 2)
        self.assertEqual(result, {**VALID_TREE, "display_pattern": "S+V+O"})


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


def _clause(text, role, label, pattern=None, children=None):
    node = {"text": text, "role": role, "type": "clause", "label": label}
    if pattern:
        node["pattern"] = pattern
    if children:
        node["children"] = children
    return node


def _word(text, role, label):
    return {"text": text, "role": role, "type": "word", "label": label}


class DisplayPatternTests(unittest.TestCase):
    def test_sequence_from_children_with_fronted_adverbial(self):
        node = _clause(
            "During the war, he slept.", "ROOT", "主要子句", "SV",
            children=[
                {"text": "During the war", "role": "ADV", "type": "phrase", "label": "介系詞片語"},
                _word(",", "PUNCT", "標點"),
                _word("he", "S", "主詞"),
                _word("slept", "V", "動詞"),
                _word(".", "PUNCT", "標點"),
            ],
        )
        self.assertEqual(gemini._clause_display_sequence(node), "A+S+V")

    def test_svoo_children_produce_s_v_io_do(self):
        node = _clause(
            "She gave him books.", "ROOT", "主要子句", "SVOO",
            children=[
                _word("She", "S", "主詞"),
                _word("gave", "V", "動詞"),
                _word("him", "IO", "間接受詞"),
                _word("books", "DO", "直接受詞"),
                _word(".", "PUNCT", "標點"),
            ],
        )
        self.assertEqual(gemini._clause_display_sequence(node), "S+V+IO+DO")

    def test_adjacent_same_role_words_collapse_once(self):
        node = _clause(
            "She has explained it.", "ROOT", "主要子句", "SVO",
            children=[
                _word("She", "S", "主詞"),
                _word("has", "V", "動詞"),
                _word("explained", "V", "動詞"),
                _word("it", "O", "受詞"),
            ],
        )
        self.assertEqual(gemini._clause_display_sequence(node), "S+V+O")

    def test_object_gap_relative_clause_becomes_svo(self):
        node = _clause(
            "that time gives", "MOD", "關係子句", "SV",
            children=[
                _word("that", "MARK", "引導詞"),
                _word("time", "S", "主詞"),
                _word("gives", "V", "動詞"),
            ],
        )
        gemini._annotate_display_patterns(node)
        self.assertEqual(node["pattern"], "SVO")
        self.assertEqual(node["display_pattern"], "O+S+V")

    def test_subject_gap_relative_clause_prepends_s(self):
        node = _clause(
            "who came", "MOD", "關係子句", "SV",
            children=[
                _word("who", "MARK", "引導詞"),
                _word("came", "V", "動詞"),
            ],
        )
        gemini._annotate_display_patterns(node)
        self.assertEqual(node["pattern"], "SV")
        self.assertEqual(node["display_pattern"], "S+V")

    def test_compound_top_node_loses_its_single_pattern(self):
        tree = _clause(
            "She reads, but he sleeps.", "ROOT", "主要子句", "SVO",
            children=[
                _clause(
                    "She reads", "CONJ", "主要子句", "SVO",
                    children=[_word("She", "S", "主詞"), _word("reads", "V", "動詞")],
                ),
                _word(",", "PUNCT", "標點"),
                _word("but", "CONJ", "對等連接詞"),
                _clause(
                    "he sleeps", "CONJ", "主要子句", "SV",
                    children=[_word("he", "S", "主詞"), _word("sleeps", "V", "動詞")],
                ),
                _word(".", "PUNCT", "標點"),
            ],
        )
        gemini._finalize_structure(tree, "She reads, but he sleeps.")
        self.assertNotIn("pattern", tree)
        self.assertNotIn("display_pattern", tree)
        self.assertEqual(tree["children"][0]["display_pattern"], "S+V")


class SentenceTypeTests(unittest.TestCase):
    def test_simple(self):
        self.assertEqual(gemini.derive_sentence_type(VALID_TREE), "simple")

    def test_compound(self):
        tree = _clause(
            "x", "ROOT", "主要子句",
            children=[
                _clause("a", "CONJ", "主要子句"),
                _word("but", "CONJ", "對等連接詞"),
                _clause("b", "CONJ", "主要子句"),
            ],
        )
        self.assertEqual(gemini.derive_sentence_type(tree), "compound")

    def test_complex(self):
        tree = _clause(
            "x", "ROOT", "主要子句",
            children=[
                _word("She", "S", "主詞"),
                _word("said", "V", "動詞"),
                _clause("that he came", "O", "受詞子句"),
            ],
        )
        self.assertEqual(gemini.derive_sentence_type(tree), "complex")

    def test_compound_complex(self):
        tree = _clause(
            "x", "ROOT", "主要子句",
            children=[
                _clause(
                    "a", "CONJ", "主要子句",
                    children=[_clause("when he came", "ADV", "副詞子句")],
                ),
                _clause("b", "CONJ", "主要子句"),
            ],
        )
        self.assertEqual(gemini.derive_sentence_type(tree), "compound-complex")


class NodeLevelRepairTests(unittest.TestCase):
    def test_word_with_phrase_label_becomes_leaf_phrase(self):
        tree = _clause(
            "x", "ROOT", "主要子句",
            children=[_word("in the kitchen", "ADV", "介系詞片語")],
        )
        gemini._repair_node_levels(tree)
        self.assertEqual(tree["children"][0]["type"], "phrase")

    def test_phrase_with_word_function_label_gets_phrase_label(self):
        tree = _clause(
            "x", "ROOT", "主要子句",
            children=[
                {
                    "text": "the tall man",
                    "role": "S",
                    "type": "phrase",
                    "label": "主詞",
                    "children": [
                        _word("the", "DET", "限定詞"),
                        _word("tall", "ADJ", "形容詞"),
                        _word("man", "HEAD", "名詞"),
                    ],
                }
            ],
        )
        gemini._repair_node_levels(tree)
        self.assertEqual(tree["children"][0]["label"], "名詞片語")

    def test_inner_root_role_is_demoted(self):
        tree = _clause(
            "x", "ROOT", "主要子句",
            children=[_clause("a", "ROOT", "主要子句")],
        )
        gemini._repair_node_levels(tree)
        self.assertEqual(tree["children"][0]["role"], "CONJ")
        self.assertEqual(tree["role"], "ROOT")

    def test_clause_with_word_label_gets_clause_label_from_role(self):
        tree = _clause(
            "x", "ROOT", "主要子句",
            children=[_clause("that he came", "O", "受詞")],
        )
        gemini._repair_node_levels(tree)
        self.assertEqual(tree["children"][0]["label"], "受詞子句")

    def test_malformed_issue_flags_label_level_crossings(self):
        word_with_clause_label = copy.deepcopy(VALID_TREE)
        word_with_clause_label["children"][0]["label"] = "關係子句"
        self.assertIn("non-word label", gemini._malformed_issue(word_with_clause_label))

        phrase_with_word_label = copy.deepcopy(DETAILED_TREE)
        phrase_with_word_label["children"][0]["label"] = "主詞"
        self.assertIn("word-level label", gemini._malformed_issue(phrase_with_word_label))


class LiftTrailingPunctTests(unittest.TestCase):
    def test_nested_final_period_moves_to_top_level(self):
        tree = _clause(
            "She saw the man who came.", "ROOT", "主要子句", "SVO",
            children=[
                _word("She", "S", "主詞"),
                _word("saw", "V", "動詞"),
                {
                    "text": "the man who came.",
                    "role": "O",
                    "type": "phrase",
                    "label": "名詞片語",
                    "children": [
                        _word("the man", "HEAD", "名詞"),
                        _clause(
                            "who came.", "MOD", "關係子句", "SV",
                            children=[
                                _word("who", "MARK", "引導詞"),
                                _word("came", "V", "動詞"),
                                _word(".", "PUNCT", "標點"),
                            ],
                        ),
                    ],
                },
            ],
        )
        gemini._lift_trailing_punct(tree)
        self.assertEqual(tree["children"][-1], _word(".", "PUNCT", "標點"))
        self.assertEqual(tree["children"][2]["text"], "the man who came")
        self.assertEqual(tree["children"][2]["children"][1]["text"], "who came")
        self.assertIsNone(gemini._malformed_issue(tree))
        self.assertTrue(gemini._reconstructs_sentence(tree, "She saw the man who came."))

    def test_closing_quote_is_not_lifted(self):
        tree = _clause(
            'He said, "Go."', "ROOT", "主要子句", "SVO",
            children=[
                _word("He", "S", "主詞"),
                _word("said", "V", "動詞"),
                _word(",", "PUNCT", "標點"),
                {
                    "text": '"Go."',
                    "role": "O",
                    "type": "phrase",
                    "label": "名詞片語",
                    "children": [
                        _word('"', "PUNCT", "標點"),
                        _word("Go", "HEAD", "名詞"),
                        _word(".", "PUNCT", "標點"),
                        _word('"', "PUNCT", "標點"),
                    ],
                },
            ],
        )
        before = copy.deepcopy(tree)
        gemini._lift_trailing_punct(tree)
        self.assertEqual(tree, before)


class VerbalWordLabelTests(unittest.TestCase):
    def test_participial_adjective_is_relabeled(self):
        sentence = "He is often described as relatable and grounded."
        tree = _clause(
            sentence, "ROOT", "主要子句", "SVC",
            children=[
                _word("He", "S", "主詞"),
                _word("is often described as relatable and", "V", "動詞"),
                _word("grounded", "SC", "動詞"),
                _word(".", "PUNCT", "標點"),
            ],
        )
        gemini._fix_verbal_word_labels(tree, sentence)
        self.assertEqual(tree["children"][2]["label"], "形容詞")

    def test_clause_verb_keeps_its_label(self):
        sentence = "She reads books."
        tree = copy.deepcopy(VALID_TREE)
        gemini._fix_verbal_word_labels(tree, sentence)
        self.assertEqual(tree["children"][1]["label"], "動詞")


class InferSvaPatternTests(unittest.TestCase):
    def test_bare_copula_with_locative_is_sva(self):
        tokens = nlp.analyze_tokens("She is in the kitchen")
        self.assertEqual(gemini._infer_clause_pattern(tokens), "SVA")

    def test_copula_with_complement_stays_svc(self):
        tokens = nlp.analyze_tokens("She is happy")
        self.assertEqual(gemini._infer_clause_pattern(tokens), "SVC")


if __name__ == "__main__":
    unittest.main()
