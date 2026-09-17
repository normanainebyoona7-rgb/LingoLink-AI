"""Speech transcription — Sunbird locally, Groq on cloud (Render)"""
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from sqlalchemy.orm import Session
import tempfile
import os
import json
import requests
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models
from app.fast_translate import fast_translate
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/speech", tags=["speech"])

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
IS_CLOUD = os.getenv("RENDER", "") == "true" or os.getenv("IS_CLOUD", "") == "true"

SUNBIRD_REPO = "Sunbird/faster-whisper-51-african-languages"

# Ugandan languages Sunbird handles (only used when running locally)
SUNBIRD_LANGS = {
    "luganda", "acholi", "ateso", "runyankole", "runyankore", "rukiga",
    "lugbara", "lusoga", "rutooro", "lumasaba", "alur", "lango",
    "lugwere", "jopadhola"
}

NAME_TO_SUNBIRD = {
    "luganda": "lug", "acholi": "ach", "ateso": "teo",
    "runyankole": "nyn", "runyankore": "nyn", "rukiga": "cgg",
    "lugbara": "lgg", "lusoga": "xog", "rutooro": "ttj",
    "lumasaba": "myx", "swahili": "swa", "english": "eng",
    "french": "fra", "kinyarwanda": "kin",
}

# ISO → app name
ISO_TO_NAME = {
    "en": "english", "fr": "french", "es": "spanish", "de": "german",
    "pt": "portuguese", "it": "italian", "nl": "dutch", "ru": "russian",
    "ar": "arabic", "hi": "hindi", "zh": "chinese", "ja": "japanese",
    "ko": "korean", "tr": "turkish", "vi": "vietnamese", "th": "thai",
    "id": "indonesian", "he": "hebrew", "el": "greek",
    "pl": "polish", "sv": "swedish", "da": "danish", "fi": "finnish",
    "no": "norwegian", "cs": "czech", "ro": "romanian",
    "hu": "hungarian", "uk": "ukrainian", "fa": "persian",
    "sw": "swahili", "rw": "kinyarwanda",
    "am": "amharic", "so": "somali", "yo": "yoruba", "ha": "hausa",
    "ig": "igbo", "zu": "zulu", "xh": "xhosa", "af": "afrikaans",
    "sn": "shona", "ny": "chichewa",
}

# Known Whisper hallucinations (short phrases it invents from silence)
HALLUCINATIONS = {
    "thank you", "thank you.", "thanks", "thanks.",
    "you", "you.", "the", "the.",
    "subtitles by", "subtitle by", "subtitles:", "please subscribe",
    "amara.org", "mbc", "sbs", "abc",
    "♪", "♪♪", "[music]", "[silence]", "(silence)",
    ".", ",", "!", "?",
    "you you", "you.",
}

_whisper_model = None
_lang_map = None
_sunbird_load_attempted = False


def get_lang_map():
    global _lang_map
    if _lang_map is not None:
        return _lang_map
    try:
        from huggingface_hub import hf_hub_download
        path = hf_hub_download(SUNBIRD_REPO, "language_map.json")
        with open(path) as f:
            _lang_map = json.load(f)
        print(f"✅ Sunbird language map loaded ({len(_lang_map)} languages)")
        return _lang_map
    except Exception as e:
        print(f"❌ Failed to load Sunbird language map: {e}")
        return None


def get_whisper_model():
    """Load Sunbird faster-whisper model (LOCAL ONLY — skipped on cloud)"""
    global _whisper_model, _sunbird_load_attempted

    # On Render/cloud, never even try to load Sunbird (512MB RAM + gated repo)
    if IS_CLOUD:
        return None

    if _whisper_model is not None:
        return _whisper_model

    if _sunbird_load_attempted:
        return None

    _sunbird_load_attempted = True

    try:
        from faster_whisper import WhisperModel
        print("🔊 Loading Sunbird faster-whisper model (CPU, int8)...")
        _whisper_model = WhisperModel(
            SUNBIRD_REPO,
            device="cpu",
            compute_type="int8",
        )
        print("✅ Sunbird model loaded")
        return _whisper_model
    except Exception as e:
        print(f"⚠️ Sunbird model unavailable — using Groq only: {e}")
        return None


def is_hallucination(text: str) -> bool:
    """Reject known Whisper hallucinations and garbage"""
    if not text:
        return True
    cleaned = text.strip().lower()
    if len(cleaned) < 2:
        return True
    if cleaned in HALLUCINATIONS:
        return True
    # Only punctuation
    if all(c in ".!?,;:-\"'" for c in cleaned):
        return True
    # Single repeated word
    words = cleaned.split()
    if len(words) >= 2 and len(set(words)) == 1:
        return True
    return False


# ============================================================
# Local (Sunbird) transcription — only when running locally
# ============================================================

