from dotenv import load_dotenv
from google import genai
from google.genai import types
import os
from fastapi import HTTPException
import json
from app.models.vocab import VocabOptions
from app.core.config import settings

# Initialize Gemini client with the configured API key.
client = genai.Client(api_key=settings.gemini_api_key)

# Translate a list of sentences using Gemini and return aligned results.
def ai_translate_list(sentences: list[str], target_lang: str = "zh-TW", mode: str = "normal") -> list[str]:
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
                "response_mime_type": "application/json"
            }
        )
        text = response.text.strip()
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini API request failed: {e}"
        )
    
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
    return fixed

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
def ai_lookup_word(selected_text: str, sentence: str, options: VocabOptions) -> dict:
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
- lemma: base form of "{selected_text}" (e.g. "running" → "run")
- pos: part of speech in this context (use one of: noun, pronoun, proper noun, verb, adjective, adverb, preposition, conjunction, auxiliary, phrase, interjection; if none apply use "unknown")

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
            "temperature": 0.2
        }
    )
    return json.loads(response.text)
