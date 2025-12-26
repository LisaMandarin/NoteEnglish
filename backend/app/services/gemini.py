from dotenv import load_dotenv
from google import genai
import os
from fastapi import FastAPI, HTTPException
import json
from app.models.vocab import VocabOptions

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY", "")
model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
client = genai.Client(api_key=api_key)

def ai_translate_list(sentences: list[str], target_lang: str = "zh-TW", mode: str = "normal") -> list[str]:
    if not sentences:
        return []
    
    style_hint = (
        "Use natural, fluent translation."
        if mode == "normal"
        else
        "Translate for language learners.  Keep sentence structure clear and explicit. "
        "Avoid omitting subjects or connectors."
    )

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
            model=model,
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
    
    fixed = []
    for i in range(len(sentences)):
        fixed.append(translations[i] if i < len(translations) else "")
    return fixed

def ai_fill_vocab_fields(lemma:str, pos:str, options:VocabOptions) -> dict:
    keys = []
    if options.translation:
        keys.append("translation")
    if options.definition:
        keys.append("definition")
    if options.example:
        keys.append("example")
    if options.level:
        keys.append("level")
    prompt = f"""
You are an English dictionary for intermediate to advanced learners.
    
Word: "{lemma}"
Part of speech: {pos}

Return ONLY valid JSON object.
Allowed keys: {keys}
Do NOT include keys other than the allowed keys.
Do NOT include "word" or "pos".

Requirements:
- translation: concise Traditional Chinese meaning
- definition: ONE clear English definition
- example: ONE natural example sentence
- level: CEFR level A2-C1 (string)
"""
    
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config={"response_mime_type": "application/json"}
    )
    
    return json.loads(response.text)
