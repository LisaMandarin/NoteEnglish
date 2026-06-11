from pydantic import BaseModel, Field

# Request payload for extracting text from an image.
class OcrRequest(BaseModel):
    image_base64: str = Field(description="Base64-encoded image data without the data: URL prefix")
    mime_type: str = Field(
        default="image/jpeg",
        description="MIME type of the image",
        examples=["image/jpeg", "image/png", "image/webp"],
    )

# Response wrapper for OCR requests.
class OcrResponse(BaseModel):
    text: str = Field(description="Text extracted from the image; empty if no readable text")
