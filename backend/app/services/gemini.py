import json
import logging
import re
from typing import Literal

from fastapi import HTTPException
from google import genai
from google.genai import types
from pydantic import BaseModel, ConfigDict, ValidationError

from app.models.vocab import VocabOptions
from app.core.config import settings
from app.services.nlp import analyze_tokens, strip_invisible

logger = logging.getLogger(__name__)

# Initialize Gemini client with the configured API key.
client = genai.Client(api_key=settings.gemini_api_key)

# Extract token usage counts from a Gemini response, defaulting missing values to zero.
def _extract_usage(response) -> dict:
    meta = getattr(response, "usage_metadata", None)
    if meta is None:
        return {"prompt_tokens": 0, "response_tokens": 0, "total_tokens": 0}
    return {
        "prompt_tokens": getattr(meta, "prompt_token_count", 0) or 0,
        "response_tokens": getattr(meta, "candidates_token_count", 0) or 0,
        "total_tokens": getattr(meta, "total_token_count", 0) or 0,
    }


def _strip_echoed_indices(translations: list[str]) -> list[str]:
    """Remove model-added list indices only when the whole batch has them.

    Requiring at least two aligned prefixes and whitespace after each period
    avoids treating legitimate values such as "0.5" as echoed indices.
    """
    if len(translations) < 2:
        return translations

    patterns = [re.compile(rf"^\s*{i}\.\s+") for i in range(len(translations))]
    if not all(pattern.match(value) for pattern, value in zip(patterns, translations)):
        return translations

    return [
        pattern.sub("", value, count=1)
        for pattern, value in zip(patterns, translations)
    ]


def ai_translate_list(sentences: list[str], target_lang: str = "zh-TW", mode: str = "normal") -> tuple[list[str], dict]:
    if not sentences:
        return [], {"prompt_tokens": 0, "response_tokens": 0, "total_tokens": 0}
    
    # Adjust prompt style based on mode.
    style_hint = (
        "Use natural, fluent translation."
        if mode == "normal"
        else
        "Translate for language learners.  Keep sentence structure clear and explicit. "
        "Avoid omitting subjects or connectors."
    )

    # JSON input keeps item boundaries without adding numeric prefixes that the
    # model can accidentally copy into its translations.
    input_json = json.dumps(sentences, ensure_ascii=False)
    prompt = (
        f"Translate each sentence into {target_lang}. "
        f"{style_hint}"
        "Return ONLY a JSON array of strings. "
        "The array length and order MUST match the input. "
        "Preserve line breaks within each string. "
        "No explanation, no markdown.\n\n"
        f"Input JSON array:\n{input_json}"
        )
    # Appended on the retry: the first miss is usually the model merging or
    # dropping items, so restate the count constraint more forcefully.
    strict_reminder = (
        "\n\nCRITICAL: The output array MUST contain EXACTLY "
        f"{len(sentences)} strings, one per input item, in the same order. "
        "Do NOT merge, split, drop, or add items."
    )

    # Accumulate usage across attempts so token accounting stays accurate even
    # when a retry happens.
    usage = {"prompt_tokens": 0, "response_tokens": 0, "total_tokens": 0}
    last_error: HTTPException | None = None

    # A length/shape mismatch is usually a transient model slip; one retry with a
    # stronger count constraint recovers it without bothering the user.
    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=settings.gemini_model,
                contents=prompt + (strict_reminder if attempt else ""),
                config={
                    "response_mime_type": "application/json",
                    "thinking_config": {"thinking_budget": 0},
                }
            )
            text = response.text.strip()
        except Exception as e:
            raise HTTPException(
                status_code=502,
                detail=f"Gemini API request failed: {e}"
            )

        attempt_usage = _extract_usage(response)
        for key in usage:
            usage[key] += attempt_usage[key]

        # Parse and validate; on a recoverable model-output problem, record it
        # and let the loop retry once before surfacing the error.
        try:
            translations = json.loads(text)
        except Exception as e:
            last_error = HTTPException(
                status_code=502,
                detail=f"Failed to parse Gemini output as JSON.  Error: {e}.  Output preview: {text[:300]}"
            )
            continue

        if not isinstance(translations, list):
            last_error = HTTPException(status_code=502, detail="Gemini output is not a JSON array.")
            continue

        if len(translations) != len(sentences):
            last_error = HTTPException(
                status_code=502,
                detail=(
                    "Gemini output length does not match input length: "
                    f"expected {len(sentences)}, got {len(translations)}."
                )
            )
            continue

        if not all(isinstance(translation, str) for translation in translations):
            last_error = HTTPException(status_code=502, detail="Gemini output array must contain only strings.")
            continue

        return _strip_echoed_indices(translations), usage

    raise last_error

# Exam-layout annotation marks that OCR captures but that are not part of the
# prose: circled reference markers (①-⑳), footnote superscript digits, and
# asterisks used to flag vocabulary (e.g. "goofy*"). Left in, they pollute
# sentence splitting, translation, and vocab lookup, so strip them.
_ANNOTATION_MARKS = re.compile(r"[①-⑳⁰¹²³⁴-⁹*]")


# Collapse hard line wraps from print layouts: join single newlines within a
# paragraph into spaces, keep blank lines as paragraph breaks, and rejoin
# words hyphenated across lines. The OCR prompt asks Gemini to do this, but
# the model does not reliably comply, so normalize deterministically.
def _normalize_ocr_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _ANNOTATION_MARKS.sub("", text)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    paragraphs = re.split(r"\n\s*\n", text)
    return "\n\n".join(
        " ".join(p.split()) for p in paragraphs if p.strip()
    )


# Extract text from an image (OCR) using Gemini vision.
def ai_ocr_image(image_bytes: bytes, mime_type: str) -> tuple[str, dict]:
    prompt = (
        "Extract all visible text from this image exactly as written. "
        "Preserve paragraph breaks (use a blank line between paragraphs). "
        "Join lines that were wrapped mid-sentence into a single line. "
        "If one sentence is split across a page or column break, join it into a "
        "single paragraph without a blank line; but keep titles and headings on "
        "their own line. "
        "Ignore line numbers printed in the margin (e.g. 5, 10, 15) and reference "
        "markers such as ①②③ or footnote superscripts — do not include them. "
        "Do not translate, summarize, correct, or add any commentary. "
        "If the image contains no readable text, return an empty string. "
        "Return plain text only."
    )

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                prompt,
            ],
            config={
                "temperature": 0,
                "thinking_config": {"thinking_budget": 0},
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini API request failed: {e}"
        )

    text = _normalize_ocr_text(response.text) if response.text else ""
    return text, _extract_usage(response)


# --- Sentence-structure analysis (five-pattern constituent tree) ---------------

# Bumped whenever the prompt, output schema, or post-processing below changes in
# a way that should invalidate cached analyses. The parse cache keys on
# (sentence_hash, this).
PARSE_PROMPT_VERSION = 10

# The pedagogical labels the model may use, mirrored from app.models.parse.Label.
# Listed in the prompt so the model picks from a fixed vocabulary.
_STRUCTURE_LABELS = (
    "主詞,動詞,受詞,間接受詞,直接受詞,主詞補語,受詞補語,引導詞,對等連接詞,標點,"
    "名詞,代名詞,限定詞,形容詞,副詞,介系詞,連接詞,助動詞,"
    "主要子句,受詞子句,主詞子句,補語子句,副詞子句,關係子句,同位子句,"
    "名詞片語,動名詞片語,不定詞片語,原形動詞補語,分詞片語,介系詞片語,形容詞片語,副詞片語"
)

