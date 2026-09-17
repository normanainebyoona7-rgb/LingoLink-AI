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

# ---------- Sunbird language codes + default voice ----------
# Voices from /tasks/voice/speakers (48 total, best-picked here)
SUNBIRD_TTS = {
    "luganda":    {"code": "lug", "voice": "salt_lug_0001"},
    "acholi":     {"code": "ach", "voice": "salt_ach_0001"},
    "ateso":      {"code": "teo", "voice": "salt_teo_0001"},
    "runyankole": {"code": "nyn", "voice": "salt_nyn_0001"},
    "runyankore": {"code": "nyn", "voice": "salt_nyn_0001"},
    "rukiga":     {"code": "nyn", "voice": "salt_nyn_0001"},   # shared with Runyankole
    "swahili":    {"code": "swa", "voice": "waxal_swa_0006"},
    "english":    {"code": "eng", "voice": "salt_eng_0001"},
    # Add more when Sunbird supports them
}

# ---------- Edge-TTS voices for everything else ----------
EDGE_VOICES = {
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


def sunbird_tts(text: str, language: str) -> Optional[bytes]:
    """Call Sunbird TTS API — new endpoint /tasks/audio/speech"""
    if not SUNBIRD_API_KEY:
        return None

    entry = SUNBIRD_TTS.get(language.lower())
    if not entry:
        return None

    code = entry["code"]
    voice = entry["voice"]

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

        print(f"🗣️ Sunbird TTS: lang={code}, voice={voice}, text={text[:50]}")

        resp = requests.post(url, headers=headers, json=payload, timeout=90)
        print(f"   Sunbird status: {resp.status_code}")

        if resp.status_code == 200:
            data = resp.json()
            audio_url = data.get("audio_url")
            if audio_url:
                # Download the signed URL immediately (expires in ~30 min)
                audio_resp = requests.get(audio_url, timeout=30)
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
    """Route: Sunbird for Ugandan, Edge-TTS for international"""
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "Empty text")

    lang = req.language.lower()
    gender = req.gender.lower()

    # 1. Ugandan languages → Sunbird
    if lang in SUNBIRD_TTS and SUNBIRD_API_KEY:
        audio = sunbird_tts(text, lang)
        if audio:
            return StreamingResponse(
                io.BytesIO(audio),
                media_type="audio/wav",
                headers={"Content-Disposition": "inline; filename=tts.wav"}
            )
        # Fall through to Edge-TTS if Sunbird fails
        print(f"⚠️ Sunbird failed for {lang}, falling back to Edge-TTS")

    # 2. International → Edge-TTS
    voice_entry = EDGE_VOICES.get(lang)
    if not voice_entry or "..." in voice_entry.get(gender, ""):
        # Default to English voice for unknown
        if lang == "english":
            voice_entry = {"male": "en-US-GuyNeural", "female": "en-US-JennyNeural"}
        else:
            # Any unknown language — use English
            voice_entry = {"male": "en-US-GuyNeural", "female": "en-US-JennyNeural"}

    voice = voice_entry.get(gender) or voice_entry.get("female") or "en-US-JennyNeural"

    # Speed adjustment
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
    """List available voices"""
    return {
        "sunbird_ugandan": {
            lang: {"code": v["code"], "voice": v["voice"]}
            for lang, v in SUNBIRD_TTS.items()
        },
        "edge_international": EDGE_VOICES,
    }


@router.get("/sunbird-speakers")
async def sunbird_speakers():
    """Fetch live speaker list from Sunbird"""
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