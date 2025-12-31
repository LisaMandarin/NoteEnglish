import os
from dotenv import load_dotenv

# Load environment variables from .env if present.
load_dotenv()

class Settings:
    # Basic app metadata.
    app_title: str = "NoteEnglish API"
    app_version: str = "0.1.0"

    # CORS: allowed frontend origin.
    frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

    # Gemini API configuration.
    gemini_api_key = os.getenv("GEMINI_API_KEY", "")
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Singleton settings instance used across the app.
settings = Settings()
