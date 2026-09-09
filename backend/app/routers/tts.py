from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime
import os
import io
import requests
import base64
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/tts", tags=["tts"])

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-3.6-flash"

_audio_cache = {}
CACHE_LIMIT = 500

def get_cached(key):
    return _audio_cache.get(key)

def set_cache(key, value):
    if len(_audio_cache) >= CACHE_LIMIT:
        _audio_cache.clear()
    _audio_cache[key] = value

def generate_speech_with_gemini(text: str, language: str, voice: str = "female") -> Optional[bytes]:
    """Use Gemini TTS for natural-sounding audio in any language"""
    if not GEMINI_API_KEY:
        return None
    
    cache_key = f"gemini_tts:{language}:{voice}:{text[:100]}"
    cached = get_cached(cache_key)
    if cached:
        return cached
    
    try:
        lang_name = {
            "luganda": "Luganda", "acholi": "Acholi", "alur": "Alur",
            "ateso": "Ateso", "swahili": "Swahili", "english": "English",
            "french": "French", "spanish": "Spanish", "german": "German",
            "kinyarwanda": "Kinyarwanda", "kirundi": "Kirundi",
            "amharic": "Amharic", "somali": "Somali", "oromo": "Oromo",
            "yoruba": "Yoruba", "hausa": "Hausa", "igbo": "Igbo",
            "zulu": "Zulu", "xhosa": "Xhosa", "shona": "Shona",
            "chichewa": "Chichewa", "afrikaans": "Afrikaans",
        }.get(language, language.capitalize())
        
        voice_name = "a warm female voice" if voice == "female" else "a clear male voice"
        
        prompt = f"""Read the following {lang_name} text aloud naturally, as a native {lang_name} speaker would pronounce it.
Use {voice_name}. Pronounce every word correctly with proper {lang_name} phonetics.
Text: "{text}"
"""
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 500,
                "responseModalities": ["AUDIO"],
            }
        }
        
        resp = requests.post(url, json=payload, timeout=30)
        
        if resp.status_code == 200:
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                for part in parts:
                    if "inlineData" in part:
                        audio_b64 = part["inlineData"].get("data", "")
                        if audio_b64:
                            audio_bytes = base64.b64decode(audio_b64)
                            set_cache(cache_key, audio_bytes)
                            return audio_bytes
    except Exception as e:
        print(f"Gemini TTS error: {e}")
    return None

def generate_speech_with_gtts(text: str, language: str) -> Optional[bytes]:
    """Fallback to gTTS for international languages"""
    try:
        from gtts import gTTS
        lang_codes = {
            "english": "en", "french": "fr", "spanish": "es", "german": "de",
            "portuguese": "pt", "italian": "it", "dutch": "nl", "russian": "ru",
            "arabic": "ar", "hindi": "hi", "chinese": "zh", "japanese": "ja",
            "korean": "ko", "turkish": "tr", "swahili": "sw",
            "afrikaans": "af", "zulu": "zu", "xhosa": "xh",
            "yoruba": "yo", "hausa": "ha", "igbo": "ig",
            "somali": "so", "amharic": "am",
        }
        lang_code = lang_codes.get(language, "en")
        
        audio_buffer = io.BytesIO()
        tts = gTTS(text=text, lang=lang_code, slow=False)
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        return audio_buffer.read()
    except Exception as e:
        print(f"gTTS error: {e}")
    return None

def generate_speech_with_mms(text: str, language: str) -> Optional[bytes]:
    """Use Facebook MMS TTS for African languages"""
    try:
        mms_languages = {
            "luganda": "lug", "acholi": "ach", "alur": "alz",
            "ateso": "teo", "swahili": "swh", "kinyarwanda": "kin",
            "kirundi": "run", "amharic": "amh", "somali": "som",
            "oromo": "gaz", "tigrinya": "tir", "yoruba": "yor",
            "hausa": "hau", "igbo": "ibo", "zulu": "zul",
            "xhosa": "xho", "shona": "sna", "chichewa": "nya",
        }
        lang_code = mms_languages.get(language)
        if not lang_code:
            return None
        
        url = f"https://huggingface.co/facebook/mms-tts-{lang_code}/resolve/main/model.onnx"
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            return resp.content
    except Exception as e:
        print(f"MMS error: {e}")
    return None

@router.get("/speak")
@router.post("/speak")
async def speak_text(
    text: str,
    language: str = "english",
    voice: str = "female",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        # Try Gemini first (best quality for African languages)
        audio = generate_speech_with_gemini(text, language, voice)
        
        # Fallback to gTTS for international languages
        if audio is None:
            audio = generate_speech_with_gtts(text, language)
        
        # Fallback to MMS for African languages
        if audio is None:
            audio = generate_speech_with_mms(text, language)
        
        if audio is None:
            raise HTTPException(status_code=400, detail=f"TTS not available for {language}")
        
        # Save to database
        db_tts = models.Translation(
            user_id=current_user.id,
            source_text=text,
            translated_text=f"[TTS] {language}",
            source_language=language,
            target_language=language,
            translation_type="tts"
        )
        db.add(db_tts)
        db.commit()
        
        return StreamingResponse(
            io.BytesIO(audio),
            media_type="audio/mpeg",
            headers={"Content-Disposition": f"attachment; filename=speech.mp3"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/voices")
async def get_voices():
    """List available TTS voices"""
    return {
        "voices": ["female", "male"],
        "languages_supported": {
            "gemini_tts": "All 50+ languages",
            "gtts": "International languages",
            "mms": "African languages"
        }
    }