_STRUCTURE_PROMPT = (
    "You are an English-grammar analyzer for Traditional-Chinese-speaking learners.\n"
    "Analyze the sentence into a NESTED constituent tree using the seven basic "
    "sentence patterns (SV / SVC / SVO / SVA / SVOO / SVOC / SVOA).\n\n"
    "Return ONLY a JSON object for the top node, where each node is:\n"
    '{ "text", "role", "type", "label", "pattern"(clause only), "children"(phrase/clause only) }\n\n'
    "role in [ROOT,S,V,O,IO,DO,SC,OC,HEAD,DET,MOD,PREP,ADV,ADJ,CONJ,MARK,PUNCT]\n"
    "type in [word, phrase, clause]\n"
    "pattern in [SV, SVC, SVO, SVA, SVOO, SVOC, SVOA]\n"
    f"label in [{_STRUCTURE_LABELS}]\n\n"
    "Rules:\n"
    "1. Concatenating every LEAF node's \"text\" left-to-right MUST reproduce the "
    "sentence verbatim (same words, same order, keep quotes/punctuation).\n"
    "2. The top node is role=ROOT, type=clause, label=主要子句, with its pattern. "
    "role=ROOT appears ONLY on the top node. For a COMPOUND sentence (two or more "
    "coordinated main clauses joined by and/but/yet/or, a semicolon, or a dash) "
    "the top node omits \"pattern\" and holds each coordinated clause as its own "
    "主要子句 clause child with role=CONJ (a coordinate main clause fills no "
    "S/O/C slot of the top node; NEVER give it role=S/O/SC/OC/ROOT) plus the "
    "connector/punctuation between them. Sentence-final punctuation is a direct "
    "child of the top node, never nested inside an inner phrase or clause.\n"
    "3. EVERY clause (main or subordinate) gets its own \"pattern\" and is broken "
    "into its S/V/O/IO/DO/SC/OC constituents. Finite content/appositive clauses "
    "after nouns (e.g. 'the fact that she came') and relative clauses (e.g. 'the "
    "person who came') MUST be clause nodes; never flatten their words directly "
    "into the surrounding noun or prepositional phrase. Place such a clause "
    "INSIDE the noun phrase node of its antecedent (a non-restrictive comma "
    "stays inside that noun phrase too), not as a direct child of the outer "
    "clause.\n"
    "4. Causative/perception verbs (help/make/let/have/see/find/keep/consider ...): "
    "\"V + OBJECT + adjective/noun/bare-infinitive\" -> the object is O and the "
    "trailing part is OC (受詞補語 / 原形動詞補語), NOT part of one big object.\n"
    "5. EVERY clause and every phrase containing 3 OR MORE lexical words MUST have "
    "children. A short phrase of at most 2 words may remain a leaf when further "
    "splitting adds little teaching value (e.g. 'Earth's surface' or 'of it'). "
    "Recursively expand longer noun, prepositional, adjective, adverb, participial, "
    "infinitive, and gerund phrases into meaningful smaller "
    "phrases and word leaves. For noun phrases, expose determiners, modifiers, the "
    "head noun, and embedded prepositional phrases. For coordinated lists, expose "
    "each item, conjunction, and punctuation. A phrase with 6 or more lexical words "
    "MUST contain at least one phrase or clause child, not only word children. "
    "Represent non-finite structures such as 'relying on faith' and 'to save' as "
    "分詞片語 and 不定詞片語 nodes. Do not flatten a long phrase into one node or "
    "one list of word nodes.\n"
    "6. Inside a phrase use role=HEAD for its lexical head, DET for a determiner, "
    "PREP for a preposition, ADJ/ADV for adjective/adverb modifiers, MOD for another "
    "modifier, and CONJ for coordinated material. Label word leaves by their part of "
    "speech (名詞/代名詞/限定詞/形容詞/副詞/介系詞/連接詞/助動詞), except a clause's "
    "direct S/V/O/C word may use its grammatical-function label. A prepositional "
    "phrase is label=介系詞片語 and role=ADJ when modifying a noun or role=ADV when "
    "modifying a verb, adjective, or whole clause.\n"
    "7. Coordinated items use role=CONJ; the subordinator (that/which/because...) "
    "is a MARK/引導詞 word inside its clause. A clause opened by a subordinating "
    "conjunction (because/although/when/since/while/whereas...) is a 副詞子句 "
    "inside the main clause — contrastive while/whereas included. Only "
    "and/but/or/yet/so, a semicolon, or a dash join coordinate 主要子句.\n"
    "8. Reproduce EVERY word of the sentence exactly once, verbatim — never drop, "
    "merge away, or paraphrase a word. This applies to ALL words WITHOUT EXCEPTION, "
    "especially easily-omitted function words: ANY adverb, ANY auxiliary/modal and "
    "the COMPLETE verb group (e.g. 'will be', 'has been', 'is being', 'would have "
    "been'), particles, articles, prepositions, and conjunctions.\n"
    "9. Do not absorb a trailing adjunct into S/O/SC/OC. For example a comma + 'with "
    "...' supplement that modifies the whole clause must be separate top-level PUNCT "
    "and ADV children, while the core S/V/O/C span remains precise.\n"
    "10. SVA and SVOA are for OBLIGATORY adverbials only: SVA when the verb needs an "
    "adverbial to be complete ('She is in the kitchen'), SVOA when verb + object need "
    "one ('He put the keys on the table'). An optional adverbial does NOT change the "
    "pattern — 'She reads books at night' stays SVO.\n"
    "11. Label level must match node type: a word node takes a word-level label "
    "(grammatical function or part of speech), a phrase node takes a 片語 label, and "
    "a clause node takes a 子句 label. Never put 主詞/受詞/動詞 on a phrase node or a "
    "片語/子句 label on a word node.\n"
    "Return JSON only. No markdown, no commentary.\n\n"
    "Sentence: "
)

# Appended when a retry is needed: the model's previous answer failed the
# verbatim-reconstruction check, so restate that constraint forcefully.
_STRUCTURE_RETRY_HINT = (
    "\n\nYour previous answer was REJECTED because it was either insufficiently "
    "nested or its leaf texts did not exactly reproduce the sentence. Re-analyze "
    "with children on every clause and every phrase of 3 or more words. Short phrases "
    "of at most 2 words may remain leaves. Do not flatten a phrase of 6 or more words "
    "into word children. Create separate clause nodes for every finite content, "
    "relative, and adverb clause, plus phrase nodes for embedded prepositional, "
    "participial, and infinitive phrases. Ensure every original word appears exactly "
    "once, verbatim."
)


def _leaf_texts(node: dict) -> list[str]:
    """Surface text of every leaf (childless) node, in order."""
    children = node.get("children")
    if not children:
        return [node["text"]]
    out: list[str] = []
    for child in children:
        out.extend(_leaf_texts(child))
    return out


# Style differences that must not fail reconstruction: curly vs straight
# quotes/apostrophes and dash variants. Whitespace and case are handled separately.
_PUNCT_VARIANTS = str.maketrans({
    "“": '"', "”": '"', "‘": "'", "’": "'",
    "—": "-", "–": "-",
})


def _normalize_for_compare(text: str) -> str:
    text = strip_invisible(text).translate(_PUNCT_VARIANTS).replace("…", "...")
    return re.sub(r"\s+", "", text).casefold()


# Punctuation that may be appended as a repaired trailing leaf. Anything else
# missing means real words were dropped, which is never repairable here.
_TRAILING_PUNCT_CHARS = set(".?!…\"'”’)]。？！」』")


def _repair_missing_trailing_punct(structure: dict, sentence: str) -> None:
    """Append sentence-final punctuation the model dropped.

    On long sentences the model sometimes returns an otherwise perfect tree
    whose leaves miss only the final period or closing quote; rejecting that
    would waste a correct analysis, so add the missing PUNCT leaf instead."""
    children = structure.get("children")
    if not children:
        return
    leaves = _normalize_for_compare("".join(_leaf_texts(structure)))
    target = _normalize_for_compare(sentence)
    if leaves == target or not target.startswith(leaves):
        return

    for tail_length in range(1, 7):
        raw_tail = sentence[-tail_length:]
        if not set(raw_tail) <= _TRAILING_PUNCT_CHARS:
            break
        if leaves + _normalize_for_compare(raw_tail) == target:
            children.append(
                {"text": raw_tail, "role": "PUNCT", "type": "word", "label": "標點"}
            )
            # Keep the ROOT span consistent with its children when its own
            # text was missing the punctuation too.
            root_text = str(structure.get("text", ""))
            if _normalize_for_compare(root_text) + _normalize_for_compare(raw_tail) == target:
                structure["text"] = root_text + raw_tail
            return


