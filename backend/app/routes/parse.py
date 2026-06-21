from fastapi import APIRouter, Depends

from app.models.parse import ParseRequest, ParseResponse
from app.services.nlp import parse_dependencies
from app.core.auth import require_user

router = APIRouter(tags=["parse"])


# Dependency-parse a single sentence with spaCy (local, deterministic, no AI cost).
@router.post("/parse", response_model=ParseResponse)
def parse(req: ParseRequest, _user: dict = Depends(require_user)):
    return ParseResponse(tokens=parse_dependencies(req.sentence))
