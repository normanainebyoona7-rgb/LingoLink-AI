"""
Text-to-Speech router.

Lookup order:
  1. Local voice cache (WAV generated offline via MMS-TTS) — INSTANT, FREE
  2. Sunbird AI TTS (integer speaker IDs) — external, slow
  3. Edge-TTS (Microsoft) — fallback
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import os
import hashlib
import httpx
import asyncio
import io

router = APIRouter(prefix="/tts", tags=["tts"])

SUNBIRD_API_KEY = os.getenv("SUNBIRD_API_KEY", "")
SUNBIRD_BASE = "https://api.sunbird.ai"
SUNBIRD_TTS_URL = f"{SUNBIRD_BASE}/tasks/tts"

# Path to the voice cache directory (set via env, defaults to app-level folder)
CACHE_DIR = os.getenv(
    "VOICE_CACHE_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "voice_cache"),
)

# Sunbird speaker IDs (fallback path — currently returns 405 on their end)
VOICE_MAP = {
    "luganda":      {"id": 248, "code": "lug"},
    "acholi":       {"id": 241, "code": "ach"},
    "ateso":        {"id": 242, "code": "teo"},
    "runyankole":   {"id": 243, "code": "nyn"},
    "lugbara":      {"id": 245, "code": "lgg"},
    "swahili":      {"id": 246, "code": "swa"},
}

# Edge-TTS voices (final fallback)
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


def _phrase_hash(text: str) -> str:
    """Same hash used by generate_all_audio.py."""
    return hashlib.md5(text.encode("utf-8")).hexdigest()[:16]


def lookup_cached_audio(text: str, language: str) -> bytes | None:
    """Check the local voice cache for a matching WAV file."""
    if not CACHE_DIR or not os.path.isdir(CACHE_DIR):
        return None

    lang_dir = os.path.join(CACHE_DIR, language.lower())
    if not os.path.isdir(lang_dir):
        return None

    h = _phrase_hash(text.strip())
    candidate = os.path.join(lang_dir, f"{h}.wav")
    if os.path.exists(candidate):
        try:
            with open(candidate, "rb") as f:
                return f.read()
        except Exception as e:
            print(f"Cache read error: {e}")
            return None
    return None


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
    except Exception:
        return None


async def edge_tts_speak(text: str, language: str, gender: str, speed: float) -> bytes | None:
    try:
        import edge_tts
    except ImportError:
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
    except Exception:
        return None


@router.post("/speak")
async def speak(req: TTSRequest):
    """
    Synthesize speech. Order:
      1. Local cache (WAV files generated offline)
      2. Sunbird (integer speaker IDs)
      3. Edge-TTS
    """
    lang_key = req.language.lower()

    # 1. LOCAL CACHE — instant, free, high-quality Ugandan voices
    cached = lookup_cached_audio(req.text, req.language)
    if cached:
        return Response(content=cached, media_type="audio/wav")

    # 2. Sunbird (fallback for uncached text)
    if lang_key in VOICE_MAP:
        audio = await sunbird_tts(req.text, req.language)
        if audio:
            return Response(content=audio, media_type="audio/mpeg")

    # 3. Edge-TTS (universal fallback)
    audio = await edge_tts_speak(req.text, req.language, req.gender, req.speed)
    if audio:
        return Response(content=audio, media_type="audio/mpeg")

    raise HTTPException(status_code=500, detail="TTS failed for all providers")


@router.get("/voices")
async def list_voices():
    """Return available voices and cache stats."""
    cache_stats = {}
    if os.path.isdir(CACHE_DIR):
        for entry in os.listdir(CACHE_DIR):
            full = os.path.join(CACHE_DIR, entry)
            if os.path.isdir(full):
                cache_stats[entry] = len([f for f in os.listdir(full) if f.endswith(".wav")])

    return {
        "cache": cache_stats,
        "cache_dir": CACHE_DIR,
        "sunbird": {lang: cfg["id"] for lang, cfg in VOICE_MAP.items()},
        "edge": {
            lang: {"female": cfg["female"], "male": cfg["male"]}
            for lang, cfg in EDGE_VOICE_MAP.items()
        },
    }


@router.get("/cache-status")
async def cache_status():
    """Quick check on how many cached files exist per language."""
    if not os.path.isdir(CACHE_DIR):
        return {"error": "Cache dir missing", "path": CACHE_DIR}
    stats = {}
    for entry in os.listdir(CACHE_DIR):
        full = os.path.join(CACHE_DIR, entry)
        if os.path.isdir(full):
            stats[entry] = len([f for f in os.listdir(full) if f.endswith(".wav")])
    return {"cache_dir": CACHE_DIR, "languages": stats, "total": sum(stats.values())}