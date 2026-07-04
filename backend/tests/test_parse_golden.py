"""Golden regression suite for sentence-structure analysis.

Calls the real Gemini API, so it is excluded from CI and default runs via the
`gemini` marker (see pyproject.toml addopts). Run manually:

    cd backend && poetry run python -m pytest -m gemini -q

Requires GEMINI_API_KEY in backend/.env (loaded by app.core.config). The
suite calls ai_analyze_structure(structure._normalize(s)) directly — it
bypasses the cache and never writes Supabase (dev and prod share one Supabase
project, so never test through get_structure).

Property-based: each sentence's tree is checked for invariants (leaf
reconstruction, no malformed nodes, label/level consistency, compound
top-level clauses) rather than compared to a frozen golden tree, so a
different-but-valid analysis still passes.
"""
from __future__ import annotations

import re

import pytest

from app.models.parse import StructureNode
from app.services import gemini, structure
from app.services.nlp import analyze_tokens

# (id, sentence, is_compound). Sentences come from the user's example.pdf and
# include every hard case hit so far. U+FEFF is embedded where the original
# PDF copy carried it.
GOLDEN_SENTENCES: list[tuple[str, str, bool]] = [
    (
        "passive-svc",
        "He is often described as relatable and grounded.",
        False,
    ),
    (
        "compound-svoc-x2",
        "As a child, he found spelling and reading difficult and sometimes "
        "frustrating, but he never allowed those challenges to define him.",
        True,
    ),
    (
        "nonrestrictive-relative",
        "In 2017, the Holland family founded The Brothers Trust, which "
        "supports health and social programs.",
        False,
    ),
    (
        "yet-compound",
        "The ocean covers more than 70 percent of Earth's surface, yet more "
        "than 80 percent of it remains unexplored.",
        True,
    ),
    (
        "fronted-adverbial-purpose",
        "During the Cold War, the U.S. had a tracking station in Seychelles "
        "to monitor Russian satellites.",
        False,
    ),
    (
        "that-clause-help-oc",
        'He has explained that embracing his "inner child" helps him prepare '
        "for complex roles.",
        False,
    ),
    (
        "long-44-words",
        "When I arrived in the United States last year, one of the things "
        "that had the biggest impact on me was seeing the spiritual strength "
        "of many faithful Saints﻿—multigenerational gospel families "
        "of pioneer descendants who continue to walk the covenant path.",
        False,
    ),
    (
        "emdash-compound",
        "But that was not enough﻿—I needed to know for myself.",
        True,
    ),
    (
        "semicolon-compound-object-gap",
        "In doing so, perhaps you will experience the same as I have; "
        "sometimes I need the perspective that time gives to see the "
        "refining and perfecting hand of our Savior, Jesus Christ, in my "
        "life and in my family's life.",
        True,
    ),
    (
        "inverted-copular",
        "Most inspiring is that their faithfulness depends not only on their "
        "spiritual heritage but on their personal decision to follow the "
        "Savior.",
        False,
    ),
    (
        "archaic-quotation",
        "The Lord taught this principle when He said to Peter, \"Blessed art "
        "thou, Simon Bar-jona: for flesh and blood hath not revealed it unto "
        "thee, but my Father which is in heaven.\"",
        False,
    ),
    (
        "fronted-participial",
        "Rather than seeing ADHD as a weakness, Holland views it as a source "
        "of creativity and imagination.",
        False,
    ),
    (
        "while-reduced-relatives",
        "Some creatures produce their own light through a process called "
        "bioluminescence, while others survive on the chemicals released "
        "from hydrothermal vents on the ocean floor.",
        False,
    ),
    (
        "expletive-since-after",
        "It has been 18 months since the United States reopened its embassy "
        "in Victoria, Seychelles, 27 years after Washington left the island "
        "nation.",
        False,
    ),
    (
        "heavy-postmodification",
        "Seychelles is an archipelago of 115 islands strategically located "
        "in the Indian Ocean at the confluence of Africa, South Asia and the "
        "Gulf states.",
        False,
    ),
]

CLAUSE_LABELS = {
    "主要子句", "受詞子句", "主詞子句", "補語子句", "副詞子句", "關係子句", "同位子句",
}
PHRASE_LABELS = {
    "名詞片語", "動名詞片語", "不定詞片語", "原形動詞補語", "分詞片語",
    "介系詞片語", "形容詞片語", "副詞片語",
}

_WORD = re.compile(r"[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*")

# One analysis per sentence, shared across all assertions in its test.
_cache: dict[str, dict] = {}


def _analyze(sentence: str) -> dict:
    normalized = structure._normalize(sentence)
    if normalized not in _cache:
        tree, _usage = gemini.ai_analyze_structure(normalized)
        _cache[normalized] = tree
    return _cache[normalized]