def _reconstructs_sentence(structure: dict, sentence: str) -> bool:
    """True when the leaf texts reproduce the sentence.

    Whitespace, letter case, and quote/dash style are normalized away on both
    sides so the check tolerates cosmetic choices while still catching dropped,
    added, or reordered words."""
    return _normalize_for_compare("".join(_leaf_texts(structure))) == _normalize_for_compare(sentence)


_LEXICAL_TOKEN = re.compile(r"[A-Za-z0-9]+(?:[-'’][A-Za-z0-9]+)*")
_WORD_ONLY_PHRASE_LIMIT = 5
_HIERARCHICAL_PHRASE_DEPS = {
    "acl", "relcl", "ccomp", "advcl", "xcomp", "pcomp", "prep"
}
_FINITE_EMBEDDED_CLAUSE_DEPS = {"acl", "relcl", "ccomp", "advcl"}
_CONTENT_CLAUSE_NOUNS = {
    "assumption", "belief", "claim", "conclusion", "decision", "fact", "hope",
    "idea", "knowledge", "news", "possibility", "promise", "proposal", "report",
    "suggestion", "thought",
}


def _lexical_token_count(text: str) -> int:
    return len(_LEXICAL_TOKEN.findall(text))


def _phrase_requires_hierarchy(
    text: str,
    tokens: list[dict[str, str | bool | int]] | None = None,
) -> bool:
    """Whether word children alone would hide meaningful internal structure."""
    if _lexical_token_count(text) > _WORD_ONLY_PHRASE_LIMIT:
        return True
    tokens = tokens if tokens is not None else analyze_tokens(text)
    return any(str(token["dep"]) in _HIERARCHICAL_PHRASE_DEPS for token in tokens)


def _is_finite_embedded_clause(token: dict[str, str | bool | int]) -> bool:
    """Whether a token heads a finite subordinate clause (relative, content,
    or adverb clause) that must appear as a clause node.

    Non-finite complements must not qualify: in "allowed those challenges to
    define him" or "helps him prepare", spaCy attaches the inner verb as a
    clausal complement with its own subject, but the prompt (rule 4) requires
    O + OC there — demanding a clause node would reject correct analyses."""
    return (
        str(token["dep"]) in _FINITE_EMBEDDED_CLAUSE_DEPS
        and bool(token["is_finite"])
        and (bool(token["has_subject"]) or bool(token["has_marker"]))
    )


def _embedded_finite_clause_count(text: str) -> int:
    """Estimate finite subordinate clauses that must appear as clause nodes."""
    return sum(1 for token in analyze_tokens(text) if _is_finite_embedded_clause(token))


def _descendant_clause_count(node: dict) -> int:
    count = 0
    for child in node.get("children") or []:
        if child.get("type") == "clause":
            count += 1
        count += _descendant_clause_count(child)
    return count


def _dependency_subtree_indices(
    root_index: int,
    children_by_head: dict[int, list[int]],
) -> set[int]:
    indices = {root_index}
    pending = [root_index]
    while pending:
        current = pending.pop()
        for child_index in children_by_head.get(current, []):
            if child_index not in indices:
                indices.add(child_index)
                pending.append(child_index)
    return indices


def _infer_clause_pattern(
    tokens: list[dict[str, str | bool | int]],
    content_clause: bool = False,
) -> str:
    root = next((token for token in tokens if bool(token["is_root"])), None)
    root_index = int(root["index"]) if root is not None else -1
    branches = [
        token
        for token in tokens
        if int(token["head_index"]) == root_index
        and int(token["index"]) != root_index
        if not (
            content_clause
            and str(token["lower"]) == "that"
            and str(token["dep"]) in _OBJECT_DEPS
        )
    ]
    deps = {str(token["dep"]) for token in branches}
    # Rule 4 of the prompt: a non-finite clausal complement is O + OC, not a
    # clause — "helps him prepare" is SVOC even though spaCy parses "him" as
    # the inner verb's subject rather than as a direct object.
    nonfinite_complements = [
        token
        for token in branches
        if str(token["dep"]) in {"ccomp", "xcomp"} and not bool(token["is_finite"])
    ]
    has_indirect = bool(deps & _INDIRECT_OBJECT_DEPS)
    has_object = bool(deps & _OBJECT_DEPS)
    has_complement = bool(deps & _COMPLEMENT_DEPS)
    if has_indirect and has_object:
        return "SVOO"
    if has_object and (has_complement or nonfinite_complements):
        return "SVOC"
    if any(bool(token["has_subject"]) for token in nonfinite_complements):
        return "SVOC"
    # A finite content clause or an infinitive/gerund complement fills the
    # object slot ("said (that) she left", "wants to go").
    if has_object or deps & {"ccomp", "xcomp"}:
        return "SVO"
    if has_complement:
        return "SVC"
    if root is not None and str(root["pos"]) == "AUX":
        # A bare copula with no complement needs its adverbial to be complete:
        # "She is in the kitchen" is SVA, not SVC.
        if any(str(token["dep"]) in {"prep", "advmod", "npadvmod"} for token in branches):
            return "SVA"
        return "SVC"
    return "SV"


def _dependency_group_candidates(
    tokens: list[dict[str, str | bool | int]],
    parent_type: str,
    parent_label: str = "",
) -> list[dict[str, int | str]]:
    """Find projective dependency branches worth displaying as nested nodes."""
    children_by_head: dict[int, list[int]] = {}
    for token in tokens:
        index = int(token["index"])
        head_index = int(token["head_index"])
        if index != head_index:
            children_by_head.setdefault(head_index, []).append(index)

    candidates: list[dict[str, int | str]] = []
    token_by_index = {int(token["index"]): token for token in tokens}
    for token in tokens:
        index = int(token["index"])
        if bool(token["is_root"]):
            continue
        dep = str(token["dep"])
        pos = str(token["pos"])

        kind: str | None = None
        if _is_finite_embedded_clause(token):
            kind = "clause"
        elif dep in {"acl", "advcl", "xcomp"} and pos in {"VERB", "AUX"}:
            kind = "infinitive" if dep == "xcomp" else "participle"
        elif dep in {"prep", "pcomp"}:
            kind = "preposition"
        elif parent_type == "clause" and dep in _SUBJECT_DEPS | _OBJECT_DEPS | _INDIRECT_OBJECT_DEPS:
            kind = "noun"
        elif parent_type == "clause" and dep in _COMPLEMENT_DEPS:
            kind = "complement"
        elif parent_type == "phrase" and dep == "pobj":
            kind = "noun"
        if kind is None:
            continue

        subtree = _dependency_subtree_indices(index, children_by_head)
        start_index, end_index = min(subtree), max(subtree)
        # A clause-initial relative pronoun misparsed as a determiner of the
        # following noun ("that time gives ...") must stay outside the grouped
        # noun phrase so it can be labeled as the clause's opener.
        if (
            parent_label == "關係子句"
            and kind == "noun"
            and start_index == int(tokens[0]["index"])
            and str(token_by_index[start_index]["lower"]) in {"that", "which"}
            and str(token_by_index[start_index]["dep"]) == "det"
        ):
            start_index += 1
        # Non-projective branches cannot safely become one contiguous surface span.
        if any(i not in subtree for i in range(start_index, end_index + 1)):
            continue
        if start_index == end_index and kind in {"noun", "complement"}:
            continue
        displayed_dep = dep
        head = token_by_index.get(int(token["head_index"]))
        first = token_by_index.get(start_index)
        if (
            kind == "clause"
            and dep in {"acl", "relcl"}
            and head is not None
            and first is not None
            and str(head["lower"]) in _CONTENT_CLAUSE_NOUNS
            and str(first["lower"]) == "that"
        ):
            displayed_dep = "content"
            opener = next(
                (
                    token_by_index.get(i)
                    for i in (end_index, end_index + 1)
                    if token_by_index.get(i) is not None
                    and str(token_by_index[i]["text"]) in {'"', "“", "‘"}
                ),
                None,
            )
            if opener is not None:
                opener_index = int(opener["index"])
                closing_quotes = [
                    int(item["index"])
                    for item in tokens
                    if int(item["index"]) > opener_index
                    and str(item["text"]) in {'"', "”", "’"}
                ]
                if closing_quotes:
                    end_index = closing_quotes[-1]
        candidates.append({
            "start": start_index,
            "end": end_index,
            "dep": displayed_dep,
            "kind": kind,
        })

    # Keep outer branches; nested candidates are discovered recursively inside
    # the newly-created node. This avoids overlapping surface spans.
    selected: list[dict[str, int | str]] = []
    for candidate in sorted(
        candidates,
        key=lambda item: (int(item["start"]), -int(item["end"])),
    ):
        start, end = int(candidate["start"]), int(candidate["end"])
        if any(
            not (end < int(existing["start"]) or start > int(existing["end"]))
            for existing in selected
        ):
            continue
        # Token indices should always exist, but checking here keeps malformed
        # parser output from becoming a tree-construction exception.
        if start in token_by_index and end in token_by_index:
            selected.append(candidate)
    return selected


