from fastapi import FastAPI
from app.routes.test import router as test_router
from app.routes.translate import router as translate_router
from app.routes.vocab import router as vocab_router
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

app = FastAPI(title="NoteEnglish API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(test_router, prefix="/api")
app.include_router(translate_router, prefix="/api")
app.include_router(vocab_router, prefix="/api")
