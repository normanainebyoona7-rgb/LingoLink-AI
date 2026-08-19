from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from deep_translator import GoogleTranslator
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models
import app.schemas as schemas

router = APIRouter(prefix="/translate", tags=["translation"])

@router.post("/text")
async def translate_text(
    request: schemas.TranslationRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        translator = GoogleTranslator(
            source=request.source_language,
            target=request.target_language
        )
        translated = translator.translate(request.text)

        db_translation = models.Translation(
            user_id=current_user.id,
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
            "target_language": request.target_language,
            "username": current_user.username
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history")
async def get_translation_history(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    translations = db.query(models.Translation).filter(
        models.Translation.user_id == current_user.id
    ).order_by(models.Translation.created_at.desc()).all()

    return [
        {
            "id": t.id,
            "source_text": t.source_text,
            "translated_text": t.translated_text,
            "source_language": t.source_language,
            "target_language": t.target_language,
            "translation_type": t.translation_type,
            "created_at": t.created_at
        }
        for t in translations
    ]

@router.delete("/{translation_id}")
async def delete_translation(
    translation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    translation = db.query(models.Translation).filter(
        models.Translation.id == translation_id,
        models.Translation.user_id == current_user.id
    ).first()

    if not translation:
        raise HTTPException(status_code=404, detail="Translation not found")

    db.delete(translation)
    db.commit()

    return {"message": "Translation deleted successfully"}