from dotenv import load_dotenv
from google import genai
from google.genai import types
import os
import re
from fastapi import HTTPException
import json
from app.models.vocab import VocabOptions
from app.core.config import settings

# Initialize Gemini client with the configured API key.
client = genai.Client(api_key=settings.gemini_api_key)

# Translate a list of sentences using Gemini and return aligned results.
def _extract_usage(response) -> dict:
    meta = getattr(response, "usage_metadata", None)
    if meta is None:
        return {"prompt_tokens": 0, "response_tokens": 0, "total_tokens": 0}
    return {
        "prompt_tokens": getattr(meta, "prompt_token_count", 0) or 0,
        "response_tokens": getattr(meta, "candidates_token_count", 0) or 0,
        "total_tokens": getattr(meta, "total_token_count", 0) or 0,
    }


def ai_translate_list(sentences: list[str], target_lang: str = "zh-TW", mode: str = "normal") -> tuple[list[str], dict]:
    if not sentences:
        return []
    
    # Adjust prompt style based on mode.
    style_hint = (
        "Use natural, fluent translation."
        if mode == "normal"
        else
        "Translate for language learners.  Keep sentence structure clear and explicit. "
        "Avoid omitting subjects or connectors."
    )

    # Build prompt with numbered sentences to keep order.
    prompt = (
        f"Translate each sentence into {target_lang}. "
        f"{style_hint}"
        "Return ONLY a JSON array of strings. "
        "The array length and order MUST match the input. "
        "No explanation, no markdown.\n\n"
        )
    
    for i, s in enumerate(sentences):
        prompt += f"{i}. {s}\n"

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
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

    usage = _extract_usage(response)

    # Parse JSON array from model output.
    try:
        translations = json.loads(text)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to parse Gemini output as JSON.  Error: {e}.  Output preview: {text[:300]}"
        )

    if not isinstance(translations, list):
        raise HTTPException(
            status_code=502,
            detail="Gemini output is not a JSON array."
        )

    # Ensure output list matches input length.
    fixed = []
    for i in range(len(sentences)):
        fixed.append(translations[i] if i < len(translations) else "")
    return fixed, usage

# Collapse hard line wraps from print layouts: join single newlines within a
# paragraph into spaces, keep blank lines as paragraph breaks, and rejoin
# words hyphenated across lines. The OCR prompt asks Gemini to do this, but
# the model does not reliably comply, so normalize deterministically.
def _normalize_ocr_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
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

def normalize_pos(raw: str) -> str:
    return _POS_MAP.get(raw.strip().lower(), "?")

# Ask Gemini to identify lemma/pos from sentence context and fill requested vocab fields.
def ai_lookup_word(selected_text: str, sentence: str, options: VocabOptions) -> tuple[dict, dict]:
    tasks = []
    if options.translation:
        tasks.append("translation: Traditional Chinese (zh-TW) meaning of this word in context.")
    if options.definition:
        tasks.append("definition: Brief English definition (10 words or fewer).")
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
- Definition must be English only, 10 words or fewer.
- Example must be ONE sentence.
- Level must be one of: A1, A2, B1, B2, C1, C2.
- Return ONLY valid JSON.
"""

    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "temperature": 0.2,
            "thinking_config": {"thinking_budget": 0},
        }
    )
    return json.loads(response.text), _extract_usage(response)
