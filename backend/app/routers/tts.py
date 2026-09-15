"""TTS router — Sunbird for Ugandan languages, Edge-TTS for international"""
import os
import io
import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import edge_tts

router = APIRouter(prefix="/tts", tags=["tts"])

SUNBIRD_API_KEY = os.getenv("SUNBIRD_API_KEY", "")

# Sunbird TTS speaker IDs
SUNBIRD_TTS_SPEAKERS = {
    "acholi": 241,
    "ateso": 242,
    "runyankole": 243,
    "runyankore": 243,
    "lugbara": 245,
    "swahili": 246,
    "luganda": 248,
}

# Edge-TTS voices (male/female) for international + fallback
EDGE_VOICES = {
    "english":    {"male": "en-US-GuyNeural",       "female": "en-US-JennyNeural"},
    "french":     {"male": "fr-FR-HenriNeural",     "female": "fr-FR-DeniseNeural"},
    "spanish":    {"male": "es-ES-AlvaroNeural",    "female": "es-ES-ElviraNeural"},
    "german":     {"male": "de-DE-ConradNeural",    "female": "de-DE-KatjaNeural"},
    "portuguese": {"male": "pt-BR-AntonioNeural",   "female": "pt-BR-FranciscaNeural"},
    "italian":    {"male": "it-IT-DiegoNeural",     "female": "it-IT-ElsaNeural"},
    "dutch":      {"male": "nl-NL-MaartenNeural",   "female": "nl-NL-FennaNeural"},
    "russian":    {"male": "ru-RU-DmitryNeural",    "female": "ru-RU-SvetlanaNeural"},
    "arabic":     {"male": "ar-EG-ShakirNeural",    "female": "ar-EG-SalmaNeural"},
    "hindi":      {"male": "hi-IN-MadhurNeural",    "female": "hi-IN-SwaraNeural"},
    "chinese":    {"male": "zh-CN-YunxiNeural",     "female": "zh-CN-XiaoxiaoNeural"},
    "japanese":   {"male": "ja-JP-KeitaNeural",     "female": "ja-JP-NanamiNeural"},
    "korean":     {"male": "ko-KR-InJoonNeural",    "female": "ko-KR-SunHiNeural"},
    "turkish":    {"male": "tr-TR-AhmetNeural",     "female": "tr-TR-EmelNeural"},
    "swahili":    {"male": "sw-KE-RafikiNeural",    "female": "sw-KE-ZuriNeural"},
    "kinyarwanda":{"male": "rw-RW-...Neural",       "female": "rw-RW-...Neural"},  # not available — falls back
}


class TTSRequest(BaseModel):
    text: str
    language: str = "english"
    gender: str = "female"
    speed: float = 1.0


def sunbird_tts(text: str, language: str) -> Optional[bytes]:
    """Call Sunbird TTS API for Ugandan languages"""
    if not SUNBIRD_API_KEY:
        return None
    speaker_id = SUNBIRD_TTS_SPEAKERS.get(language)
    if not speaker_id:
        return None
    try:
        url = "https://api.sunbird.ai/tasks/tts"
        headers = {
            "Authorization": f"Bearer {SUNBIRD_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "text": text[:2000],
            "speaker_id": speaker_id,
            "temperature": 0.7,
            "max_new_audio_tokens": 2000
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=20)
        if resp.status_code == 200:
            data = resp.json()
            audio_url = data.get("output", {}).get("audio_url")
            if audio_url:
                audio_resp = requests.get(audio_url, timeout=10)
                if audio_resp.status_code == 200:
                    return audio_resp.content
        else:
            print(f"Sunbird TTS status {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        print(f"Sunbird TTS error: {e}")
    return None


async def edge_tts_generate(text: str, voice: str, rate: str = "+0%") -> Optional[bytes]:
    """Generate speech using Edge-TTS (free Microsoft endpoint)"""
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        return audio_data if audio_data else None
    except Exception as e:
        print(f"Edge-TTS error: {e}")
    return None


@router.post("/speak")
async def speak(req: TTSRequest):
    """Route TTS based on language"""
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "Empty text")

    lang = req.language.lower()
    gender = req.gender.lower()

    # Ugandan → Sunbird
    if lang in SUNBIRD_TTS_SPEAKERS and SUNBIRD_API_KEY:
        audio = sunbird_tts(text, lang)
        if audio:
            return StreamingResponse(
                io.BytesIO(audio),
                media_type="audio/mpeg",
                headers={"Content-Disposition": "inline; filename=tts.mp3"}
            )
        # Fall through to Edge-TTS on failure

    # International → Edge-TTS
    voice_entry = EDGE_VOICES.get(lang)
    if not voice_entry or "..." in voice_entry.get("male", ""):
        voice_entry = EDGE_VOICES["english"]

    voice = voice_entry.get(gender) or voice_entry.get("female") or "en-US-JennyNeural"

    rate_pct = int((req.speed - 1.0) * 100)
    rate_str = f"{rate_pct:+d}%"

    audio = await edge_tts_generate(text, voice, rate_str)
    if audio:
        return StreamingResponse(
            io.BytesIO(audio),
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=tts.mp3"}
        )

    raise HTTPException(500, "TTS generation failed")


@router.get("/voices")
async def list_voices():
    """Debug: list available voices"""
    return {
        "ugandan": {lang: {"speaker_id": sid} for lang, sid in SUNBIRD_TTS_SPEAKERS.items()},
        "international": EDGE_VOICES,
    }