def transcribe_sunbird(audio_path: str, language: str = None) -> dict:
    model = get_whisper_model()
    if not model:
        raise HTTPException(status_code=503, detail="Sunbird not available")

    lang_code = None
    if language and language not in ("auto", None):
        lang_map = get_lang_map()
        sunbird_code = NAME_TO_SUNBIRD.get(language.lower())
        if lang_map and sunbird_code:
            lang_code = lang_map.get(sunbird_code)
            print(f"🎯 Sunbird: {language} → sunbird={sunbird_code} → whisper={lang_code}")

    try:
        segments, info = model.transcribe(
            audio_path,
            language=lang_code,
            task="transcribe",
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            condition_on_previous_text=False,
        )
        text = " ".join([seg.text.strip() for seg in segments]).strip()
        detected = language or (info.language if info else "auto")
        return {"text": text, "language": detected}
    except Exception as e:
        print(f"❌ Sunbird error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Groq (cloud) transcription — 99 languages
# ============================================================

def transcribe_groq(audio_path: str, language: str = None) -> dict:
    """Transcribe using Groq Whisper Large v3"""
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not set")

    try:
        url = "https://api.groq.com/openai/v1/audio/transcriptions"
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}

        with open(audio_path, "rb") as f:
            files = {"file": (os.path.basename(audio_path), f, "audio/webm")}
            data = {
                "model": "whisper-large-v3",
                "response_format": "verbose_json",
                "temperature": "0.0",
                "prompt": " ",  # Empty-ish prompt to reduce hallucinations
            }

            # If specific non-Ugandan language requested, pass it
            if language and language not in ("auto", None):
                iso_map = {v: k for k, v in ISO_TO_NAME.items()}
                iso = iso_map.get(language.lower())
                if iso:
                    data["language"] = iso
                    print(f"🎯 Groq: {language} → iso={iso}")
                elif language.lower() in SUNBIRD_LANGS:
                    # Groq doesn't support Luganda/Acholi directly.
                    # Use Swahili as closest proxy OR leave blank for auto
                    print(f"⚠️ Groq doesn't natively support {language}, using auto-detect")

            resp = requests.post(url, headers=headers, files=files, data=data, timeout=60)

        if resp.status_code == 200:
            result = resp.json()
            text = result.get("text", "").strip()
            detected_iso = (result.get("language") or "").lower()
            detected_name = ISO_TO_NAME.get(detected_iso, language or "auto")
            return {"text": text, "language": detected_name}
        else:
            print(f"❌ Groq error: {resp.status_code} - {resp.text[:200]}")
            raise HTTPException(status_code=500, detail=f"Groq failed: {resp.status_code}")
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=500, detail="Groq timed out")


# ============================================================
# Smart router
# ============================================================

def transcribe_smart(audio_path: str, requested_language: str = None, auto_detect: bool = True) -> dict:
    """
    Route:
    - Local: try Sunbird for Ugandan, else Groq
    - Cloud (Render): always Groq
    """
    # Cloud: force Groq
    if IS_CLOUD:
        lang = None if (auto_detect or not requested_language or requested_language == "auto") else requested_language
        print(f"☁️ Cloud mode → Groq (lang={lang or 'auto'})")
        return transcribe_groq(audio_path, lang)

    # Local: try Sunbird first (works for Ugandan)
    if requested_language and requested_language != "auto":
        if requested_language.lower() in SUNBIRD_LANGS:
            try:
                print(f"🇺🇬 Local: Sunbird for {requested_language}")
                return transcribe_sunbird(audio_path, requested_language)
            except HTTPException:
                pass

    # Local fallback: Groq for everything else
    try:
        return transcribe_groq(audio_path, requested_language)
    except HTTPException:
        # Last resort: Sunbird (only if model loaded)
        return transcribe_sunbird(audio_path, requested_language)


# ============================================================
# Endpoints
# ============================================================

@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = Form("auto"),
    auto_detect: str = Form("true"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        wants_auto = auto_detect.lower() == "true" or language == "auto"
        print(f"🎤 Transcribing {len(content)} bytes (lang={language}, auto={wants_auto})...")

        # Skip tiny chunks
        if len(content) < 5000:
            os.unlink(tmp_path)
            print("⏭️ Skipped: audio too small")
            return {"text": "", "language": "auto"}

        result = transcribe_smart(tmp_path, language, auto_detect=wants_auto)
        os.unlink(tmp_path)

        text = result.get("text", "").strip()

        # Filter hallucinations
        if is_hallucination(text):
            print(f"⏭️ Rejected hallucination: '{text}'")
            return {"text": "", "language": "auto"}

        print(f"✅ [{result['language']}] {text[:100]}")

        return {
            "text": text,
            "language": result["language"],
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translate-voice")
async def translate_voice(
    file: UploadFile = File(...),
    source_language: str = "auto",
    target_language: str = "en",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        wants_auto = source_language == "auto"
        result = transcribe_smart(tmp_path, source_language, auto_detect=wants_auto)
        os.unlink(tmp_path)

        full_text = result["text"]
        detected = result.get("language", source_language)

        if is_hallucination(full_text):
            raise HTTPException(status_code=400, detail="No speech detected")

        translated = ""
        if full_text.strip():
            translated = fast_translate(full_text, target_language, detected) or full_text

        db_translation = models.Translation(
            user_id=current_user.id,
            source_text=full_text,
            translated_text=translated,
            source_language=detected,
            target_language=target_language,
            translation_type="voice",
        )
        db.add(db_translation)
        db.commit()

        return {
            "original_text": full_text,
            "translated_text": translated,
            "source_language": detected,
            "target_language": target_language,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/voice-to-voice")
async def voice_to_voice(
    file: UploadFile = File(...),
    source_language: str = "auto",
    target_language: str = "en",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        wants_auto = source_language == "auto"
        result = transcribe_smart(tmp_path, source_language, auto_detect=wants_auto)
        os.unlink(tmp_path)

        full_text = result["text"]
        detected = result.get("language", source_language)

        if is_hallucination(full_text):
            raise HTTPException(status_code=400, detail="No speech detected")

        translated = ""
        if full_text.strip():
            translated = fast_translate(full_text, target_language, detected) or full_text

        db_translation = models.Translation(
            user_id=current_user.id,
            source_text=full_text,
            translated_text=translated,
            source_language=detected,
            target_language=target_language,
            translation_type="voice",
        )
        db.add(db_translation)
        db.commit()

        return {
            "original_text": full_text,
            "translated_text": translated,
            "source_language": detected,
            "target_language": target_language,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))