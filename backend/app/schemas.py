from pydantic import BaseModel
from typing import Optional

class TranslationRequest(BaseModel):
    text: str
    source_language: str
    target_language: str
    user_id: int = 1

class TranslationResponse(BaseModel):
    id: int
    translated_text: str
    source_language: str
    target_language: str