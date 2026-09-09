from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from sqlalchemy.orm import Session
import requests
import os
import json
import re
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models
import app.schemas as schemas
from dotenv import load_dotenv
from app.fast_translate import fast_translate
from app.dictionary import lookup_word

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
    "luganda": "Luganda", "rukiga": "Rukiga", "runyankole": "Runyankole",
    "acholi": "Acholi", "alur": "Alur", "ateso": "Ateso", "lango": "Lango",
    "lugbara": "Lugbara", "lusoga": "Lusoga", "lugwere": "Lugwere",
    "swahili": "Swahili", "kinyarwanda": "Kinyarwanda", "kirundi": "Kirundi",
    "amharic": "Amharic", "somali": "Somali", "oromo": "Oromo", "tigrinya": "Tigrinya",
    "kikuyu": "Kikuyu", "dholuo": "Dholuo",
    "yoruba": "Yoruba", "hausa": "Hausa", "igbo": "Igbo", "fulfulde": "Fulfulde",
    "wolof": "Wolof", "bambara": "Bambara", "twi": "Twi", "ewe": "Ewe",
    "lingala": "Lingala", "kikongo": "Kikongo", "bemba": "Bemba", "chichewa": "Chichewa",
    "zulu": "Zulu", "xhosa": "Xhosa", "afrikaans": "Afrikaans", "sesotho": "Sesotho",
    "setswana": "Setswana", "shona": "Shona",
    "kabyle": "Kabyle", "tachelhit": "Tachelhit",
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
    "fulfulde": "ff", "wolof": "wo", "bambara": "bm",
    "lingala": "ln", "kikongo": "kg", "luba": "lu",
    "kabyle": "kab", "tachelhit": "shi", "tamazight": "zgh",
    "oromo": "om", "tigrinya": "ti", "kikuyu": "ki", "bemba": "bem",
    "rukiga": "cgg", "runyankole": "nyn",
    "acholi": "ach", "alur": "alz", "ateso": "teo", "karamojong": "kdj",
    "lango": "laj", "lugbara": "lgg", "adhola": "adh", "kumam": "kdi",
    "lusoga": "xog", "lugwere": "gwr", "dholuo": "luo",
}

CODE_TO_LANG = {v: k for k, v in CODES.items()}

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

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

def translate_with_gemini(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    return fast_translate(text, target_lang, source_lang)

def translate_with_google_free(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    try:
        src = CODES.get(source_lang, "en")
        tgt = CODES.get(target_lang, "en")
        
        unsupported = {'lg', 'alz', 'teo', 'cgg', 'nyn', 'xog', 'gwr', 'laj', 'lgg', 'ach'}
        if src in unsupported or tgt in unsupported:
            return None
        
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={src}&tl={tgt}&dt=t&q={requests.utils.quote(text[:500])}"
        resp = requests.get(url, timeout=10)
        data = resp.json()
        result = "".join([part[0] for part in data[0] if part[0]])
        result = clean_translation(result)
        if result and result != text:
            return result
    except:
        pass
    return None

def translate_with_mymemory(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    try:
        src = CODES.get(source_lang, "en")
        tgt = CODES.get(target_lang, "en")
        url = f"https://api.mymemory.translated.net/get?q={requests.utils.quote(text[:500])}&langpair={src}|{tgt}"
        resp = requests.get(url, timeout=10)
        data = resp.json()
        translated = data["responseData"]["translatedText"]
        translated = clean_translation(translated)
        if translated and translated != text and "INVALID" not in translated.upper():
            return translated
    except:
        pass
    return None

def translate_text_smart(text: str, source_lang: str, target_lang: str) -> Dict[str, Any]:
    result = None
    provider = None
    
    if GEMINI_API_KEY:
        result = translate_with_gemini(text, source_lang, target_lang)
        if result:
            provider = "gemini"
    
    if result is None:
        result = translate_with_google_free(text, source_lang, target_lang)
        if result:
            provider = "google"
    
    if result is None:
        result = translate_with_mymemory(text, source_lang, target_lang)
        if result:
            provider = "mymemory"
    
    return {
        "text": clean_translation(result) if result else text,
        "provider": provider if provider else "none",
        "success": result is not None
    }

@router.get("/languages")
async def get_languages():
    return {"languages": LANGUAGES}

@router.get("/detect")
async def detect_language_endpoint(text: str):
    if GEMINI_API_KEY:
        try:
            prompt = f"Language: {text[:500]}"
            
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={GEMINI_API_KEY}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.05, "maxOutputTokens": 20}
            }
            resp = requests.post(url, json=payload, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                detected = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip().lower()
                detected = clean_translation(detected)
                detected_lang = normalize_language(detected)
                if detected_lang in LANGUAGES:
                    return {"detected_language": detected_lang, "confidence": 0.95}
        except:
            pass
    
    return {"detected_language": "english", "confidence": 0.3}

@router.get("/dictionary")
async def get_dictionary(word: str, source_lang: str, target_lang: str):
    """Look up word in dictionary"""
    return lookup_word(word, source_lang, target_lang)

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
            detection = await detect_language_endpoint(request.text)
            source_lang = detection["detected_language"]
        
        target_lang = normalize_language(request.target_language)
        
        if source_lang == target_lang:
            return {
                "translated_text": request.text,
                "source_language": source_lang,
                "target_language": target_lang,
                "provider": "same_language",
                "success": True
            }
        
        translation_result = translate_text_smart(request.text, source_lang, target_lang)
        
        db_translation = models.Translation(
            user_id=current_user.id,
            source_text=request.text,
            translated_text=translation_result["text"],
            source_language=source_lang,
            target_language=target_lang,
            translation_type="text"
        )
        db.add(db_translation)
        db.commit()
        
        return {
            "translated_text": translation_result["text"],
            "source_language": source_lang,
            "target_language": target_lang,
            "provider": translation_result["provider"],
            "success": translation_result["success"]
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
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
            "gemini": bool(GEMINI_API_KEY),
            "google": True,
            "mymemory": True,
        }
    }