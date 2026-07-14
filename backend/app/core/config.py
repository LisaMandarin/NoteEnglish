import os
from pathlib import Path
from dotenv import load_dotenv

# Load backend/.env explicitly so config works regardless of the current working directory.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def _parse_origins(value: str) -> list[str]:
    return [origin.strip() for origin in value.split(",") if origin.strip()]


class Settings:
    # Basic app metadata.
    app_title: str = "句句通 API"
    app_version: str = "0.1.0"

    # CORS: allowed frontend origins. Accepts a comma-separated list for deployment.
    frontend_origins = _parse_origins(
        os.getenv("FRONTEND_ORIGINS", os.getenv("FRONTEND_ORIGIN", "http://localhost:5173"))
    )

    # Gemini API configuration. Structure analysis (/api/parse) keeps the
    # stronger model; translation/vocab/OCR/quiz run on the cheaper flash-lite.
    gemini_api_key = os.getenv("GEMINI_API_KEY", "")
    gemini_basic_model = os.getenv("GEMINI_BASIC_MODEL", "gemini-3.1-flash-lite")
    gemini_adv_model = os.getenv("GEMINI_ADV_MODEL", "gemini-2.5-flash")

    # Text-to-speech voice used by edge-tts for the /api/tts route.
    tts_voice = os.getenv("TTS_VOICE", "en-US-JennyNeural")

    # Supabase configuration for authenticated session/profile APIs.
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY", "")
    supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    # SMTP configuration for the 問題回報 (issue report) mailer.
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    issue_report_recipient = os.getenv("ISSUE_REPORT_RECIPIENT", "lisa_chuang@mail2000.com.tw")

# Singleton settings instance used across the app.
settings = Settings()
