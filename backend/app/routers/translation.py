from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from sqlalchemy.orm import Session
import requests
import os
import re
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models
import app.schemas as schemas
from dotenv import load_dotenv
from app.fast_translate import fast_translate, google_translate, mymemory_translate

load_dotenv()

router = APIRouter(prefix="/translate", tags=["translation"])

_cache = {}
CACHE_LIMIT = 1000

LANGUAGES = {
    "english": "English", "french": "French", "spanish": "Spanish", "german": "German",
    "portuguese": "Portuguese", "italian": "Italian", "dutch": "Dutch", "russian": "Russian",
    "arabic": "Arabic", "hindi": "Hindi", "chinese": "Chinese", "japanese": "Japanese",
    "korean": "Korean", "turkish": "Turkish", "vietnamese": "Vietnamese", "thai": "Thai",
    "indonesian": "Indonesian", "hebrew": "Hebrew", "greek": "Greek",
    "polish": "Polish", "swedish": "Swedish", "danish": "Danish", "finnish": "Finnish",
    "norwegian": "Norwegian", "czech": "Czech", "romanian": "Romanian",
    "hungarian": "Hungarian", "ukrainian": "Ukrainian", "persian": "Persian",
    "urdu": "Urdu", "bengali": "Bengali", "tamil": "Tamil", "telugu": "Telugu",
    "marathi": "Marathi", "gujarati": "Gujarati", "kannada": "Kannada",
    "malayalam": "Malayalam", "punjabi": "Punjabi", "nepali": "Nepali",
    "sinhala": "Sinhala", "khmer": "Khmer", "lao": "Lao", "burmese": "Burmese",
    "malay": "Malay", "tagalog": "Tagalog", "bulgarian": "Bulgarian",
    "croatian": "Croatian", "serbian": "Serbian", "slovak": "Slovak",
    "slovenian": "Slovenian", "estonian": "Estonian", "latvian": "Latvian",
    "lithuanian": "Lithuanian", "icelandic": "Icelandic", "irish": "Irish",
    "welsh": "Welsh", "catalan": "Catalan", "basque": "Basque",
    "galician": "Galician", "maltese": "Maltese", "albanian": "Albanian",
    "macedonian": "Macedonian", "bosnian": "Bosnian", "belarusian": "Belarusian",
    "georgian": "Georgian", "armenian": "Armenian", "azerbaijani": "Azerbaijani",
    "kazakh": "Kazakh", "uzbek": "Uzbek", "mongolian": "Mongolian",
    "luganda": "Luganda", "rukiga": "Rukiga", "runyankole": "Runyankole",
    "runyankore": "Runyankore", "acholi": "Acholi", "alur": "Alur",
    "ateso": "Ateso", "lango": "Lango", "lugbara": "Lugbara",
    "lusoga": "Lusoga", "lugwere": "Lugwere",
    "swahili": "Swahili", "kinyarwanda": "Kinyarwanda", "kirundi": "Kirundi",
    "amharic": "Amharic", "somali": "Somali", "oromo": "Oromo", "tigrinya": "Tigrinya",
    "kikuyu": "Kikuyu", "dholuo": "Dholuo",
    "yoruba": "Yoruba", "hausa": "Hausa", "igbo": "Igbo", "fulfulde": "Fulfulde",
    "wolof": "Wolof", "bambara": "Bambara", "twi": "Twi", "ewe": "Ewe",
    "lingala": "Lingala", "kikongo": "Kikongo", "bemba": "Bemba",
    "zulu": "Zulu", "xhosa": "Xhosa", "afrikaans": "Afrikaans",
    "sesotho": "Sesotho", "setswana": "Setswana",
}

CODES = {
    "english": "en", "french": "fr", "spanish": "es", "german": "de",
    "portuguese": "pt", "italian": "it", "dutch": "nl", "russian": "ru",
    "arabic": "ar", "hindi": "hi", "chinese": "zh", "japanese": "ja",
    "korean": "ko", "turkish": "tr", "vietnamese": "vi", "thai": "th",
    "indonesian": "id", "hebrew": "he", "greek": "el",
    "polish": "pl", "swedish": "sv", "danish": "da", "finnish": "fi",
    "norwegian": "no", "czech": "cs", "romanian": "ro",
    "hungarian": "hu", "ukrainian": "uk", "persian": "fa",
    "swahili": "sw", "luganda": "lg", "kinyarwanda": "rw", "kirundi": "rn",
    "amharic": "am", "somali": "so", "yoruba": "yo", "hausa": "ha",
    "igbo": "ig", "shona": "sn", "chichewa": "ny", "afrikaans": "af",
    "zulu": "zu", "xhosa": "xh", "sesotho": "st", "setswana": "tn",
    "rukiga": "cgg", "runyankole": "nyn", "runyankore": "nyn",
    "acholi": "ach", "alur": "alz", "ateso": "teo",
    "lango": "laj", "lugbara": "lgg",
    "lusoga": "xog", "lugwere": "gwr", "dholuo": "luo",
}