def _dependency_group_node(
    parent_text: str,
    tokens: list[dict[str, str | bool | int]],
    candidate: dict[str, int | str],
    parent_type: str,
) -> dict:
    start = int(candidate["start"])
    end = int(candidate["end"])
    group_tokens = [token for token in tokens if start <= int(token["index"]) <= end]
    text = parent_text[int(group_tokens[0]["start"]):int(group_tokens[-1]["end"])]
    kind = str(candidate["kind"])
    dep = str(candidate["dep"])

    if kind == "clause":
        label = {
            "relcl": "關係子句",
            "ccomp": "受詞子句",
            "advcl": "副詞子句",
            "content": "同位子句",
        }.get(dep, "同位子句")
        role = "ADV" if dep == "advcl" else "MOD"
        fresh_group_tokens = analyze_tokens(text)
        node = {
            "text": text,
            "role": role,
            "type": "clause",
            "label": label,
            "pattern": _infer_clause_pattern(
                fresh_group_tokens,
                content_clause=dep == "content",
            ),
        }
        node["children"] = _clause_word_nodes(node)
    else:
        if kind == "preposition":
            label = "介系詞片語"
            role = "ADV" if parent_type == "clause" else "ADJ"
        elif kind == "infinitive":
            label, role = "不定詞片語", "MOD"
        elif kind == "participle":
            # An adverbial branch headed by "to + verb" is a purpose
            # infinitive, not a participle.
            label = "不定詞片語" if str(group_tokens[0]["lower"]) == "to" else "分詞片語"
            role = "ADV" if parent_type == "clause" else "MOD"
        elif kind == "complement":
            label, role = "形容詞片語", "SC"
        else:
            label = "名詞片語"
            if dep in _SUBJECT_DEPS:
                role = "S"
            elif dep in _INDIRECT_OBJECT_DEPS:
                role = "IO"
            elif dep in _OBJECT_DEPS:
                role = "O"
            else:
                role = "HEAD"
        node = {"text": text, "role": role, "type": "phrase", "label": label}
        node["children"] = [_phrase_word_node(token) for token in group_tokens]

    _nest_flat_dependency_groups(node)
    return node


def _nest_flat_dependency_groups(node: dict) -> None:
    """Turn a flat word list into deterministic nested dependency constituents."""
    children = node.get("children") or []
    if not children or not all(child.get("type") == "word" for child in children):
        return
    tokens = analyze_tokens(node["text"])
    if len(tokens) != len(children):
        return
    candidates = _dependency_group_candidates(
        tokens, str(node["type"]), str(node.get("label") or "")
    )
    if not candidates:
        return

    by_start = {int(candidate["start"]): candidate for candidate in candidates}
    rebuilt_words = (
        _clause_word_nodes(node)
        if node.get("type") == "clause"
        else [_phrase_word_node(token) for token in tokens]
    )
    new_children: list[dict] = []
    position = 0
    while position < len(tokens):
        token_index = int(tokens[position]["index"])
        candidate = by_start.get(token_index)
        if candidate is None:
            new_children.append(rebuilt_words[position])
            position += 1
            continue
        new_children.append(
            _dependency_group_node(node["text"], tokens, candidate, str(node["type"]))
        )
        end = int(candidate["end"])
        while position < len(tokens) and int(tokens[position]["index"]) <= end:
            position += 1
    node["children"] = new_children


def _phrase_word_node(token: dict[str, str | bool | int]) -> dict:
    """Map a spaCy token to the controlled structure roles and labels."""
    text = str(token["text"])
    lower = str(token["lower"])
    pos = str(token["pos"])

    if pos == "PUNCT":
        role, label = "PUNCT", "標點"
    elif pos in {"DET", "NUM"} or lower in {"'s", "’s"}:
        role, label = "DET", "限定詞"
    elif pos == "ADJ":
        role, label = "ADJ", "形容詞"
    elif pos == "ADV":
        role, label = "ADV", "副詞"
    elif pos == "ADP" or lower == "upon" or str(token["dep"]) == "prep":
        role, label = "PREP", "介系詞"
    elif pos in {"CCONJ", "SCONJ"}:
        role, label = "CONJ", "連接詞"
    elif pos == "AUX":
        role, label = "MOD", "助動詞"
    elif pos == "VERB":
        role, label = "MOD", "動詞"
    elif pos == "PRON":
        role, label = "MOD", "代名詞"
    elif pos == "PART" and lower == "to":
        role, label = "MOD", "助動詞"
    else:
        role, label = "MOD", "名詞"

    if bool(token["is_root"]) and role not in {"PUNCT", "PREP"}:
        role = "HEAD"

    return {"text": text, "role": role, "type": "word", "label": label}


_CLAUSE_ROLE_LABELS = {
    "S": "主詞",
    "V": "動詞",
    "O": "受詞",
    "IO": "間接受詞",
    "DO": "直接受詞",
    "SC": "主詞補語",
    "OC": "受詞補語",
    "MARK": "引導詞",
    "CONJ": "對等連接詞",
    "PUNCT": "標點",
}

_SUBJECT_DEPS = {"nsubj", "nsubjpass", "csubj", "expl"}
_OBJECT_DEPS = {"dobj", "obj"}
_INDIRECT_OBJECT_DEPS = {"dative", "iobj"}
_COMPLEMENT_DEPS = {"attr", "acomp", "oprd"}

# Label vocabulary split by the node level it belongs to, mirroring the
# groupings in app.models.parse.Label. A node whose label sits at the wrong
# level (e.g. 主詞 on a phrase) is deterministically repaired before validation.
_WORD_POS_LABELS = {"名詞", "代名詞", "限定詞", "形容詞", "副詞", "介系詞", "連接詞", "助動詞"}
_WORD_LEVEL_LABELS = set(_CLAUSE_ROLE_LABELS.values()) | _WORD_POS_LABELS
_CLAUSE_LEVEL_LABELS = {
    "主要子句", "受詞子句", "主詞子句", "補語子句", "副詞子句", "關係子句", "同位子句",
}
_PHRASE_LEVEL_LABELS = {
    "名詞片語", "動名詞片語", "不定詞片語", "原形動詞補語", "分詞片語",
    "介系詞片語", "形容詞片語", "副詞片語",
}
_SUBORDINATE_CLAUSE_LABELS = _CLAUSE_LEVEL_LABELS - {"主要子句"}

