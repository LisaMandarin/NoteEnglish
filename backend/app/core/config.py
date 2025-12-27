import os
from dotenv import load_dotenv

load_dotenv()
class Settings:
    app_title: str = "NoteEnglish API"
    app_version: str = "0.1.0"

    #cors
    frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

    #gemini
    gemini_api_key = os.getenv("GEMINI_API_KEY", "")
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

settings = Settings()