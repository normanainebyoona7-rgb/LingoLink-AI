"""Text-to-speech using the local Orpheus voice cache.

Cache layout:
    backend/app/voice_cache/<language>/<md5(text.strip())[:16]>.wav

Lookup order:
    1. Local voice cache (exact text, then a few normalized variants)
    2. Sunbird TTS (currently returns 405 — disabled via SUNBIRD_TTS_ENABLED)
    3. Edge-TTS fallback (only for languages Edge actually supports)

Returns 404-style `None` on miss so the route can respond cleanly
instead of raising a 500.
"""
import os
import re
import hashlib
import logging
from typing import Optional

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VOICE_CACHE_DIR = os.getenv("VOICE_CACHE_DIR", os.path.join(BASE_DIR, "voice_cache"))

# Sunbird TTS is known broken (405). Flip to "true" if it starts working.
SUNBIRD_TTS_ENABLED = os.getenv("SUNBIRD_TTS_ENABLED", "false").lower() == "true"

# Languages we actually have Orpheus voices for.
CACHED_LANGUAGES = {"luganda", "acholi", "ateso", "runyankole", "runyankore",
                    "rukiga", "alur", "swahili"}

# Languages Edge-TTS has real voices for. Ugandan languages are NOT here.
EDGE_SUPPORTED = {
    "swahili": "sw-KE-ZubeidaNeural",
    "english": "en-US-JennyNeural",
    "french":  "fr-FR-DeniseNeural",
    "spanish": "es-ES-ElviraNeural",
    "german":  "de-DE-KatjaNeural",
    "arabic":  "ar-EG-SalmaNeural",
    "hindi":   "hi-IN-SwaraNeural",
    "chinese": "zh-CN-XiaoxiaoNeural",
}


def _hash(text: str) -> str:
    """md5(text.strip())[:16] — must match the filename hash."""
    return hashlib.md5(text.strip().encode("utf-8")).hexdigest()[:16]


def _variants(text: str):
    """Yield text variants to try against the cache, most-likely first."""
    raw = text.strip()
    yield raw
    yield raw.lower()
    # Strip trailing punctuation
    no_punct = raw.rstrip(".!?,;:").strip()
    if no_punct != raw:
        yield no_punct
        yield no_punct.lower()
    # Collapse whitespace
    collapsed = re.sub(r"\s+", " ", raw).strip()
    if collapsed != raw:
        yield collapsed
        yield collapsed.lower()


def _find_cached(text: str, lang: str) -> Optional[str]:
    """Return path to cached wav if any variant hits, else None."""
    lang_key = (lang or "").lower().strip()
    if lang_key == "runyankore":
        lang_key = "runyankole"  # folder is 'runyankole' in the cache

    lang_dir = os.path.join(VOICE_CACHE_DIR, lang_key)
    if not os.path.isdir(lang_dir):
        logger.info("TTS cache: no folder for lang=%s (%s)", lang_key, lang_dir)
        return None

    seen = set()
    for v in _variants(text):
        h = _hash(v)
        if h in seen:
            continue
        seen.add(h)
        path = os.path.join(lang_dir, f"{h}.wav")
        if os.path.isfile(path):
            logger.info("TTS cache HIT lang=%s text=%r hash=%s", lang_key, v, h)
            return path

    logger.info("TTS cache MISS lang=%s text=%r tried=%d", lang_key, text, len(seen))
    return None


def _sunbird_tts(text: str, lang: str) -> Optional[bytes]:
    """Sunbird TTS — disabled by default because /tasks/tts returns 405."""
    if not SUNBIRD_TTS_ENABLED:
        return None
    try:
        import requests
        api_key = os.getenv("SUNBIRD_API_KEY", "")
        if not api_key:
            return None
        sunbird_codes = {
            "luganda": "lug", "acholi": "ach", "ateso": "teo",
            "runyankole": "nyn", "runyankore": "nyn", "rukiga": "cgg",
            "alur": "alz", "swahili": "swa",
        }
        code = sunbird_codes.get(lang.lower())
        if not code:
            return None
        resp = requests.post(
            "https://api.sunbird.ai/tasks/tts",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"text": text, "language": code},
            timeout=(10, 30),
        )
        if resp.status_code == 200 and resp.content:
            return resp.content
        logger.warning("Sunbird TTS status=%s", resp.status_code)
    except Exception as e:
        logger.warning("Sunbird TTS error: %s", e)
    return None


def _edge_tts(text: str, lang: str) -> Optional[bytes]:
    """Edge-TTS fallback — only for languages Edge actually supports."""
    voice = EDGE_SUPPORTED.get(lang.lower())
    if not voice:
        logger.info("Edge-TTS: no voice for lang=%s, skipping", lang)
        return None
    try:
        import asyncio
        import edge_tts

        async def _run():
            buf = bytearray()
            comm = edge_tts.Communicate(text, voice)
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    buf.extend(chunk["data"])
            return bytes(buf)

        data = asyncio.run(_run())
        if data:
            logger.info("Edge-TTS HIT lang=%s bytes=%d", lang, len(data))
            return data
    except Exception as e:
        logger.warning("Edge-TTS error: %s", e)
    return None


def synthesize(text: str, lang: str) -> Optional[bytes]:
    """
    Return WAV/MP3 bytes for `text` in `lang`, or None on miss.

    Order: cache -> Sunbird (if enabled) -> Edge (if supported).
    Never raises; the caller should map None to a clean 404.
    """
    if not text or not text.strip():
        return None

    # 1. Local Orpheus cache
    path = _find_cached(text, lang)
    if path:
        try:
            with open(path, "rb") as f:
                return f.read()
        except Exception as e:
            logger.error("Failed reading cached wav %s: %s", path, e)

    # 2. Sunbird (off by default)
    data = _sunbird_tts(text, lang)
    if data:
        return data

    # 3. Edge-TTS (only for supported languages)
    data = _edge_tts(text, lang)
    if data:
        return data

    logger.info("TTS: no audio available for lang=%s text=%r", lang, text[:60])
    return None


# ---- Helpers used by the /tts/cache-status route ----

def cache_status() -> dict:
    """Report what's in the cache. Safe to call at runtime."""
    result = {"root": VOICE_CACHE_DIR, "exists": os.path.isdir(VOICE_CACHE_DIR),
              "languages": {}}
    if not os.path.isdir(VOICE_CACHE_DIR):
        return result
    for name in sorted(os.listdir(VOICE_CACHE_DIR)):
        d = os.path.join(VOICE_CACHE_DIR, name)
        if os.path.isdir(d):
            count = sum(1 for f in os.listdir(d) if f.endswith(".wav"))
            result["languages"][name] = count
    result["total"] = sum(result["languages"].values())
    return result