# Clause label implied by the slot a mislabeled clause node fills.
_CLAUSE_LABEL_BY_ROLE = {
    "S": "主詞子句",
    "O": "受詞子句",
    "DO": "受詞子句",
    "IO": "受詞子句",
    "SC": "補語子句",
    "OC": "補語子句",
    "ADV": "副詞子句",
    "ADJ": "關係子句",
    "MOD": "關係子句",
}


def _clause_branch_dep(
    token: dict[str, str | bool | int],
    tokens_by_index: dict[int, dict[str, str | bool | int]],
    root_index: int,
) -> str:
    """Dependency label of the token's top-level branch under the clause root."""
    current = token
    visited: set[int] = set()
    while int(current["index"]) != root_index:
        current_index = int(current["index"])
        head_index = int(current["head_index"])
        if head_index == root_index or head_index == current_index or head_index in visited:
            break
        visited.add(current_index)
        parent = tokens_by_index.get(head_index)
        if parent is None:
            break
        current = parent
    return str(current["dep"])


def _clause_word_nodes(node: dict) -> list[dict]:
    """Build a usable word-level clause analysis from spaCy dependencies.

    Gemini determines the clause boundary, label, and five-pattern classification.
    This fallback only fills an accidentally empty clause so one malformed nested
    node does not discard an otherwise valid analysis.
    """
    tokens = analyze_tokens(node["text"])
    if not tokens:
        return []

    tokens_by_index = {int(token["index"]): token for token in tokens}
    root = next((token for token in tokens if bool(token["is_root"])), None)
    if root is None:
        return [_phrase_word_node(token) for token in tokens]

    root_index = int(root["index"])
    pattern = node.get("pattern")
    word_nodes: list[dict] = []

    for token in tokens:
        dep = str(token["dep"])
        pos = str(token["pos"])
        lower = str(token["lower"])
        token_index = int(token["index"])
        branch_dep = _clause_branch_dep(token, tokens_by_index, root_index)

        if pos == "PUNCT":
            role = "PUNCT"
        elif dep == "mark" or (
            node.get("label") == "同位子句"
            and lower == "that"
            and token_index < root_index
        ) or (
            # Clause-initial relative pronoun misparsed as a determiner: show
            # it as the clause opener instead of merging it into the subject.
            node.get("label") == "關係子句"
            and dep == "det"
            and lower in {"that", "which"}
            and token_index == int(tokens[0]["index"])
        ):
            role = "MARK"
        elif dep == "cc":
            role = "CONJ"
        elif token_index == root_index:
            # A re-parsed fragment can root at a noun; only a verb may be V.
            role = "V" if pos in {"VERB", "AUX"} else None
        elif dep in {"aux", "auxpass", "cop", "prt"} and int(token["head_index"]) == root_index:
            # Only the root's own verb group is V — an embedded verb's "to" or
            # auxiliary must not be underlined as the clause's verb.
            role = "V"
        elif branch_dep in _SUBJECT_DEPS:
            role = "S"
        elif branch_dep in _INDIRECT_OBJECT_DEPS:
            role = "IO" if pattern == "SVOO" else "O"
        elif branch_dep in _OBJECT_DEPS:
            role = "DO" if pattern == "SVOO" else "O"
        elif branch_dep in _COMPLEMENT_DEPS:
            role = "OC" if pattern == "SVOC" or branch_dep == "oprd" else "SC"
        elif branch_dep == "xcomp" and pattern == "SVOC":
            # The infinitive complement of a causative/perception verb is the
            # object complement (rule 4), e.g. "allowed those challenges [to
            # define him]".
            role = "OC"
        else:
            role = None

        word_node = _phrase_word_node(token)
        if role is not None:
            word_node["role"] = role
            word_node["label"] = _CLAUSE_ROLE_LABELS[role]
        word_nodes.append(word_node)

    return word_nodes


def _expand_missing_details(node: dict) -> None:
    """Locally expand phrase or clause leaves when Gemini omits `children`.

    Gemini supplies the clause hierarchy, the roles, and the S/V/O/C patterns;
    spaCy only fills word-level detail under nodes Gemini left childless.
    Nodes that already have children are never regrouped or relabeled —
    overwriting the model's (usually correct) analysis with a small-model
    parse injects errors. Compact phrase leaves remain intentionally collapsed.
    """
    children = node.get("children")
    if node.get("type") == "phrase" and not children:
        if _lexical_token_count(node["text"]) >= 3:
            tokens = analyze_tokens(node["text"])
            token_nodes = [_phrase_word_node(token) for token in tokens]
            if token_nodes:
                node["children"] = token_nodes
                _nest_flat_dependency_groups(node)
    elif node.get("type") == "clause" and not children:
        token_nodes = _clause_word_nodes(node)
        if token_nodes:
            node["children"] = token_nodes
            _nest_flat_dependency_groups(node)

    for child in node.get("children") or []:
        _expand_missing_details(child)


def _unfilled_clause_issue(node: dict, path: str = "ROOT") -> str | None:
    """First clause the model returned without children, before local filling.

    The spaCy fill for a clause assigns S/V/O roles from a small-model parse,
    which is error-prone — so a clause arriving childless is worth a retry
    asking the model itself for the breakdown, even though the filled tree
    would pass the nesting checks."""
    if node.get("type") == "clause" and not node.get("children"):
        return (
            f"{path}: clause node arrived without children: "
            f"{str(node.get('text', ''))[:80]!r}"
        )
    for index, child in enumerate(node.get("children") or []):
        issue = _unfilled_clause_issue(child, f"{path}.{index}")
        if issue:
            return issue
    return None


def _malformed_issue(node: dict, path: str = "ROOT") -> str | None:
    """Structural corruption that must never be served: a word node with
    children, or a node whose text does not match its direct children's texts
    (the collapsed preview would then contradict the expanded view)."""
    children = node.get("children")
    label = node.get("label")
    if node.get("type") == "word":
        if children:
            return f"{path}: word node has children"
        if label in _CLAUSE_LEVEL_LABELS or label in _PHRASE_LEVEL_LABELS:
            return f"{path}: word node carries the non-word label {label}"
        return None
    if label in _WORD_LEVEL_LABELS:
        return f"{path}: {node.get('type')} node carries the word-level label {label}"
    if not children:
        return None

    child_text = "".join(child["text"] for child in children)
    if _normalize_for_compare(child_text) != _normalize_for_compare(node["text"]):
        return f"{path}: node text does not match its direct children"

    for index, child in enumerate(children):
        issue = _malformed_issue(child, f"{path}.{index}")
        if issue:
            return issue
    return None


def _nesting_issue(node: dict, path: str = "ROOT") -> str | None:
    """First spot where the tree is less nested than the prompt requires.

    Unlike _malformed_issue, an under-nested tree still renders correctly —
    just with less expandable detail — so this only drives retries; the last
    well-formed answer is served when no retry produces a fully nested one."""
    children = node.get("children")
    node_type = node.get("type")

    if node_type == "word":
        return None
    if not children:
        if node_type == "clause":
            return f"{path}: clause node has no children"
        word_count = _lexical_token_count(node["text"])
        if word_count <= 2:
            return None
        return f"{path}: unexpanded phrase has {word_count} lexical words"

    if (
        node_type == "phrase"
        and all(child.get("type") == "word" for child in children)
        and _phrase_requires_hierarchy(node["text"])
    ):
        return f"{path}: complex phrase was flattened into word nodes"

    expected_clauses = _embedded_finite_clause_count(node["text"])
    actual_clauses = _descendant_clause_count(node)
    if actual_clauses < expected_clauses:
        return (
            f"{path}: expected at least {expected_clauses} embedded clause node(s), "
            f"found {actual_clauses}"
        )

    for index, child in enumerate(children):
        issue = _nesting_issue(child, f"{path}.{index}")
        if issue:
            return issue
    return None


