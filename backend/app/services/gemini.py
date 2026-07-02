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

# spaCy's English dependency labels (dep_), given to the model so its output maps
# straight onto the existing CAT/DEP tables the frontend already understands.
_DEP_LABELS = frozenset({
    "ROOT",
    "nsubj",
    "nsubjpass",
    "csubj",
    "expl",
    "aux",
    "auxpass",
    "cop",
    "attr",
    "acomp",
    "dobj",
    "dative",
    "oprd",
    "ccomp",
    "xcomp",
    "pcomp",
    "prep",
    "pobj",
    "agent",
    "case",
    "det",
    "amod",
    "advmod",
    "nummod",
    "npadvmod",
    "poss",
    "compound",
    "neg",
    "mark",
    "advcl",
    "acl",
    "relcl",
    "appos",
    "prt",
    "punct",
    "cc",
    "conj",
    "preconj",
})


def _validate_dependency_tree(tokens: list[dict]) -> None:
    """Require one rooted, connected, acyclic dependency tree."""
    roots = [i for i, token in enumerate(tokens) if token["dep"] == "ROOT"]
    if len(roots) != 1:
        raise HTTPException(
            status_code=502,
            detail="Gemini reparse: must have exactly one ROOT.",
        )

    root = roots[0]
    if tokens[root]["head"] != root:
        raise HTTPException(
            status_code=502,
            detail="Gemini reparse: ROOT must point to itself.",
        )

    for start, token in enumerate(tokens):
        if start != root and token["head"] == start:
            raise HTTPException(
                status_code=502,
                detail="Gemini reparse: non-ROOT token points to itself.",
            )

        current = start
        visited: set[int] = set()
        while current != root:
            if current in visited:
                raise HTTPException(
                    status_code=502,
                    detail="Gemini reparse: dependency cycle detected.",
                )
            visited.add(current)
            current = tokens[current]["head"]


def ai_reparse_dependencies(tokens: list[dict]) -> tuple[list[dict], dict]:
    """Re-assign dep + head for an already-tokenized sentence using Gemini.

    Used as a fallback when spaCy's local (en_core_web_sm) parse looks unreliable.
    Tokenization stays fixed — the model only fills in the relations — so token
    alignment is safe. Returns corrected {text, dep, head} tokens (text preserved
    from the input, never the model's echo) plus usage. Raises HTTPException(502)
    if the model output is unusable, so the caller can keep the spaCy result."""
    n = len(tokens)
    items = [{"i": i, "text": t["text"]} for i, t in enumerate(tokens)]
    input_json = json.dumps(items, ensure_ascii=False)
    dep_labels = ", ".join(sorted(_DEP_LABELS))

    prompt = (
        "You are a dependency parser using spaCy's English label set. "
        "Below is a sentence already split into tokens (do not re-tokenize). "
        "For EACH token return its syntactic head and dependency relation.\n\n"
        "Rules:\n"
        f"- dep MUST be one of: {dep_labels}.\n"
        "- head is the 0-based index ('i') of the token's governing word.\n"
        "- Exactly one token is the main verb: its dep is \"ROOT\" and its head equals its own index.\n"
        "- Every other token's head must point toward the ROOT (the result is a tree).\n"
        "- Pick the finite main verb as ROOT, not an adjective/noun complement of it.\n\n"
        "Return ONLY a JSON array, same length and order as the input, each element "
        '{"i": <int>, "dep": <string>, "head": <int>}. No markdown, no explanation.\n\n'
        f"Tokens:\n{input_json}"
    )

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "temperature": 0,
                "thinking_config": {"thinking_budget": 0},
            },
        )
        data = json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini reparse failed: {e}")

    usage = _extract_usage(response)

    if not isinstance(data, list) or len(data) != n:
        raise HTTPException(status_code=502, detail="Gemini reparse: wrong length or shape.")

    # Map by reported index so a reordered response still aligns; require full cover.
    by_index: dict[int, dict] = {}
    for item in data:
        if not isinstance(item, dict) or type(item.get("i")) is not int:
            raise HTTPException(status_code=502, detail="Gemini reparse: malformed element.")
        by_index[item["i"]] = item
    if set(by_index) != set(range(n)):
        raise HTTPException(status_code=502, detail="Gemini reparse: indices do not cover all tokens.")

    corrected: list[dict] = []
    for i in range(n):
        item = by_index[i]
        dep = item.get("dep")
        head = item.get("head")
        if not isinstance(dep, str) or type(head) is not int or not (0 <= head < n):
            raise HTTPException(status_code=502, detail="Gemini reparse: bad dep/head value.")
        if dep not in _DEP_LABELS:
            raise HTTPException(
                status_code=502,
                detail=f"Gemini reparse: unsupported dependency label {dep!r}.",
            )
        # Keep the original surface text + pos; only the relations come from the model.
        corrected.append(
            {"text": tokens[i]["text"], "dep": dep, "head": head, "pos": tokens[i].get("pos")}
        )

    _validate_dependency_tree(corrected)

    return corrected, usage


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
