"""Speech transcription — Sunbird faster-whisper (local) + Groq Whisper (cloud)"""
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

# Ugandan/African languages Sunbird handles best
SUNBIRD_LANGS = {
    "luganda", "acholi", "ateso", "runyankole", "runyankore", "rukiga",
    "lugbara", "lusoga", "rutooro", "lumasaba", "alur", "lango",
    "lugwere", "jopadhola", "swahili", "kinyarwanda"
}

# Map our app names to Sunbird codes
NAME_TO_SUNBIRD = {
    "luganda": "lug", "acholi": "ach", "ateso": "teo",
    "runyankole": "nyn", "runyankore": "nyn", "rukiga": "cgg",
    "lugbara": "lgg", "lusoga": "xog", "rutooro": "ttj",
    "lumasaba": "myx", "swahili": "swa", "english": "eng",
    "french": "fra", "kinyarwanda": "kin", "somali": "som",
    "amharic": "amh", "yoruba": "yor", "hausa": "hau", "igbo": "ibo",
    "zulu": "zul", "xhosa": "xho", "afrikaans": "afr",
    "shona": "sna", "lingala": "lin", "wolof": "wol",
    "oromo": "orm", "kikuyu": "kik", "bemba": "bem",
    "chichewa": "nya", "sesotho": "sot", "setswana": "tsn",
    "fulani": "ful", "ewe": "ewe", "twi": "aka",
    "kabyle": "kab", "malagasy": "mlg", "ndebele": "nbl",
}

# ISO code → app name (for language detection mapping)
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

_whisper_model = None
_lang_map = None


def get_lang_map():
    """Load Sunbird's language_map.json"""
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
    """Load Sunbird faster-whisper model once"""
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model
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
        print(f"❌ Failed to load faster-whisper: {e}")
        return None


# ============================================================
# Language detection
# ============================================================

def detect_language(audio_path: str) -> str:
    """
    Detect spoken language using Whisper's built-in detector.
    Returns app-friendly language name (e.g. "english", "luganda").
    Falls back to "auto" if detection fails.
    """
    model = get_whisper_model()
    if not model:
        return "auto"
    try:
        # Use a small slice of the audio to speed up detection
        _, info = model.transcribe(
            audio_path,
            task="transcribe",
            beam_size=1,
            vad_filter=True,
            condition_on_previous_text=False,
            language=None,
        )
        # info.language is the ISO code whisper picked (e.g. "en", "sd")
        iso = (info.language or "").lower()
        if not iso:
            return "auto"

        # Map ISO → app name for common languages
        if iso in ISO_TO_NAME:
            return ISO_TO_NAME[iso]

        # Whisper uses weird slots for Sunbird African languages
        # Sunbird codes: lug→sd, ach→su, teo→bs, nyn→si, cgg→as, lgg→yi, xog→eu, ttj→ne, myx→ka, alz→?, laj→?
        SUNBIRD_ISO_REVERSE = {
            "sd": "luganda",
            "su": "acholi",
            "bs": "ateso",
            "si": "runyankole",
            "as": "rukiga",
            "yi": "lugbara",
            "eu": "lusoga",
            "ne": "rutooro",
            "ka": "lumasaba",
        }
        if iso in SUNBIRD_ISO_REVERSE:
            return SUNBIRD_ISO_REVERSE[iso]

        return "auto"
    except Exception as e:
        print(f"⚠️ Language detection failed: {e}")
        return "auto"


# ============================================================
# Sunbird (local) transcription
# ============================================================

def transcribe_sunbird(audio_path: str, language: str = None) -> dict:
    """Transcribe using Sunbird faster-whisper (Ugandan + African languages)"""
    model = get_whisper_model()
    if not model:
        raise HTTPException(status_code=500, detail="Local whisper model unavailable")

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
    """Transcribe using Groq Whisper Large v3 (99 languages)"""
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
            }
            # If specific language requested, pass it
            if language and language not in ("auto", None):
                # Convert app name to ISO for Groq
                iso_map = {v: k for k, v in ISO_TO_NAME.items()}
                iso = iso_map.get(language.lower())
                if iso:
                    data["language"] = iso
                    print(f"🎯 Groq: {language} → iso={iso}")

            resp = requests.post(url, headers=headers, files=files, data=data, timeout=60)

        if resp.status_code == 200:
            result = resp.json()
            text = result.get("text", "").strip()
            detected_iso = result.get("language", "").lower()
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
    Smart transcription router:
    1. Detect language (if auto_detect=true, or if requested is auto)
    2. Route Ugandan → Sunbird | International → Groq
    3. Fall back to Sunbird if Groq fails and no API key
    """
    detected = None

    # Step 1: Determine language
    if auto_detect or not requested_language or requested_language == "auto":
        detected = detect_language(audio_path)
        print(f"🔍 Detected language: {detected}")
    else:
        detected = requested_language.lower()

    # Step 2: Route
    is_ugandan = detected in SUNBIRD_LANGS

    if is_ugandan:
        print(f"🇺🇬 Routing {detected} to Sunbird local model")
        result = transcribe_sunbird(audio_path, detected)
        return result

    # International → Groq first
    if GROQ_API_KEY:
        try:
            print(f"🌍 Routing {detected} to Groq Whisper Large v3")
            result = transcribe_groq(audio_path, detected)
            if result.get("text"):
                return result
        except HTTPException as e:
            print(f"⚠️ Groq failed, falling back to Sunbird: {e.detail}")

    # Fallback: Sunbird anyway
    print(f"⚠️ Falling back to Sunbird for {detected}")
    return transcribe_sunbird(audio_path, detected)


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

        result = transcribe_smart(tmp_path, language, auto_detect=wants_auto)
        os.unlink(tmp_path)

        print(f"✅ [{result['language']}] {result['text'][:100]}")

        return {
            "text": result["text"],
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