def _phrase_label_from_text(text: str) -> str:
    """Phrase-level label inferred from the span's own syntax, for repairing a
    phrase node that arrived with a word-level label."""
    tokens = analyze_tokens(text)
    if not tokens:
        return "名詞片語"
    first = tokens[0]
    if str(first["lower"]) == "to" and str(first["pos"]) == "PART":
        return "不定詞片語"
    if str(first["pos"]) == "ADP" or str(first["dep"]) == "prep":
        return "介系詞片語"
    root = next((token for token in tokens if bool(token["is_root"])), first)
    root_pos = str(root["pos"])
    if root_pos == "VERB":
        tag = str(root["tag"])
        if tag == "VBG":
            return "動名詞片語"
        if tag == "VB":
            return "原形動詞補語"
        return "分詞片語"
    if root_pos == "ADJ":
        return "形容詞片語"
    if root_pos == "ADV":
        return "副詞片語"
    return "名詞片語"


def _repair_node_levels(node: dict, top: bool = True) -> None:
    """Deterministically fix nodes whose label or role sits at the wrong level:
    a word carrying a 片語/子句 label becomes that node type (a compact leaf
    phrase is legal; a childless clause goes through the normal unfilled-clause
    retry), a phrase carrying a word-level label gets a derived 片語 label, a
    clause carrying a non-clause label gets one implied by its slot, and
    role=ROOT below the top node is demoted, and a coordinate main clause
    (a non-top 主要子句) always gets role=CONJ — it fills no S/O/C slot of
    the top node, but the model occasionally mislabels it S/O/ROOT."""
    label = node.get("label")
    node_type = node.get("type")
    if not top and node_type == "clause" and label == "主要子句":
        node["role"] = "CONJ"
    elif not top and node.get("role") == "ROOT":
        node["role"] = "CONJ" if node_type == "clause" else "HEAD"

    if node_type == "word":
        if label in _PHRASE_LEVEL_LABELS:
            node["type"] = "phrase"
        elif label in _CLAUSE_LEVEL_LABELS:
            node["type"] = "clause"
    elif node_type == "phrase":
        if label in _CLAUSE_LEVEL_LABELS:
            node["type"] = "clause"
        elif label in _WORD_LEVEL_LABELS:
            node["label"] = _phrase_label_from_text(str(node.get("text", "")))
    elif node_type == "clause" and label not in _CLAUSE_LEVEL_LABELS:
        node["label"] = _CLAUSE_LABEL_BY_ROLE.get(
            str(node.get("role", "")), "主要子句"
        )

    if node.get("type") != "clause":
        node.pop("pattern", None)

    for child in node.get("children") or []:
        _repair_node_levels(child, top=False)


# Only unambiguous sentence-final marks are lifted to the top level; a closing
# quote stays inside its quotation node.
_LIFTABLE_FINAL_PUNCT = set(".?!…")


def _lift_trailing_punct(structure: dict) -> None:
    """Move a sentence-final punctuation leaf nested deep inside the last
    branch up to the top level (the teaching mind map keeps sentence-final
    punctuation at the sentence level). Ancestor texts are trimmed so every
    node's text still matches its children."""
    if not structure.get("children"):
        return
    chain = [structure]
    while chain[-1].get("children"):
        chain.append(chain[-1]["children"][-1])
    leaf = chain[-1]
    if len(chain) <= 2:  # already a direct child of the top node
        return
    text = str(leaf.get("text", ""))
    if not text or (set(text) - _LIFTABLE_FINAL_PUNCT):
        return
    intermediate = chain[1:-1]
    if any(not str(node.get("text", "")).endswith(text) for node in intermediate):
        return  # unexpected spacing; leave the tree untouched
    parent = chain[-2]
    if len(parent["children"]) <= 1:
        return  # never leave an empty container behind
    parent["children"].pop()
    for node in intermediate:
        node["text"] = str(node["text"])[: -len(text)].rstrip()
    structure["children"].append(leaf)


# Dependencies under which a gerund acts as a noun / a past participle as an
# adjective, for relabeling 動詞 leaves that are not the clause's verb.
_NOMINAL_GERUND_DEPS = {"nsubj", "nsubjpass", "dobj", "pobj", "attr", "conj", "appos"}
_ADJECTIVAL_PARTICIPLE_DEPS = {"acomp", "amod", "conj", "oprd"}


def _fix_verbal_word_labels(structure: dict, sentence: str) -> None:
    """Relabel 動詞 word leaves that are not the clause's verb when spaCy shows
    they act as a gerund (-> 名詞) or a participial adjective (-> 形容詞),
    e.g. 'reading' in 'found spelling and reading difficult' or 'grounded' in
    'described as relatable and grounded'."""
    tokens = analyze_tokens(sentence)
    leaves: list[dict] = []

    def collect(node: dict) -> None:
        children = node.get("children")
        if not children:
            leaves.append(node)
            return
        for child in children:
            collect(child)

    collect(structure)
    cursor = 0
    for leaf in leaves:
        text = str(leaf.get("text", ""))
        start = sentence.find(text, cursor)
        if start == -1:
            continue
        cursor = start + len(text)
        if (
            leaf.get("type") != "word"
            or leaf.get("label") != "動詞"
            or leaf.get("role") == "V"
        ):
            continue
        covering = [
            token
            for token in tokens
            if int(token["start"]) < cursor and int(token["end"]) > start
        ]
        if len(covering) != 1:
            continue  # only single-word leaves are relabeled confidently
        token = covering[0]
        pos, tag, dep = str(token["pos"]), str(token["tag"]), str(token["dep"])
        if pos == "ADJ" or (tag == "VBN" and dep in _ADJECTIVAL_PARTICIPLE_DEPS):
            leaf["label"] = "形容詞"
        elif tag == "VBG" and dep in _NOMINAL_GERUND_DEPS:
            leaf["label"] = "名詞"


# Clause-child role -> symbol in the displayed constituent sequence. Roles not
# listed (MARK, CONJ, PUNCT, phrase-internal roles) do not appear in it.
_SEQUENCE_SYMBOLS = {
    "S": "S", "V": "V", "O": "O", "IO": "IO", "DO": "DO",
    "SC": "C", "OC": "C", "ADV": "A",
}

_RELATIVIZERS = {"that", "which", "who", "whom"}


def _relative_clause_gap_symbol(node: dict) -> str | None:
    """The slot a relative clause's relativizer fills — 'who came' opens with
    its subject (S), 'that time gives' opens with the gapped object (O) — so
    the badge reflects the true clause pattern instead of showing SV."""
    if node.get("label") != "關係子句":
        return None
    tokens = analyze_tokens(str(node.get("text", "")))
    if not tokens:
        return None
    first = tokens[0]
    if str(first["lower"]) not in _RELATIVIZERS:
        return None
    if str(first["dep"]) in _SUBJECT_DEPS:
        return "S"
    root = next((token for token in tokens if bool(token["is_root"])), None)
    if root is None or str(root["pos"]) != "VERB":
        return None
    has_object = any(str(token["dep"]) in _OBJECT_DEPS for token in tokens)
    has_subject = any(str(token["dep"]) in _SUBJECT_DEPS for token in tokens)
    if has_subject and not has_object:
        return "O"
    return None


def _clause_display_sequence(node: dict) -> str | None:
    """Surface constituent sequence of a clause ('A+S+V+O', 'S+V+IO+DO'),
    derived from the children's roles in order so the badge always matches the
    tree. A run of adjacent same-role words (a verb group) counts once."""
    children = node.get("children") or []
    symbols: list[str] = []
    previous_word_symbol: str | None = None
    for child in children:
        symbol = _SEQUENCE_SYMBOLS.get(str(child.get("role", "")))
        if symbol is None:
            previous_word_symbol = None
            continue
        if child.get("type") == "word":
            if symbol == previous_word_symbol:
                continue
            previous_word_symbol = symbol
        else:
            previous_word_symbol = None
        symbols.append(symbol)
    return "+".join(symbols) if symbols else None


