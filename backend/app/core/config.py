import os
from pathlib import Path
from dotenv import load_dotenv

# Load backend/.env explicitly so config works regardless of the current working directory.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

class Settings:
    # Basic app metadata.
    app_title: str = "NoteEnglish API"
    app_version: str = "0.1.0"

    # CORS: allowed frontend origin.
    frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

    # Gemini API configuration.
    gemini_api_key = os.getenv("GEMINI_API_KEY", "")
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    # Supabase configuration for authenticated session/profile APIs.
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY", "")
    supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Singleton settings instance used across the app.
settings = Settings()