CODE_TO_LANG = {v: k for k, v in CODES.items()}


def get_cached(key):
    return _cache.get(key)


def set_cache(key, value):
    if len(_cache) >= CACHE_LIMIT:
        _cache.clear()
    _cache[key] = value


def normalize_language(lang: str) -> str:
    lang = lang.lower().strip()
    if lang in LANGUAGES:
        return lang
    if lang in CODES:
        return CODE_TO_LANG.get(lang, lang)
    if lang in CODE_TO_LANG:
        return CODE_TO_LANG[lang]
    for name in LANGUAGES:
        if name.startswith(lang) or lang.startswith(name):
            return name
    return lang


def clean_translation(text: str) -> str:
    text = re.sub(r'\s+', ' ', text).strip()
    text = text.strip('"').strip("'").strip()
    return text


@router.get("/languages")
async def get_languages():
    return {"languages": LANGUAGES}


@router.get("/detect")
async def detect_language_endpoint(text: str):
    """Auto-detect language - basic English default"""
    return {"detected_language": "english", "confidence": 0.5}


@router.post("/quick")
async def quick_translate(
    request: schemas.TranslationRequest,
    current_user: models.User = Depends(get_current_user)
):
    """Fast translation for live typing - Google only, no DB save"""
    source_lang = normalize_language(request.source_language)
    target_lang = normalize_language(request.target_language)
    result = google_translate(request.text, target_lang, source_lang)
    if not result:
        result = mymemory_translate(request.text, target_lang, source_lang)
    return {
        "translated_text": result or request.text,
        "source_language": source_lang,
        "target_language": target_lang,
        "provider": "quick",
        "success": result is not None
    }


@router.post("/text")
async def translate_text(
    request: schemas.TranslationRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        today = datetime.utcnow().date()
        if current_user.last_translation_date is None or current_user.last_translation_date.date() != today:
            current_user.daily_translation_count = 0
            current_user.last_translation_date = datetime.utcnow()
        if not current_user.is_premium and current_user.daily_translation_count >= 100:
            raise HTTPException(status_code=403, detail="Daily limit reached.")
        current_user.daily_translation_count += 1
        db.commit()

        source_lang = normalize_language(request.source_language)
        if source_lang == "auto" or source_lang not in LANGUAGES:
            source_lang = "english"

        target_lang = normalize_language(request.target_language)

        if source_lang == target_lang:
            return {
                "translated_text": request.text,
                "source_language": source_lang,
                "target_language": target_lang,
                "provider": "same_language",
                "success": True
            }

        result = fast_translate(request.text, target_lang, source_lang)

        if not result:
            result = request.text

        # Save to DB
        try:
            db_translation = models.Translation(
                user_id=current_user.id,
                source_text=request.text,
                translated_text=result,
                source_language=source_lang,
                target_language=target_lang,
                translation_type="text"
            )
            db.add(db_translation)
            db.commit()
        except Exception as e:
            print(f"DB save error: {e}")
            db.rollback()

        return {
            "translated_text": result,
            "source_language": source_lang,
            "target_language": target_lang,
            "provider": "multi",
            "success": result != request.text
        }
    except HTTPException:
        raise
    except Exception as e:
        try:
            db.rollback()
        except:
            pass
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_translation_history(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    translations = db.query(models.Translation).filter(
        models.Translation.user_id == current_user.id
    ).order_by(models.Translation.created_at.desc()).limit(50).all()

    return [{
        "id": t.id,
        "source_text": t.source_text,
        "translated_text": t.translated_text,
        "source_language": t.source_language,
        "target_language": t.target_language,
        "created_at": t.created_at
    } for t in translations]


@router.delete("/{translation_id}")
async def delete_translation(translation_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    translation = db.query(models.Translation).filter(
        models.Translation.id == translation_id,
        models.Translation.user_id == current_user.id
    ).first()
    if not translation:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(translation)
    db.commit()
    return {"message": "Deleted"}


@router.get("/providers")
async def get_providers():
    return {
        "providers": {
            "google": True,
            "mymemory": True,
            "sunbird": bool(os.getenv("SUNBIRD_API_KEY", "")),
            "groq": bool(os.getenv("GROQ_API_KEY", "")),
            "local_dictionary": True,
        }
    }