def _annotate_display_patterns(node: dict) -> None:
    """Attach `display_pattern` to every clause and correct the pattern of an
    object-gap relative clause (SV -> SVO)."""
    if node.get("type") == "clause":
        sequence = _clause_display_sequence(node)
        gap = _relative_clause_gap_symbol(node)
        if gap:
            if gap == "O" and node.get("pattern") in (None, "SV"):
                node["pattern"] = "SVO"
            parts = sequence.split("+") if sequence else []
            if not parts or parts[0] != gap:
                sequence = "+".join([gap, *parts]) if parts else gap
        if sequence:
            node["display_pattern"] = sequence
    for child in node.get("children") or []:
        _annotate_display_patterns(child)


def derive_sentence_type(structure: dict) -> str:
    """Structure type for the whole-sentence badge, derived from the tree:
    >=2 coordinated main clauses at the top level -> compound, any subordinate
    clause anywhere -> complex, both -> compound-complex."""
    top_main_clauses = sum(
        1
        for child in structure.get("children") or []
        if child.get("type") == "clause" and child.get("label") == "主要子句"
    )
    compound = top_main_clauses >= 2

    def has_subordinate(node: dict) -> bool:
        for child in node.get("children") or []:
            if (
                child.get("type") == "clause"
                and child.get("label") in _SUBORDINATE_CLAUSE_LABELS
            ):
                return True
            if has_subordinate(child):
                return True
        return False

    complex_ = has_subordinate(structure)
    if compound and complex_:
        return "compound-complex"
    if compound:
        return "compound"
    if complex_:
        return "complex"
    return "simple"


def _finalize_structure(structure: dict, sentence: str) -> dict:
    """Deterministic presentation pass on a validated tree: relabel mislabeled
    verbal words, attach display sequences, and drop the top node's single
    pattern on a compound sentence (its clauses each carry their own)."""
    _fix_verbal_word_labels(structure, sentence)
    _annotate_display_patterns(structure)
    if derive_sentence_type(structure) in {"compound", "compound-complex"}:
        structure.pop("pattern", None)
        structure.pop("display_pattern", None)
    return structure


def _gemini_structure_schema() -> dict:
    """StructureNode's JSON schema without backend-derived fields, so the
    model cannot emit them."""
    from app.models.parse import StructureNode

    schema = StructureNode.model_json_schema()
    for definition in [schema, *schema.get("$defs", {}).values()]:
        properties = definition.get("properties")
        if properties:
            properties.pop("display_pattern", None)
    return schema


# Attempts for a single analysis: the first at temperature 0 (deterministic), then
# retries with a corrective hint and a nonzero temperature so the model can
# actually produce a *different*, fixed answer instead of repeating the reject.
_STRUCTURE_ATTEMPTS = 3
_STRUCTURE_RETRY_TEMPERATURE = 0.4
# Producing a verbatim nested tree for a long compound-complex sentence needs
# planning room; a small budget makes first attempts drop or merge words.
_STRUCTURE_THINKING_BUDGET = 4096


def _prune_empty_children(node: dict) -> None:
    """Drop `children: []` that the schema-constrained model emits on leaves,
    so leaf nodes stay childless dicts as the frontend expects."""
    children = node.get("children")
    if not children:
        node.pop("children", None)
        return
    for child in children:
        _prune_empty_children(child)


