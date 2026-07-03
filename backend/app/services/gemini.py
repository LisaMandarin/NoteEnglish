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
from app.services.nlp import analyze_tokens

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

# Bumped whenever the prompt or output schema below changes in a way that should
# invalidate cached analyses. The parse cache keys on (sentence_hash, this).
PARSE_PROMPT_VERSION = 5

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
    "Analyze the sentence into a NESTED constituent tree using the five basic "
    "sentence patterns (SV / SVC / SVO / SVOO / SVOC).\n\n"
    "Return ONLY a JSON object for the top node, where each node is:\n"
    '{ "text", "role", "type", "label", "pattern"(clause only), "children"(phrase/clause only) }\n\n'
    "role in [ROOT,S,V,O,IO,DO,SC,OC,HEAD,DET,MOD,PREP,ADV,ADJ,CONJ,MARK,PUNCT]\n"
    "type in [word, phrase, clause]\n"
    "pattern in [SV, SVC, SVO, SVOO, SVOC]\n"
    f"label in [{_STRUCTURE_LABELS}]\n\n"
    "Rules:\n"
    "1. Concatenating every LEAF node's \"text\" left-to-right MUST reproduce the "
    "sentence verbatim (same words, same order, keep quotes/punctuation).\n"
    "2. The top node is role=ROOT, type=clause, label=主要子句, with its pattern.\n"
    "3. EVERY clause (main or subordinate) gets its own \"pattern\" and is broken "
    "into its S/V/O/IO/DO/SC/OC constituents.\n"
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
    "each item, conjunction, and punctuation. Do not flatten a long phrase into one node.\n"
    "6. Inside a phrase use role=HEAD for its lexical head, DET for a determiner, "
    "PREP for a preposition, ADJ/ADV for adjective/adverb modifiers, MOD for another "
    "modifier, and CONJ for coordinated material. Label word leaves by their part of "
    "speech (名詞/代名詞/限定詞/形容詞/副詞/介系詞/連接詞/助動詞), except a clause's "
    "direct S/V/O/C word may use its grammatical-function label. A prepositional "
    "phrase is label=介系詞片語 and role=ADJ when modifying a noun or role=ADV when "
    "modifying a verb, adjective, or whole clause.\n"
    "7. Coordinated items use role=CONJ; the subordinator (that/which/because...) "
    "is a MARK/引導詞 word inside its clause.\n"
    "8. Reproduce EVERY word of the sentence exactly once, verbatim — never drop, "
    "merge away, or paraphrase a word. This applies to ALL words WITHOUT EXCEPTION, "
    "especially easily-omitted function words: ANY adverb, ANY auxiliary/modal and "
    "the COMPLETE verb group (e.g. 'will be', 'has been', 'is being', 'would have "
    "been'), particles, articles, prepositions, and conjunctions.\n"
    "9. Do not absorb a trailing adjunct into S/O/SC/OC. For example a comma + 'with "
    "...' supplement that modifies the whole clause must be separate top-level PUNCT "
    "and ADV children, while the core S/V/O/C span remains precise.\n"
    "Return JSON only. No markdown, no commentary.\n\n"
    "Sentence: "
)

