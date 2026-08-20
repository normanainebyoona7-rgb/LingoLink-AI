from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from sqlalchemy.orm import Session
from deep_translator import GoogleTranslator
from langdetect import detect
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models
import app.schemas as schemas

router = APIRouter(prefix="/translate", tags=["translation"])

LANGUAGES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "sw": "Swahili",
    "lg": "Luganda",
    "ar": "Arabic",
    "ru": "Russian",
    "hi": "Hindi",
    "nl": "Dutch",
    "pl": "Polish",
    "tr": "Turkish",
    "vi": "Vietnamese",
    "th": "Thai",
    "id": "Indonesian",
    "ms": "Malay",
    "fa": "Persian",
    "he": "Hebrew",
    "el": "Greek",
    "cs": "Czech",
    "ro": "Romanian",
    "hu": "Hungarian",
    "sv": "Swedish",
    "no": "Norwegian",
    "da": "Danish",
    "fi": "Finnish",
    "uk": "Ukrainian",
    "am": "Amharic",
    "ha": "Hausa",
    "yo": "Yoruba",
    "ig": "Igbo",
    "zu": "Zulu",
    "xh": "Xhosa",
    "af": "Afrikaans"
}

@router.get("/languages")
async def get_languages():
    return {"languages": LANGUAGES}

@router.post("/detect")
async def detect_language(request: schemas.TranslationRequest):
    try:
        detected = detect(request.text)
        return {
            "detected_language": detected,
            "language_name": LANGUAGES.get(detected, detected)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/text")
async def translate_text(
    request: schemas.TranslationRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        # Check daily limit for free users
        today = datetime.utcnow().date()
        
        if current_user.last_translation_date is None or current_user.last_translation_date.date() != today:
            current_user.daily_translation_count = 0
            current_user.last_translation_date = datetime.utcnow()
        
        if not current_user.is_premium and current_user.daily_translation_count >= 10:
            raise HTTPException(
                status_code=403,
                detail="Daily free limit reached (10 translations). Upgrade to premium for unlimited."
            )
        
        current_user.daily_translation_count += 1
        db.commit()

        source_lang = request.source_language
        if source_lang == "auto":
            source_lang = detect(request.text)

        translator = GoogleTranslator(
            source=source_lang,
            target=request.target_language
        )
        translated = translator.translate(request.text)

        db_translation = models.Translation(
            user_id=current_user.id,
            source_text=request.text,
            translated_text=translated,
            source_language=source_lang,
            target_language=request.target_language,
            translation_type="text"
        )
        db.add(db_translation)
        db.commit()
        db.refresh(db_translation)

        return {
            "id": db_translation.id,
            "translated_text": translated,
            "source_language": source_lang,
            "target_language": request.target_language,
            "username": current_user.username,
            "is_premium": current_user.is_premium,
            "daily_count": current_user.daily_translation_count
        }
    except HTTPException:
        raise
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