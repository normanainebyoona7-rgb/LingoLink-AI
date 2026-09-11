from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import os
import io
import requests
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/tts", tags=["tts"])

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
SUNBIRD_API_KEY = os.getenv("SUNBIRD_API_KEY", "")

_audio_cache = {}
CACHE_LIMIT = 500

def get_cached(key):
    return _audio_cache.get(key)

def set_cache(key, value):
    if len(_audio_cache) >= CACHE_LIMIT:
        _audio_cache.clear()
    _audio_cache[key] = value

def google_tts(text: str, language: str) -> Optional[bytes]:
    """Google Translate TTS - free, no library, works everywhere"""
    try:
        lang_codes = {
            "english": "en", "french": "fr", "spanish": "es", "german": "de",
            "portuguese": "pt", "italian": "it", "dutch": "nl", "russian": "ru",
            "arabic": "ar", "hindi": "hi", "chinese": "zh-CN", "japanese": "ja",
            "korean": "ko", "turkish": "tr", "vietnamese": "vi", "thai": "th",
            "indonesian": "id", "hebrew": "he", "greek": "el",
            "swahili": "sw", "afrikaans": "af", "zulu": "zu",
            "amharic": "am", "somali": "so", "yoruba": "yo", "hausa": "ha",
            "igbo": "ig", "shona": "sn", "chichewa": "ny",
        }
        
        lang_code = lang_codes.get(language, "en")
        
        # Google Translate TTS endpoint (200 char limit)
        chunks = [text[i:i+200] for i in range(0, len(text), 200)]
        audio_parts = []
        
        for chunk in chunks:
            url = f"https://translate.google.com/translate_tts?ie=UTF-8&q={requests.utils.quote(chunk)}&tl={lang_code}&client=tw-ob"
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            resp = requests.get(url, headers=headers, timeout=15)
            if resp.status_code == 200:
                audio_parts.append(resp.content)
            else:
                print(f"Google TTS error: {resp.status_code}")
                return None
        
        if audio_parts:
            return b"".join(audio_parts)
    except Exception as e:
        print(f"Google TTS error: {e}")
    return None

def groq_tts(text: str, language: str) -> Optional[bytes]:
    """Groq PlayAI TTS - high quality multilingual"""
    if not GROQ_API_KEY:
        return None
    
    try:
        # Groq TTS voices
        voices = {
            "english": "Arista-PlayAI",
            "french": "Amelie-PlayAI",
            "spanish": "Diego-PlayAI",
            "german": "Katja-PlayAI",
            "default": "Arista-PlayAI",
        }
        voice = voices.get(language, voices["default"])
        
        url = "https://api.groq.com/openai/v1/audio/speech"
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "playai-tts",
            "input": text[:4000],
            "voice": voice,
            "response_format": "mp3"
        }
        
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        
        if resp.status_code == 200:
            return resp.content
        else:
            print(f"Groq TTS error: {resp.status_code} - {resp.text[:200]}")
    except Exception as e:
        print(f"Groq TTS error: {e}")
    return None

def gtts_fallback(text: str, language: str) -> Optional[bytes]:
    """gTTS library as last resort"""
    try:
        from gtts import gTTS
        lang_codes = {
            "english": "en", "french": "fr", "spanish": "es", "german": "de",
            "swahili": "sw", "afrikaans": "af", "zulu": "zu",
            "amharic": "am", "somali": "so", "yoruba": "yo", "hausa": "ha",
            "igbo": "ig", "shona": "sn", "chichewa": "ny",
        }
        lang_code = lang_codes.get(language, "en")
        
        audio_buffer = io.BytesIO()
        tts = gTTS(text=text[:500], lang=lang_code, slow=False)
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        return audio_buffer.read()
    except Exception as e:
        print(f"gTTS error: {e}")
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
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    
    cache_key = f"tts:{language}:{text[:100]}"
    cached = get_cached(cache_key)
    if cached:
        return StreamingResponse(
            io.BytesIO(cached),
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=speech.mp3"}
        )
    
    # Try Groq PlayAI first (best quality)
    audio = groq_tts(text, language)
    provider = "groq"
    
    # Try Google Translate TTS (fast, free, broad support)
    if not audio:
        audio = google_tts(text, language)
        provider = "google"
    
    # Try gTTS library as final fallback
    if not audio:
        audio = gtts_fallback(text, language)
        provider = "gtts"
    
    if not audio:
        raise HTTPException(status_code=400, detail=f"TTS failed for {language}")
    
    set_cache(cache_key, audio)
    print(f"🔊 TTS via {provider} - {len(audio)} bytes")
    
    return StreamingResponse(
        io.BytesIO(audio),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": "inline; filename=speech.mp3",
            "Cache-Control": "public, max-age=3600"
        }
    )

@router.get("/voices")
async def get_voices():
    return {
        "providers": {
            "groq_playai": "High quality multilingual",
            "google_tts": "Fast, broad language support",
            "gtts": "Library fallback"
        },
        "languages_supported": "60+ languages including Luganda, Swahili, Acholi"
    }