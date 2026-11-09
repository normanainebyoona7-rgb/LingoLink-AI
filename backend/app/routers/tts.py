"""
Text-to-Speech router.

Lookup order:
  1. Local voice cache (WAV generated offline via Orpheus) — INSTANT, FREE
  2. Sunbird AI TTS — currently 405, disabled by default
  3. Edge-TTS (Microsoft) — fallback, only for languages Edge supports

Fixes in this version:
  - Cache hit works whether frontend sends SOURCE text (English) or TARGET text
    (e.g. Luganda). If the given text misses, we translate via the local
    dictionary and hash the translation.
  - Returns clean 404 (not 500) when no provider can synthesize.
  - Logs every cache lookup (hit/miss, hash, text) so misses are diagnosable.
  - Tries several normalization variants (case, punctuation, whitespace).
  - Handles 'runyankore' -> 'runyankole' folder naming.
  - Sunbird disabled by default; enable via SUNBIRD_TTS_ENABLED=true.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import os
import re
import hashlib
import logging

router = APIRouter(prefix="/tts", tags=["tts"])
logger = logging.getLogger("tts")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

SUNBIRD_API_KEY = os.getenv("SUNBIRD_API_KEY", "")
SUNBIRD_BASE = "https://api.sunbird.ai"
SUNBIRD_TTS_URL = f"{SUNBIRD_BASE}/tasks/tts"
SUNBIRD_TTS_ENABLED = os.getenv("SUNBIRD_TTS_ENABLED", "false").lower() == "true"

# Path to the voice cache. Defaults to backend/app/voice_cache
CACHE_DIR = os.getenv(
    "VOICE_CACHE_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "voice_cache"),
)

# Language folder aliases — frontend may send one form, folder uses another
LANG_FOLDER_ALIASES = {
    "runyankore": "runyankole",
    "nyankole":   "runyankole",
}

# Sunbird speaker IDs (fallback path — currently returns 405)
VOICE_MAP = {
    "luganda":    {"id": 248, "code": "lug"},
    "acholi":     {"id": 241, "code": "ach"},
    "ateso":      {"id": 242, "code": "teo"},
    "runyankole": {"id": 243, "code": "nyn"},
    "lugbara":    {"id": 245, "code": "lgg"},
    "swahili":    {"id": 246, "code": "swa"},
}

# Edge-TTS voices (final fallback). Ugandan languages are NOT here — that's
# deliberate, Edge has no Luganda/Acholi/etc voices.
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
    source_language: str = "english"   # what language `text` is in
    gender: str = "female"
    speed: float = 1.0


# ---------------- helpers ----------------

def _phrase_hash(text: str) -> str:
    """md5(text.strip())[:16] — must match generate_all_audio.py."""
    return hashlib.md5(text.strip().encode("utf-8")).hexdigest()[:16]


def _variants(text: str):
    """Yield normalized variants to try against the cache, in order."""
    raw = text.strip()
    yield raw
    lower = raw.lower()
    if lower != raw:
        yield lower
    no_punct = raw.rstrip(".!?,;:").strip()
    if no_punct and no_punct != raw:
        yield no_punct
        yield no_punct.lower()
    collapsed = re.sub(r"\s+", " ", raw).strip()
    if collapsed != raw:
        yield collapsed
        yield collapsed.lower()


def _resolve_lang_folder(language: str) -> str:
    key = (language or "").lower().strip()
    return LANG_FOLDER_ALIASES.get(key, key)


def _hash_wav(lang_dir: str, text: str) -> bytes | None:
    """Return WAV bytes if md5(text)[:16].wav exists in lang_dir, else None."""
    h = _phrase_hash(text)
    candidate = os.path.join(lang_dir, f"{h}.wav")
    if os.path.isfile(candidate):
        try:
            with open(candidate, "rb") as f:
                data = f.read()
            logger.info("CACHE HIT folder=%s text=%r hash=%s bytes=%d",
                        os.path.basename(lang_dir), text, h, len(data))
            return data
        except Exception as e:
            logger.error("cache read error %s: %s", candidate, e)
    return None


def lookup_cached_audio(text: str, language: str, source_language: str = "english") -> bytes | None:
    """
    Check the local voice cache.

    The Orpheus cache was generated from the TARGET-LANGUAGE text
    (e.g. 'Oli otya'), not necessarily the English source. So we try:

      1. The given text as-is (with normalization variants)
      2. If that misses, translate the text to the target language using
         the local dictionary, then hash the translation.

    Returns WAV bytes or None.
    """
    if not CACHE_DIR or not os.path.isdir(CACHE_DIR):
        logger.warning("cache dir missing: %s", CACHE_DIR)
        return None

    lang_folder = _resolve_lang_folder(language)
    lang_dir = os.path.join(CACHE_DIR, lang_folder)
    if not os.path.isdir(lang_dir):
        logger.info("no cache folder for lang=%s (%s)", lang_folder, lang_dir)
        return None

    seen: set[str] = set()

    # --- 1. Try the given text as-is (with variants) ---
    for v in _variants(text):
        if v in seen:
            continue
        seen.add(v)
        data = _hash_wav(lang_dir, v)
        if data:
            return data

    # --- 2. Try the dictionary translation of the text ---
    try:
        from app.local_dictionaries import lookup_local
    except Exception as e:
        logger.warning("lookup_local import failed: %s", e)
        lookup_local = None

    if lookup_local is not None:
        # Try the frontend-declared source first, then 'english', then 'auto'
        candidate_sources = []
        for s in (source_language, "english", "auto"):
            if s and s not in candidate_sources:
                candidate_sources.append(s)

        for src in candidate_sources:
            try:
                translated = lookup_local(text, language, src)
            except Exception as e:
                logger.warning("lookup_local(%r, %s, %s) failed: %s",
                               text, language, src, e)
                continue
            if not translated:
                continue
            for v in _variants(translated):
                if v in seen:
                    continue
                seen.add(v)
                data = _hash_wav(lang_dir, v)
                if data:
                    logger.info("CACHE HIT via translation src=%s %r -> %r",
                                src, text, v)
                    return data

    logger.info("CACHE MISS lang=%s text=%r tried=%d variants",
                lang_folder, text[:60], len(seen))
    return None


# ---------------- providers ----------------

async def sunbird_tts(text: str, language: str) -> bytes | None:
    if not SUNBIRD_TTS_ENABLED or not SUNBIRD_API_KEY:
        return None
    try:
        import httpx
    except ImportError:
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
                logger.warning("Sunbird TTS status=%s", r.status_code)
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
    except Exception as e:
        logger.warning("Sunbird TTS error: %s", e)
        return None


async def edge_tts_speak(text: str, language: str, gender: str, speed: float) -> bytes | None:
    try:
        import edge_tts
    except ImportError:
        return None

    lang_key = language.lower()
    if lang_key not in EDGE_VOICE_MAP:
        logger.info("Edge-TTS: no voice for lang=%s, skipping", lang_key)
        return None

    voices = EDGE_VOICE_MAP[lang_key]
    voice = voices.get(gender, voices["female"])

    rate_pct = int((speed - 1.0) * 100)
    rate_str = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"

    try:
        import io
        communicate = edge_tts.Communicate(text, voice, rate=rate_str)
        buffer = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buffer.write(chunk["data"])
        audio = buffer.getvalue()
        if audio:
            logger.info("Edge-TTS hit lang=%s bytes=%d", lang_key, len(audio))
        return audio or None
    except Exception as e:
        logger.warning("Edge-TTS error: %s", e)
        return None


# ---------------- routes ----------------

@router.post("/speak")
async def speak(req: TTSRequest):
    """
    Synthesize speech. Order:
      1. Local cache (Orpheus WAVs), trying given text then dictionary translation
      2. Sunbird (disabled by default)
      3. Edge-TTS (only for languages Edge supports)
    Never returns 500 for a cache miss — returns 404 instead.
    """
    lang_key = req.language.lower()

    cached = lookup_cached_audio(req.text, req.language, req.source_language)
    if cached:
        return Response(content=cached, media_type="audio/wav")

    if lang_key in VOICE_MAP:
        audio = await sunbird_tts(req.text, req.language)
        if audio:
            return Response(content=audio, media_type="audio/mpeg")

    audio = await edge_tts_speak(req.text, req.language, req.gender, req.speed)
    if audio:
        return Response(content=audio, media_type="audio/mpeg")

    raise HTTPException(
        status_code=404,
        detail=(
            f"No audio for lang={req.language!r} text={req.text[:60]!r}. "
            f"Cache dir: {CACHE_DIR}"
        ),
    )


@router.get("/voices")
async def list_voices():
    cache_stats = {}
    if os.path.isdir(CACHE_DIR):
        for entry in os.listdir(CACHE_DIR):
            full = os.path.join(CACHE_DIR, entry)
            if os.path.isdir(full):
                cache_stats[entry] = len([f for f in os.listdir(full) if f.endswith(".wav")])
    return {
        "cache": cache_stats,
        "cache_dir": CACHE_DIR,
        "sunbird_enabled": SUNBIRD_TTS_ENABLED,
        "sunbird": {lang: cfg["id"] for lang, cfg in VOICE_MAP.items()},
        "edge": {lang: cfg for lang, cfg in EDGE_VOICE_MAP.items()},
    }


@router.get("/cache-status")
async def cache_status():
    if not os.path.isdir(CACHE_DIR):
        return {"error": "Cache dir missing", "path": CACHE_DIR, "exists": False}
    stats = {}
    for entry in os.listdir(CACHE_DIR):
        full = os.path.join(CACHE_DIR, entry)
        if os.path.isdir(full):
            stats[entry] = len([f for f in os.listdir(full) if f.endswith(".wav")])
    return {
        "cache_dir": CACHE_DIR,
        "exists": True,
        "languages": stats,
        "total": sum(stats.values()),
    }