from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from sqlalchemy.orm import Session
import langid
import requests
import os
from typing import Optional
from dotenv import load_dotenv
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models
import app.schemas as schemas

# Load environment variables
load_dotenv()

router = APIRouter(prefix="/translate", tags=["translation"])

# Cache for translations
_cache = {}
CACHE_LIMIT = 1000

# Load Gemini API key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-3.6-flash"

LANGUAGES = {
    # International
    "english": "English", "french": "French", "spanish": "Spanish", "german": "German",
    "portuguese": "Portuguese", "italian": "Italian", "dutch": "Dutch", "russian": "Russian",
    "arabic": "Arabic", "hindi": "Hindi", "chinese": "Chinese", "japanese": "Japanese",
    "korean": "Korean", "turkish": "Turkish", "vietnamese": "Vietnamese", "thai": "Thai",
    "indonesian": "Indonesian", "hebrew": "Hebrew", "greek": "Greek",
    "polish": "Polish", "swedish": "Swedish", "danish": "Danish", "finnish": "Finnish",
    "norwegian": "Norwegian", "czech": "Czech", "romanian": "Romanian",
    "hungarian": "Hungarian", "ukrainian": "Ukrainian", "persian": "Persian",

    # Uganda
    "luganda": "Luganda", "lusoga": "Lusoga", "lugwere": "Lugwere", "gwere": "Gwere",
    "runyankole": "Runyankole", "rukiga": "Rukiga", "rutooro": "Rutooro", "runyoro": "Runyoro",
    "acholi": "Acholi", "alur": "Alur", "lango": "Lango", "lugbara": "Lugbara",
    "ateso": "Ateso", "karamojong": "Karamojong", "adhola": "Adhola", "kumam": "Kumam",

    # East Africa
    "swahili": "Swahili", "kinyarwanda": "Kinyarwanda", "kirundi": "Kirundi",
    "amharic": "Amharic", "somali": "Somali", "oromo": "Oromo", "tigrinya": "Tigrinya",
    "kikuyu": "Kikuyu", "dholuo": "Dholuo", "maasai": "Maasai", "kalenjin": "Kalenjin",
    "kamba": "Kamba", "meru": "Meru", "luhya": "Luhya",

    # West Africa
    "yoruba": "Yoruba", "hausa": "Hausa", "igbo": "Igbo", "fulfulde": "Fulfulde",
    "wolof": "Wolof", "bambara": "Bambara", "twi": "Twi", "akan": "Akan",
    "ewe": "Ewe", "ga": "Ga", "dagbani": "Dagbani", "fon": "Fon",
    "efik": "Efik", "tiv": "Tiv", "kanuri": "Kanuri",

    # Central Africa
    "lingala": "Lingala", "kikongo": "Kikongo", "luba": "Luba-Katanga",
    "chichewa": "Chichewa", "bemba": "Bemba",

    # Southern Africa
    "zulu": "Zulu", "xhosa": "Xhosa", "afrikaans": "Afrikaans", "sesotho": "Sesotho",
    "setswana": "Setswana", "shona": "Shona", "ndebele": "Ndebele", "swati": "Swati",
    "venda": "Venda", "tsonga": "Tsonga",

    # North Africa
    "kabyle": "Kabyle", "tachelhit": "Tachelhit", "tamazight": "Tamazight",
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
    "swahili": "sw", "luganda": "lg", "kinyarwanda": "rw", "kirundi": "run",
    "amharic": "am", "somali": "so", "yoruba": "yo", "hausa": "ha",
    "igbo": "ig", "shona": "sn", "chichewa": "ny", "afrikaans": "af",
    "zulu": "zu", "xhosa": "xh", "sesotho": "st", "setswana": "tn",
    "fulfulde": "ff", "wolof": "wo", "bambara": "bm",
    "lingala": "ln", "kikongo": "kg", "luba": "lu",
    "kabyle": "kab", "tachelhit": "shi", "tamazight": "zgh",
    "oromo": "om", "tigrinya": "ti", "kikuyu": "kik", "bemba": "bem",
    "rukiga": "cgg", "runyankole": "nyn",
    "acholi": "ach", "alur": "alz", "ateso": "teo", "karamojong": "kdj",
    "lango": "laj", "lugbara": "nbr", "adhola": "adh", "kumam": "kdi",
}

LANG_CODE_MAP = {
    "en": "english", "fr": "french", "es": "spanish", "de": "german",
    "pt": "portuguese", "it": "italian", "nl": "dutch", "ru": "russian",
    "ar": "arabic", "hi": "hindi", "zh": "chinese", "ja": "japanese",
    "ko": "korean", "tr": "turkish", "vi": "vietnamese", "th": "thai",
    "id": "indonesian", "he": "hebrew", "el": "greek",
    "pl": "polish", "sv": "swedish", "da": "danish", "fi": "finnish",
    "no": "norwegian", "cs": "czech", "ro": "romanian",
    "hu": "hungarian", "uk": "ukrainian", "fa": "persian",
    "sw": "swahili", "lg": "luganda", "rw": "kinyarwanda", "run": "kirundi",
    "am": "amharic", "so": "somali", "yo": "yoruba", "ha": "hausa",
    "ig": "igbo", "sn": "shona", "ny": "chichewa", "af": "afrikaans",
    "zu": "zulu", "xh": "xhosa", "st": "sesotho", "tn": "setswana",
    "ff": "fulfulde", "wo": "wolof", "bm": "bambara",
    "ln": "lingala", "kg": "kikongo", "lu": "luba",
    "kab": "kabyle", "shi": "tachelhit", "zgh": "tamazight",
    "om": "oromo", "ti": "tigrinya", "kik": "kikuyu", "bem": "bemba",
    "cgg": "rukiga", "nyn": "runyankole",
    "ach": "acholi", "alz": "alur", "teo": "ateso", "kdj": "karamojong",
    "laj": "lango", "nbr": "lugbara", "adh": "adhola", "kdi": "kumam",
}