# Appended when a retry is needed: the model's previous answer failed the
# verbatim-reconstruction check, so restate that constraint forcefully.
_STRUCTURE_RETRY_HINT = (
    "\n\nYour previous answer was REJECTED because it was either insufficiently "
    "nested or its leaf texts did not exactly reproduce the sentence. Re-analyze "
    "with children on every clause and every phrase of 3 or more words. Short phrases "
    "of at most 2 words may remain leaves. Ensure every original word appears exactly "
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
    text = text.translate(_PUNCT_VARIANTS).replace("…", "...")
    return re.sub(r"\s+", "", text).casefold()


def _reconstructs_sentence(structure: dict, sentence: str) -> bool:
    """True when the leaf texts reproduce the sentence.

    Whitespace, letter case, and quote/dash style are normalized away on both
    sides so the check tolerates cosmetic choices while still catching dropped,
    added, or reordered words."""
    return _normalize_for_compare("".join(_leaf_texts(structure))) == _normalize_for_compare(sentence)


_LEXICAL_TOKEN = re.compile(r"[A-Za-z0-9]+(?:[-'’][A-Za-z0-9]+)*")


def _lexical_token_count(text: str) -> int:
    return len(_LEXICAL_TOKEN.findall(text))


def _phrase_word_node(token: dict[str, str | bool]) -> dict:
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
    elif pos == "ADP":
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

    if bool(token["is_root"]) and role != "PUNCT":
        role = "HEAD"

    return {"text": text, "role": role, "type": "word", "label": label}


def _expand_long_phrase_leaves(node: dict) -> None:
    """Locally expand long phrase leaves when Gemini leaves `children` empty.

    Gemini still supplies the pedagogically important clause hierarchy and
    S/V/O/C roles. spaCy only fills the missing word-level detail, preventing a
    usable whole-sentence analysis from failing because one phrase stayed flat.
    """
    children = node.get("children")
    if node.get("type") == "phrase" and not children:
        if _lexical_token_count(node["text"]) >= 3:
            token_nodes = [_phrase_word_node(token) for token in analyze_tokens(node["text"])]
            if token_nodes:
                node["children"] = token_nodes
        return

    for child in children or []:
        _expand_long_phrase_leaves(child)


def _detail_issue(node: dict, path: str = "ROOT") -> str | None:
    """Return the first nesting issue with its tree path, or None when valid."""
    children = node.get("children")
    node_type = node.get("type")

    # Word nodes are always leaves. Compact phrases may also remain leaves, but
    # longer phrases and all clauses must be expandable.
    if node_type == "word":
        return f"{path}: word node has children" if children else None
    if node_type == "phrase" and not children:
        word_count = _lexical_token_count(node["text"])
        if 1 <= word_count <= 2:
            return None
        return f"{path}: unexpanded phrase has {word_count} lexical words"
    if node_type != "clause" and node_type != "phrase":
        return f"{path}: unsupported node type {node_type!r}"
    if not children:
        return f"{path}: {node_type} node has no children"

    # Each node must describe the exact surface span covered by its direct
    # children, not merely rely on the root-level reconstruction check.
    child_text = "".join(child["text"] for child in children)
    if _normalize_for_compare(child_text) != _normalize_for_compare(node["text"]):
        return f"{path}: node text does not match its direct children"

    for index, child in enumerate(children):
        issue = _detail_issue(child, f"{path}.{index}")
        if issue:
            return issue
    return None


def _is_detailed_tree(node: dict) -> bool:
    """Validate nesting semantics that Pydantic's recursive shape cannot express."""
    return _detail_issue(node) is None


# Attempts for a single analysis: the first at temperature 0 (deterministic), then
# retries with a corrective hint and a nonzero temperature so the model can
# actually produce a *different*, fixed answer instead of repeating the reject.
_STRUCTURE_ATTEMPTS = 3
_STRUCTURE_RETRY_TEMPERATURE = 0.4
_STRUCTURE_THINKING_BUDGET = 1024


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

    Returns (structure_dict, usage). Raises HTTPException(502) when the model
    output is unusable (invalid schema or does not reconstruct the sentence)
    after the retries — the caller surfaces that so the UI can offer a retry."""
    # Imported here to avoid a circular import (models has no service deps).
    from app.models.parse import StructureNode

    usage = {"prompt_tokens": 0, "response_tokens": 0, "total_tokens": 0}
    last_error: HTTPException | None = None

    for attempt in range(_STRUCTURE_ATTEMPTS):
        contents = _STRUCTURE_PROMPT + sentence
        temperature = 0.0
        if attempt:
            contents += _STRUCTURE_RETRY_HINT
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
                    "response_json_schema": StructureNode.model_json_schema(),
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
        _expand_long_phrase_leaves(structure)
        if not _reconstructs_sentence(structure, sentence):
            last_error = HTTPException(
                status_code=502,
                detail="Gemini structure analysis did not reproduce the sentence.",
            )
            continue
        detail_issue = _detail_issue(structure)
        if detail_issue:
            last_error = HTTPException(
                status_code=502,
                detail=(
                    "Gemini structure analysis was not sufficiently nested: "
                    f"{detail_issue}."
                ),
            )
            continue

        return structure, usage

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
