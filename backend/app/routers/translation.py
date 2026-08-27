from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from sqlalchemy.orm import Session
import langid
import requests
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models
import app.schemas as schemas

router = APIRouter(prefix="/translate", tags=["translation"])

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
    "luganda": "Luganda", "rukiga": "Rukiga", "runyankole": "Runyankole",
    "acholi": "Acholi", "alur": "Alur", "ateso": "Ateso", "lango": "Lango",
    "lugbara": "Lugbara", "lusoga": "Lusoga", "lugwere": "Lugwere", "gwere": "Gwere",

    # East Africa
    "swahili": "Swahili", "kinyarwanda": "Kinyarwanda", "kirundi": "Kirundi",
    "amharic": "Amharic", "somali": "Somali", "oromo": "Oromo", "tigrinya": "Tigrinya",
    "kikuyu": "Kikuyu", "dholuo": "Dholuo",

    # West Africa
    "yoruba": "Yoruba", "hausa": "Hausa", "igbo": "Igbo", "fulfulde": "Fulfulde",
    "wolof": "Wolof", "bambara": "Bambara", "twi": "Twi", "ewe": "Ewe",

    # Central Africa
    "lingala": "Lingala", "kikongo": "Kikongo", "bemba": "Bemba", "chichewa": "Chichewa",

    # Southern Africa
    "zulu": "Zulu", "xhosa": "Xhosa", "afrikaans": "Afrikaans", "sesotho": "Sesotho",
    "setswana": "Setswana", "shona": "Shona",

    # North Africa
    "kabyle": "Kabyle", "tachelhit": "Tachelhit",
}

CODES = {
    # International
    "english": "en", "french": "fr", "spanish": "es", "german": "de",
    "portuguese": "pt", "italian": "it", "dutch": "nl", "russian": "ru",
    "arabic": "ar", "hindi": "hi", "chinese": "zh", "japanese": "ja",
    "korean": "ko", "turkish": "tr", "vietnamese": "vi", "thai": "th",
    "indonesian": "id", "hebrew": "he", "greek": "el",
    "polish": "pl", "swedish": "sv", "danish": "da", "finnish": "fi",
    "norwegian": "no", "czech": "cs", "romanian": "ro",
    "hungarian": "hu", "ukrainian": "uk", "persian": "fa",
    # African
    "swahili": "sw", "luganda": "lg", "kinyarwanda": "rw", "kirundi": "run",
    "amharic": "am", "somali": "so", "oromo": "om", "tigrinya": "ti",
    "yoruba": "yo", "hausa": "ha", "igbo": "ig", "fulfulde": "ff",
    "wolof": "wo", "bambara": "bm", "twi": "tw", "ewe": "ee",
    "lingala": "ln", "kikongo": "kg", "bemba": "bem", "chichewa": "ny",
    "zulu": "zu", "xhosa": "xh", "afrikaans": "af", "sesotho": "st",
    "setswana": "tn", "shona": "sn",
    "kabyle": "kab", "tachelhit": "shi",
    "rukiga": "cgg", "runyankole": "nyn", "acholi": "ach", "alur": "alz",
    "ateso": "teo", "lango": "laj", "lugbara": "nbr", "lusoga": "bus",
    "lugwere": "lgg", "gwere": "gwr", "kikuyu": "kik", "dholuo": "luo",
}

LANG_CODE_MAP = {
    "en": "english", "fr": "french", "es": "spanish", "de": "german",
    "pt": "portuguese", "it": "italian", "nl": "dutch", "ru": "russian",
    "ar": "arabic", "hi": "hindi", "zh": "chinese", "ja": "japanese",
    "ko": "korean", "tr": "turkish", "vi": "vietnamese", "th": "thai",
    "id": "indonesian", "he": "hebrew", "el": "greek",
    "sw": "swahili", "lg": "luganda", "rw": "kinyarwanda", "run": "kirundi",
    "am": "amharic", "so": "somali", "om": "oromo", "ti": "tigrinya",
    "yo": "yoruba", "ha": "hausa", "ig": "igbo", "ff": "fulfulde",
    "wo": "wolof", "bm": "bambara", "tw": "twi", "ee": "ewe",
    "ln": "lingala", "kg": "kikongo", "bem": "bemba", "ny": "chichewa",
    "zu": "zulu", "xh": "xhosa", "af": "afrikaans", "st": "sesotho",
    "tn": "setswana", "sn": "shona", "kab": "kabyle", "shi": "tachelhit",
    "cgg": "rukiga", "nyn": "runyankole", "ach": "acholi", "alz": "alur",
    "teo": "ateso", "laj": "lango", "nbr": "lugbara", "bus": "lusoga",
    "lgg": "lugwere", "gwr": "gwere", "kik": "kikuyu", "luo": "dholuo",
}

def translate_with_google(text, source_lang, target_lang):
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

        translated = translate_with_google(request.text, source_lang, target_lang)
        if translated is None:
            translated = translate_with_mymemory(request.text, source_lang, target_lang)
        if translated is None:
            translated = request.text

        db_translation = models.Translation(
            user_id=current_user.id, source_text=request.text,
            translated_text=translated, source_language=source_lang,
            target_language=target_lang, translation_type="text"
        )
        db.add(db_translation)
        db.commit()

        return {"translated_text": translated, "source_language": source_lang, "target_language": target_lang}
    except HTTPException:
        raise
    except Exception as e:
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