def get_cached(key):
    return _cache.get(key)

def set_cache(key, value):
    if len(_cache) >= CACHE_LIMIT:
        _cache.clear()
    _cache[key] = value

def translate_with_google(text, source_lang, target_lang):
    """Google free endpoint - works for many languages including Acholi, Alur"""
    try:
        src = CODES.get(source_lang, "en")
        tgt = CODES.get(target_lang, "en")
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={src}&tl={tgt}&dt=t&q={text[:500]}"
        resp = requests.get(url, timeout=5)
        data = resp.json()
        result = "".join([part[0] for part in data[0] if part[0]])
        if result.strip() and result.strip() != text.strip():
            return result
    except:
        pass
    return None

def translate_with_mymemory(text, source_lang, target_lang):
    """MyMemory API - fallback for Google"""
    try:
        src = CODES.get(source_lang, "en")
        tgt = CODES.get(target_lang, "en")
        url = f"https://api.mymemory.translated.net/get?q={text[:500]}&langpair={src}|{tgt}"
        resp = requests.get(url, timeout=10)
        data = resp.json()
        translated = data["responseData"]["translatedText"]
        if translated and translated.strip() != text.strip() and "INVALID" not in translated.upper():
            return translated
    except:
        pass
    return None

def translate_with_gemini(text, source_lang, target_lang):
    """Gemini AI - final fallback for unsupported languages"""
    if not GEMINI_API_KEY:
        return None
    
    cache_key = f"gemini:{source_lang}:{target_lang}:{text[:200]}"
    cached = get_cached(cache_key)
    if cached:
        return cached
    
    try:
        source_name = LANGUAGES.get(source_lang, source_lang)
        target_name = LANGUAGES.get(target_lang, target_lang)
        
        prompt = f"""Translate the following text from {source_name} to {target_name}.
Return ONLY the translation, nothing else.

Text: "{text}"

Translation:"""
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 1000,
            }
        }
        
        resp = requests.post(url, json=payload, timeout=20)
        
        if resp.status_code == 200:
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates:
                result = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                result = result.strip()
                if result and result != text:
                    set_cache(cache_key, result)
                    return result
        else:
            print(f"Gemini API error: {resp.status_code}")
    except Exception as e:
        print(f"Gemini error: {e}")
    return None

@router.get("/languages")
async def get_languages():
    return {"languages": LANGUAGES}

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
        if not current_user.is_premium and current_user.daily_translation_count >= 10:
            raise HTTPException(status_code=403, detail="Daily limit reached.")
        current_user.daily_translation_count += 1
        db.commit()

        source_lang = request.source_language
        if source_lang == "auto":
            detected = langid.classify(request.text)[0]
            source_lang = LANG_CODE_MAP.get(detected, "english")
        else:
            source_lang = LANG_CODE_MAP.get(source_lang, source_lang)
        
        target_lang = request.target_language
        target_lang = LANG_CODE_MAP.get(target_lang, target_lang)

        # Translation fallback chain: Google -> MyMemory -> Gemini
        translated = translate_with_google(request.text, source_lang, target_lang)
        provider = "google" if translated else None
        
        if translated is None:
            translated = translate_with_mymemory(request.text, source_lang, target_lang)
            provider = "mymemory" if translated else None
        
        if translated is None:
            translated = translate_with_gemini(request.text, source_lang, target_lang)
            provider = "gemini" if translated else None
        
        if translated is None:
            translated = request.text
            provider = "none"

        db_translation = models.Translation(
            user_id=current_user.id, source_text=request.text,
            translated_text=translated, source_language=source_lang,
            target_language=target_lang, translation_type="text"
        )
        db.add(db_translation)
        db.commit()

        return {
            "translated_text": translated,
            "source_language": source_lang,
            "target_language": target_lang,
            "provider": provider
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history")
async def get_translation_history(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    translations = db.query(models.Translation).filter(models.Translation.user_id == current_user.id).order_by(models.Translation.created_at.desc()).all()
    return [{"id": t.id, "source_text": t.source_text, "translated_text": t.translated_text, "source_language": t.source_language, "target_language": t.target_language, "created_at": t.created_at} for t in translations]

@router.delete("/{translation_id}")
async def delete_translation(translation_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    translation = db.query(models.Translation).filter(models.Translation.id == translation_id, models.Translation.user_id == current_user.id).first()
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