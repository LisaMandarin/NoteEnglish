from pydantic import BaseModel, Field

# Request payload for synthesizing speech from text.
class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1200, description="English text to synthesize")