def ai_analyze_structure(sentence: str) -> tuple[dict, dict]:
    """Analyze a sentence into a five-pattern constituent tree using Gemini.

    Returns (structure_dict, usage). Retries prefer a fully nested tree; when
    every attempt is well-formed but under-nested, the last such tree is
    served rather than failing the analysis. Raises HTTPException(502) only
    when no attempt yields a well-formed tree that reproduces the sentence —
    the caller surfaces that so the UI can offer a retry."""
    # Imported here to avoid a circular import (models has no service deps).
    from app.models.parse import StructureNode

    usage = {"prompt_tokens": 0, "response_tokens": 0, "total_tokens": 0}
    last_error: HTTPException | None = None
    degraded: dict | None = None
    degraded_issue: str | None = None
    # Filled with the previous attempt's concrete defect (dropped words, the
    # exact childless clause, ...) so a retry fixes that spot instead of
    # gambling on temperature alone.
    previous_feedback: str | None = None

    for attempt in range(_STRUCTURE_ATTEMPTS):
        contents = _STRUCTURE_PROMPT + sentence
        temperature = 0.0
        if attempt:
            contents += _STRUCTURE_RETRY_HINT
            if previous_feedback:
                contents += f"\n\nPrevious-attempt feedback: {previous_feedback}"
            temperature = _STRUCTURE_RETRY_TEMPERATURE

        try:
            response = client.models.generate_content(
                model=settings.gemini_model,
                contents=contents,
                config={
                    "response_mime_type": "application/json",
                    # Enforce the node shape (role/type/label enums, recursion via
                    # $ref) at the API level so the model cannot mix up fields —
                    # e.g. putting a label value like 介系詞片語 into `type`.
                    # Backend-derived fields are stripped from the schema.
                    "response_json_schema": _gemini_structure_schema(),
                    "temperature": temperature,
                    "thinking_config": {
                        "thinking_budget": _STRUCTURE_THINKING_BUDGET,
                    },
                },
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Gemini API request failed: {e}")

        attempt_usage = _extract_usage(response)
        for key in usage:
            usage[key] += attempt_usage[key]

        try:
            data = json.loads(response.text)
            node = StructureNode.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as e:
            last_error = HTTPException(
                status_code=502,
                detail=f"Gemini structure analysis returned invalid data: {e}",
            )
            continue

        structure = node.model_dump(exclude_none=True)
        _prune_empty_children(structure)
        _repair_node_levels(structure)
        unfilled_clause = _unfilled_clause_issue(structure)
        _expand_missing_details(structure)
        _repair_missing_trailing_punct(structure, sentence)
        _lift_trailing_punct(structure)
        if not _reconstructs_sentence(structure, sentence):
            leaves = " | ".join(_leaf_texts(structure))
            previous_feedback = (
                "your answer did not reproduce the sentence verbatim. Its leaf "
                f"texts, in order, were:\n{leaves[:700]}\n"
                "Compare them with the sentence and fix every dropped, added, "
                "or altered word."
            )
            last_error = HTTPException(
                status_code=502,
                detail="Gemini structure analysis did not reproduce the sentence.",
            )
            continue
        malformed = _malformed_issue(structure)
        if malformed:
            previous_feedback = f"your answer was malformed: {malformed}."
            last_error = HTTPException(
                status_code=502,
                detail=f"Gemini structure analysis is malformed: {malformed}.",
            )
            continue

        nesting_issue = unfilled_clause or _nesting_issue(structure)
        if nesting_issue is None:
            return _finalize_structure(structure, sentence), usage

        # Well-formed but under-nested: keep it and retry for a fully nested
        # answer. Serving a shallow-but-correct tree beats failing the whole
        # analysis, so this never becomes a hard error on its own.
        previous_feedback = f"your answer was rejected because {nesting_issue}."
        degraded, degraded_issue = structure, nesting_issue
        last_error = HTTPException(
            status_code=502,
            detail=(
                "Gemini structure analysis was not sufficiently nested: "
                f"{nesting_issue}."
            ),
        )

    if degraded is not None:
        logger.warning(
            "Serving under-nested structure analysis for %r: %s",
            sentence,
            degraded_issue,
        )
        return _finalize_structure(degraded, sentence), usage
    raise last_error


# --- Reading-comprehension quiz generation --------------------------------------

class _GeminiQuizQuestion(BaseModel):
    """Strict shape expected from the comprehension-quiz prompt."""

    model_config = ConfigDict(extra="forbid", strict=True)

    question: str
    options: list[str]
    answer_index: int
    explanation: str


# Question quality (plausible distractors, inference questions) benefits from
# some planning room, unlike the mechanical translate/OCR prompts.
_QUIZ_THINKING_BUDGET = 1024


def ai_generate_quiz(article: str) -> tuple[list[dict], dict]:
    """Generate 3-5 multiple-choice reading-comprehension questions for an
    article. Returns (questions, usage); each question dict matches
    app.models.quiz.ComprehensionQuestion. Raises HTTPException(502) when no
    attempt yields valid questions."""
    prompt = (
        "You are creating a reading-comprehension quiz for an English learner "
        "whose native language is Traditional Chinese (zh-TW).\n\n"
        "Create 3 to 5 multiple-choice questions testing understanding of the "
        "article below: main idea, key details, inference, or vocabulary in "
        "context. Questions and options are in English at the article's level.\n\n"
        "Return ONLY a JSON array. Each item has EXACTLY these keys:\n"
        '- "question": the question (one sentence)\n'
        '- "options": EXACTLY 4 plausible options; only one is correct\n'
        '- "answer_index": integer 0-3, the index of the correct option\n'
        '- "explanation": ONE short Traditional Chinese (zh-TW) sentence '
        "explaining why the answer is correct\n\n"
        "Rules:\n"
        "- Every question must be answerable from the article alone.\n"
        "- Wrong options must be clearly wrong per the article, yet tempting.\n"
        "- Vary the position of the correct option across questions.\n"
        "- No markdown, no commentary.\n\n"
        f"Article:\n{article}"
    )
    strict_reminder = (
        "\n\nCRITICAL: Return ONLY a valid JSON array of 3-5 objects with keys "
        "question, options (exactly 4 strings), answer_index (0-3), explanation."
    )

    usage = {"prompt_tokens": 0, "response_tokens": 0, "total_tokens": 0}
    last_error: HTTPException | None = None

    # An invalid shape is usually a transient model slip; one retry with the
    # constraint restated recovers it (same policy as ai_translate_list).
    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=settings.gemini_model,
                contents=prompt + (strict_reminder if attempt else ""),
                config={
                    "response_mime_type": "application/json",
                    "temperature": 0.4,
                    "thinking_config": {"thinking_budget": _QUIZ_THINKING_BUDGET},
                },
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Gemini API request failed: {e}")

        attempt_usage = _extract_usage(response)
        for key in usage:
            usage[key] += attempt_usage[key]

        try:
            data = json.loads(response.text)
            if not isinstance(data, list) or not (1 <= len(data) <= 8):
                raise ValueError(f"expected a JSON array of 1-8 questions, got {type(data).__name__}")
            validated = [_GeminiQuizQuestion.model_validate(item) for item in data]
            for item in validated:
                if len(item.options) != 4:
                    raise ValueError("each question must have exactly 4 options")
                if not 0 <= item.answer_index <= 3:
                    raise ValueError("answer_index must be 0-3")
        except (json.JSONDecodeError, ValidationError, ValueError) as e:
            last_error = HTTPException(
                status_code=502,
                detail=f"Gemini quiz generation returned invalid data: {e}",
            )
            continue

        return [item.model_dump() for item in validated], usage

    raise last_error


_POS_MAP = {
    "noun": "n.",
    "pronoun": "pron.",
    "proper noun": "propn.",
    "verb": "v.",
    "adjective": "adj.",
    "adverb": "adv.",
    "preposition": "prep.",
    "conjunction": "conj.",
    "auxiliary": "aux.",
    "phrase": "phr.",
    "interjection": "interj.",
}


class _GeminiVocabResult(BaseModel):
    """Strict shape expected from the vocabulary lookup prompt."""

    model_config = ConfigDict(extra="forbid", strict=True)

    text: str
    lemma: str
    pos: Literal[
        "noun",
        "pronoun",
        "proper noun",
        "verb",
        "adjective",
        "adverb",
        "preposition",
        "conjunction",
        "auxiliary",
        "phrase",
        "interjection",
        "unknown",
    ]
    translation: str
    definition: str
    example: str
    level: Literal["", "A1", "A2", "B1", "B2", "C1", "C2"]


def normalize_pos(raw: str) -> str:
    return _POS_MAP.get(raw.strip().lower(), "?")

# Ask Gemini to identify lemma/pos from sentence context and fill requested vocab fields.
def ai_lookup_word(selected_text: str, sentence: str, options: VocabOptions) -> tuple[dict, dict]:
    tasks = []
    if options.translation:
        tasks.append("translation: Traditional Chinese (zh-TW) meaning of this word in context.")
    if options.definition:
        tasks.append("definition: Context-appropriate English synonym or simple definition (8 words or fewer).")
    if options.example:
        tasks.append("example: One natural example sentence.")
    if options.level:
        tasks.append("level: CEFR level (A1-C2).")
    task_list = "\n".join(f"- {t}" for t in tasks) if tasks else "- None"

    prompt = f"""You are an English dictionary for language learners.

Sentence: "{sentence}"
Selected word: "{selected_text}"

First, identify how this word is used in the sentence:
- pos: part of speech in this context (use one of: noun, pronoun, proper noun, verb, adjective, adverb, preposition, conjunction, auxiliary, phrase, interjection; if none apply use "unknown")
- lemma: base form determined by pos (rules below)

IMPORTANT rules for pos:
- If a present participle (-ing) or past participle (-ed/-en) is part of a verb phrase (e.g. "was consoling", "have oppressed", "is being"), tag it as "verb".
- Only tag a participle as "adjective" when it directly modifies a noun with no auxiliary verb (e.g. "a consoling smile", "the oppressed people").
- The pos must reflect how the word functions grammatically in THIS sentence, not its most common dictionary form.

IMPORTANT rules for lemma (depends on pos):
- noun → singular base form (e.g. "books" → "book", "churches" → "church")
- verb → infinitive base form (e.g. "kisses" → "kiss", "started" → "start", "running" → "run")
- adjective → keep the word exactly as it appears (e.g. "consoling" → "consoling", "oppressed" → "oppressed", "broken" → "broken")
- adverb → keep the word exactly as it appears
- all other pos → keep the word exactly as it appears

Then complete these tasks:
{task_list}

Return a JSON object with EXACTLY these keys:
- text
- lemma
- pos
- translation
- definition
- example
- level

Rules:
- "text" must be the selected word exactly as given.
- If a field is NOT listed in tasks, return "" for that field.
- Translation must be Traditional Chinese (zh-TW).
- Definition must be English only and 8 words or fewer.
- For Definition, use a context-appropriate equivalent synonym when one exists.
- Only use a simple English description when no equivalent synonym exists.
- Example must be ONE sentence.
- Level must be one of: A1, A2, B1, B2, C1, C2.
- Return ONLY valid JSON.
"""

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "temperature": 0.2,
                "thinking_config": {"thinking_budget": 0},
            }
        )
        raw_result = json.loads(response.text)
        validated = _GeminiVocabResult.model_validate(raw_result)
    except (json.JSONDecodeError, TypeError, AttributeError, ValidationError) as e:
        logger.warning("Gemini vocabulary lookup returned invalid data: %s", e)
        raise HTTPException(
            status_code=502,
            detail="Gemini vocabulary lookup returned an invalid response.",
        ) from e
    except Exception as e:
        logger.exception("Gemini vocabulary lookup request failed")
        raise HTTPException(
            status_code=502,
            detail="Gemini vocabulary lookup failed.",
        ) from e

    result = validated.model_dump()
    result["text"] = selected_text

    # Never retain fields that the caller did not request, even if the model
    # ignored the prompt and populated them anyway.
    for field in ("translation", "definition", "example", "level"):
        if not getattr(options, field):
            result[field] = ""

    return result, _extract_usage(response)
