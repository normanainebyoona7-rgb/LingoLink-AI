"""TTS router — Sunbird for Ugandan languages, Edge-TTS for international"""
import os
import io
import asyncio
import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import edge_tts

router = APIRouter(prefix="/tts", tags=["tts"])

SUNBIRD_API_KEY = os.getenv("SUNBIRD_API_KEY", "")

# ---------- Sunbird voices — ONLY Ugandan languages ----------
# English and international languages go through Edge-TTS (fast)
SUNBIRD_VOICES = {
    "luganda":    {"female": "salt_lug_0001",  "male": "waxal_lug_0002",  "code": "lug"},
    "acholi":     {"female": "salt_ach_0001",  "male": "waxal_ach_0001",  "code": "ach"},
    "ateso":      {"female": "salt_teo_0001",  "male": "salt_teo_0001",   "code": "teo"},
    "runyankole": {"female": "salt_nyn_0001",  "male": "waxal_nyn_0003",  "code": "nyn"},
    "runyankore": {"female": "salt_nyn_0001",  "male": "waxal_nyn_0003",  "code": "nyn"},
    "rukiga":     {"female": "salt_nyn_0001",  "male": "waxal_nyn_0003",  "code": "nyn"},
    "swahili":    {"female": "waxal_swa_0006", "male": "waxal_swa_0006",  "code": "swa"},
}

# ---------- Edge-TTS voices — all international + English ----------
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
    "kinyarwanda":{"male": "rw-RW-SpeakerNeural",   "female": "rw-RW-SpeakerNeural"},
}


class TTSRequest(BaseModel):
    text: str
    language: str = "english"
    gender: str = "female"
    speed: float = 1.0


def sunbird_tts(text: str, language: str, gender: str = "female") -> Optional[bytes]:
    """Call Sunbird TTS API — new endpoint /tasks/audio/speech"""
    if not SUNBIRD_API_KEY:
        return None

    entry = SUNBIRD_VOICES.get(language.lower())
    if not entry:
        return None

    code = entry["code"]
    voice = entry.get(gender) or entry.get("female") or entry.get("male")
    if not voice:
        return None

    try:
        url = "https://api.sunbird.ai/tasks/audio/speech"
        headers = {
            "Authorization": f"Bearer {SUNBIRD_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "text": text[:2000],
            "language": code,
            "voice": voice,
        }

        print(f"🗣️ Sunbird TTS: lang={code}, voice={voice}, gender={gender}, text={text[:50]}")

        # Reduced timeout: 20s hard cap. If it takes longer, we fall back to Edge-TTS.
        resp = requests.post(url, headers=headers, json=payload, timeout=20)
        print(f"   Sunbird status: {resp.status_code}")

        if resp.status_code == 200:
            data = resp.json()
            audio_url = data.get("audio_url")
            if audio_url:
                audio_resp = requests.get(audio_url, timeout=15)
                if audio_resp.status_code == 200:
                    print(f"   ✅ Downloaded {len(audio_resp.content)} bytes from Sunbird")
                    return audio_resp.content
                else:
                    print(f"   ❌ Download failed: {audio_resp.status_code}")
            else:
                print(f"   ❌ No audio_url in response: {data}")
        else:
            print(f"   ❌ Sunbird error: {resp.text[:200]}")
    except Exception as e:
        print(f"   ❌ Sunbird TTS exception: {e}")
    return None


async def edge_tts_generate(text: str, voice: str, rate: str = "+0%") -> Optional[bytes]:
    """Generate speech using Edge-TTS"""
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
    """Route: Sunbird for Ugandan languages, Edge-TTS for everything else"""
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "Empty text")

    lang = req.language.lower()
    gender = req.gender.lower()

    # 1. Ugandan languages → Sunbird
    if lang in SUNBIRD_VOICES and SUNBIRD_API_KEY:
        audio = sunbird_tts(text, lang, gender)
        if audio:
            return StreamingResponse(
                io.BytesIO(audio),
                media_type="audio/wav",
                headers={"Content-Disposition": "inline; filename=tts.wav"}
            )
        print(f"⚠️ Sunbird failed/timeout for {lang}, falling back to Edge-TTS")

    # 2. Everything else → Edge-TTS (fast, ~1s)
    voice_entry = EDGE_VOICES.get(lang)
    if not voice_entry:
        voice_entry = {"male": "en-US-GuyNeural", "female": "en-US-JennyNeural"}

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
    return {
        "sunbird_ugandan": SUNBIRD_VOICES,
        "edge_international": EDGE_VOICES,
    }


@router.get("/sunbird-speakers")
async def sunbird_speakers():
    if not SUNBIRD_API_KEY:
        raise HTTPException(500, "SUNBIRD_API_KEY not set")
    try:
        r = requests.get(
            "https://api.sunbird.ai/tasks/voice/speakers",
            headers={"Authorization": f"Bearer {SUNBIRD_API_KEY}"},
            timeout=30
        )
        return r.json()
    except Exception as e:
        raise HTTPException(500, str(e))