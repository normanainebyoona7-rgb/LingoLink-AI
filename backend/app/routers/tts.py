"""
Text-to-Speech router.
Primary: Sunbird AI TTS (current API — /tasks/tts with integer speaker IDs)
Fallback: Edge-TTS (Microsoft)
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import httpx
import asyncio
import io

router = APIRouter(prefix="/tts", tags=["tts"])

SUNBIRD_API_KEY = os.getenv("SUNBIRD_API_KEY", "")
SUNBIRD_BASE = "https://api.sunbird.ai"
SUNBIRD_TTS_URL = f"{SUNBIRD_BASE}/tasks/tts"

VOICE_MAP = {
    "luganda":      {"id": 248, "code": "lug"},
    "acholi":       {"id": 241, "code": "ach"},
    "ateso":        {"id": 242, "code": "teo"},
    "runyankole":   {"id": 243, "code": "nyn"},
    "lugbara":      {"id": 245, "code": "lgg"},
    "swahili":      {"id": 246, "code": "swa"},
}

EDGE_VOICE_MAP = {
    "english":    {"female": "en-US-JennyNeural",      "male": "en-US-GuyNeural"},
    "french":     {"female": "fr-FR-DeniseNeural",     "male": "fr-FR-HenriNeural"},
    "spanish":    {"female": "es-ES-ElviraNeural",     "male": "es-ES-AlvaroNeural"},
    "german":     {"female": "de-DE-KatjaNeural",      "male": "de-DE-ConradNeural"},
    "portuguese": {"female": "pt-BR-FranciscaNeural",  "male": "pt-BR-AntonioNeural"},
    "italian":    {"female": "it-IT-ElsaNeural",       "male": "it-IT-DiegoNeural"},
    "swahili":    {"female": "sw-KE-ZuriNeural",       "male": "sw-KE-RafikiNeural"},
    "arabic":     {"female": "ar-EG-SalmaNeural",      "male": "ar-EG-ShakirNeural"},
    "hindi":      {"female": "hi-IN-SwaraNeural",      "male": "hi-IN-MadhurNeural"},
    "chinese":    {"female": "zh-CN-XiaoxiaoNeural",   "male": "zh-CN-YunxiNeural"},
    "japanese":   {"female": "ja-JP-NanamiNeural",     "male": "ja-JP-KeitaNeural"},
    "korean":     {"female": "ko-KR-SunHiNeural",      "male": "ko-KR-InJoonNeural"},
    "russian":    {"female": "ru-RU-SvetlanaNeural",   "male": "ru-RU-DmitryNeural"},
    "turkish":    {"female": "tr-TR-EmelNeural",       "male": "tr-TR-AhmetNeural"},
}


class TTSRequest(BaseModel):
    text: str
    language: str = "english"
    gender: str = "female"
    speed: float = 1.0


async def sunbird_tts(text: str, language: str) -> bytes | None:
    if not SUNBIRD_API_KEY:
        return None

    lang_key = language.lower()
    if lang_key not in VOICE_MAP:
        return None

    speaker_id = VOICE_MAP[lang_key]["id"]

    timeout = httpx.Timeout(connect=15.0, read=120.0, write=15.0, pool=15.0)
    headers = {
        "Authorization": f"Bearer {SUNBIRD_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(
                SUNBIRD_TTS_URL,
                headers=headers,
                json={"text": text, "speaker_id": speaker_id},
            )

            if r.status_code != 200:
                print(f"Sunbird TTS {r.status_code} - falling back")
                return None

            data = r.json()
            audio_url = (
                (data.get("output") or {}).get("audio_url")
                or data.get("audio_url")
            )
            if not audio_url:
                return None

            audio_res = await client.get(audio_url, timeout=60.0)
            if audio_res.status_code != 200:
                return None
            return audio_res.content

    except httpx.TimeoutException:
        print(f"Sunbird TTS timeout for {language}")
        return None
    except Exception as e:
        print(f"Sunbird TTS exception: {str(e)[:150]}")
        return None


async def edge_tts_speak(text: str, language: str, gender: str, speed: float) -> bytes | None:
    try:
        import edge_tts
    except ImportError:
        print("edge-tts not installed")
        return None

    lang_key = language.lower()
    voices = EDGE_VOICE_MAP.get(lang_key, EDGE_VOICE_MAP["english"])
    voice = voices.get(gender, voices["female"])

    rate_pct = int((speed - 1.0) * 100)
    rate_str = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"

    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate_str)
        buffer = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buffer.write(chunk["data"])
        audio = buffer.getvalue()
        return audio if audio else None
    except Exception as e:
        print(f"Edge-TTS error: {e}")
        return None


@router.post("/speak")
async def speak(req: TTSRequest):
    lang_key = req.language.lower()

    if lang_key in VOICE_MAP:
        audio = await sunbird_tts(req.text, req.language)
        if audio:
            return {
                "audio": audio.hex(),
                "format": "mp3",
                "provider": "sunbird",
                "language": req.language,
            }
        print(f"Sunbird failed for {req.language}, falling back to Edge-TTS")

    audio = await edge_tts_speak(req.text, req.language, req.gender, req.speed)
    if audio:
        return {
            "audio": audio.hex(),
            "format": "mp3",
            "provider": "edge",
            "language": req.language,
        }

    raise HTTPException(status_code=500, detail="TTS failed for both Sunbird and Edge-TTS")


@router.get("/voices")
async def list_voices():
    return {
        "sunbird": {lang: cfg["id"] for lang, cfg in VOICE_MAP.items()},
        "edge": {
            lang: {"female": cfg["female"], "male": cfg["male"]}
            for lang, cfg in EDGE_VOICE_MAP.items()
        },
    }
