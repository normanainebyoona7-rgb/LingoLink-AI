from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from deep_translator import GoogleTranslator
from app.database import get_db
import app.models as models
import app.schemas as schemas

router = APIRouter(prefix="/translate", tags=["translation"])

@router.post("/text")
async def translate_text(
    request: schemas.TranslationRequest,
    db: Session = Depends(get_db)
):
    try:
        translator = GoogleTranslator(
            source=request.source_language,
            target=request.target_language
        )
        translated = translator.translate(request.text)

        db_translation = models.Translation(
            user_id=request.user_id,
            source_text=request.text,
            translated_text=translated,
            source_language=request.source_language,
            target_language=request.target_language,
            translation_type="text"
        )
        db.add(db_translation)
        db.commit()
        db.refresh(db_translation)

        return {
            "id": db_translation.id,
            "translated_text": translated,
            "source_language": request.source_language,
            "target_language": request.target_language
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))