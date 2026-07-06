import logging

from fastapi import FastAPI
from app.routes.translate import router as translate_router
from app.routes.vocab import router as vocab_router
from app.routes.session import router as session_router
from app.routes.profile import router as profile_router
from app.routes.test import router as test_router
from app.routes.usage import router as usage_router
from app.routes.admin import router as admin_router
from app.routes.ocr import router as ocr_router
from app.routes.parse import router as parse_router
from app.routes.issue_report import router as issue_report_router
from app.routes.tts import router as tts_router
from app.core.config import settings
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

# Create the FastAPI application with metadata from settings.
app = FastAPI(title=settings.app_title, version=settings.app_version)

# CORS config to allow requests from the frontend origin during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Register routers under the shared /api prefix.
app.include_router(translate_router, prefix="/api")
app.include_router(vocab_router, prefix="/api")
app.include_router(session_router, prefix="/api")
app.include_router(profile_router, prefix="/api")
app.include_router(test_router, prefix="/api")
app.include_router(usage_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(ocr_router, prefix="/api")
app.include_router(parse_router, prefix="/api")
app.include_router(issue_report_router, prefix="/api")
app.include_router(tts_router, prefix="/api")
