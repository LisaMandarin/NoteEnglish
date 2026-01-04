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

# JSON schema describing expected vocab fields from the model.
VOCAB_SCHEMA = {
    "type": "object",
    "properties": {
        "translation": {"type": "string"},
        "definition": {"type": "string"},
        "example": {"type": "string"},
        "level": {"type": "string"}
    },
    "required": ["translation", "definition", "example", "level"]
}

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

# Ask Gemini to fill in vocab fields based on request options.
def ai_fill_vocab_fields(lemma:str, pos:str, options:VocabOptions) -> dict:
    tasks = []
    
    if options.translation:
        tasks.append("translation: Chinese meaning of the word.")
    if options.definition:
        tasks.append("definition: ONE clear English definition")
    if options.example:
        tasks.append("example: One natural example sentence.")
    if options.example:
        tasks.append("level: CEFR level (A1-C2).")
    task_list = "\n".join(f"- {t}" for t in tasks) if tasks else "- None"
    prompt = f"""
You are an English dictionary for intermediate to advanced learners.
    
Word: "{lemma}"
Part of speech: {pos}

You MUST return a JSON object with EXACTLY these keys:
- translation
- definition
- example
- level

Tasks to fill:
{task_list}

Rules:
- Use ONLY the given part of speech.
- If a field is NOT listed in "Tasks to fill", return an empty string "" for that field.
- Definition must be English onlyl.
- Translation must be Traditional Chinese (zh-TW).
- Example must be ONE sentence.
- Level must be one of :A1, A2, B1, B2, C1, C2.
- Do NOT add extra text.
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