def _walk(node: dict):
    yield node
    for child in node.get("children") or []:
        yield from _walk(child)


def _verb_role_has_verb_token(node: dict, sentence_tokens: list[dict]) -> bool:
    """True when a role=V node's text covers at least one VERB/AUX token.

    Matches the node's word sequence against the sentence's token sequence;
    lenient when the sequence occurs more than once (any occurrence with a
    verb passes) to avoid false failures on repeated words.
    """
    words = [w.casefold() for w in _WORD.findall(node.get("text", ""))]
    if not words:
        return True  # nothing checkable (pure punctuation)
    token_texts = [t["lower"] for t in sentence_tokens]
    found_occurrence = False
    for start in range(len(token_texts) - len(words) + 1):
        if token_texts[start:start + len(words)] == words:
            found_occurrence = True
            window = sentence_tokens[start:start + len(words)]
            if any(t["pos"] in {"VERB", "AUX"} for t in window):
                return True
    # Word sequence not locatable (tokenizer split differs): don't fail on
    # alignment noise, only on a located all-non-verb span.
    return not found_occurrence


@pytest.mark.gemini
@pytest.mark.parametrize(
    "sentence,is_compound",
    [pytest.param(s, c, id=i) for i, s, c in GOLDEN_SENTENCES],
)
def test_golden_sentence_properties(sentence: str, is_compound: bool):
    normalized = structure._normalize(sentence)
    tree = _analyze(sentence)

    issues: list[str] = []

    # Schema conformity (roles/labels/patterns are Literal enums).
    try:
        StructureNode.model_validate(tree)
    except Exception as exc:  # noqa: BLE001 — report as a finding, keep checking
        issues.append(f"schema: {exc}")

    # Never-serve corruption must be absent.
    malformed = gemini._malformed_issue(tree)
    if malformed:
        issues.append(f"malformed: {malformed}")

    # Leaves reconstruct the original sentence verbatim (modulo style).
    if not gemini._reconstructs_sentence(tree, normalized):
        rebuilt = "".join(gemini._leaf_texts(tree))
        issues.append(f"reconstruction: leaves rebuild {rebuilt!r}")

    sentence_tokens = analyze_tokens(normalized)
    derived_type = gemini.derive_sentence_type(tree)
    top_main_clauses = 0
    for node in _walk(tree):
        node_type = node.get("type")
        label = node.get("label", "")
        path_hint = f"{node_type}:{node.get('text', '')[:40]!r}"

        # No word node may carry a phrase- or clause-level label.
        if node_type == "word" and label in (CLAUSE_LABELS | PHRASE_LABELS):
            issues.append(f"word node with non-word label {label}: {path_hint}")

        # Every clause node must be expanded into children.
        if node_type == "clause" and not node.get("children"):
            issues.append(f"clause without children: {path_hint}")

        # No noun-only span may be marked as the verb.
        if node.get("role") == "V" and not _verb_role_has_verb_token(
            node, sentence_tokens
        ):
            issues.append(f"role=V span has no verb token: {path_hint}")

        # Phase 2: a clause with at least one recognizable core-role child
        # (S/V/O/...) must carry its constituent-sequence badge. A clause
        # whose children carry NO core role at all is a pre-existing spaCy
        # fallback-tagging gap (e.g. archaic pronouns like "thou"/"art" on a
        # childless-clause retry) rather than a Phase 2 regression, so it is
        # not held to this check.
        child_roles = {c.get("role") for c in node.get("children") or []}
        has_core_role = bool(child_roles & set(gemini._SEQUENCE_SYMBOLS))
        if node_type == "clause" and has_core_role and not node.get("display_pattern"):
            # A compound sentence's top node intentionally has no badge.
            if node is not tree or derived_type not in {
                "compound", "compound-complex"
            }:
                issues.append(f"clause without display_pattern: {path_hint}")

    # Phase 2: the whole-sentence structure type must match the known shape,
    # and a compound sentence's top node must not carry a single pattern.
    if is_compound:
        if derived_type not in {"compound", "compound-complex"}:
            issues.append(f"expected compound(-complex), derived {derived_type}")
        if tree.get("pattern"):
            issues.append("compound top node still carries a single pattern")
    elif derived_type not in {"simple", "complex"}:
        issues.append(f"expected simple/complex, derived {derived_type}")

    # Compound sentences must expose >= 2 main clauses at the top level.
    if is_compound:
        top_main_clauses = sum(
            1
            for child in tree.get("children") or []
            if child.get("label") == "主要子句"
        )
        if top_main_clauses < 2:
            issues.append(
                f"compound sentence has {top_main_clauses} top-level main clauses"
            )

    assert not issues, "\n".join(issues)
