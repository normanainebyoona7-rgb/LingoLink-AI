"""Speech transcription — faster-whisper (Sunbird) locally, Groq on cloud"""
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

# Sunbird language codes (from the model card's language_map)
# Maps our app language names to Sunbird's 3-letter code
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

_whisper_model = None
_lang_map = None


def get_lang_map():
    """Load Sunbird's language_map.json (maps lug→sd, ach→su, etc.)"""
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
    """Load Sunbird faster-whisper model once, lazily"""
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


def transcribe_local(audio_path: str, language: str = None) -> dict:
    """Transcribe using local Sunbird faster-whisper (all African languages)"""
    model = get_whisper_model()
    if not model:
        raise HTTPException(status_code=500, detail="Local whisper model unavailable")

    # Resolve language code
    lang_code = None
    if language and language != "auto":
        lang_map = get_lang_map()
        sunbird_code = NAME_TO_SUNBIRD.get(language.lower())
        if lang_map and sunbird_code:
            lang_code = lang_map.get(sunbird_code)
            print(f"🎯 Language: {language} → sunbird={sunbird_code} → whisper={lang_code}")

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
        return {
            "text": text,
            "language": language or (info.language if info else "auto"),
        }
    except Exception as e:
        print(f"❌ Local whisper error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def transcribe_with_groq(audio_path: str, language: str = None) -> dict:
    """Groq Whisper Large v3 — used on Render (cloud)"""
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not set")

    try:
        url = "https://api.groq.com/openai/v1/audio/transcriptions"
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}

        groq_lang_codes = {
            "english": "en", "french": "fr", "spanish": "es", "german": "de",
            "portuguese": "pt", "italian": "it", "dutch": "nl", "russian": "ru",
            "arabic": "ar", "hindi": "hi", "chinese": "zh", "japanese": "ja",
            "korean": "ko", "turkish": "tr", "swahili": "sw",
        }

        with open(audio_path, "rb") as f:
            files = {"file": (os.path.basename(audio_path), f, "audio/webm")}
            data = {
                "model": "whisper-large-v3",
                "response_format": "json",
                "temperature": "0.0",
            }
            if language and language != "auto":
                code = groq_lang_codes.get(language.lower())
                if code:
                    data["language"] = code

            resp = requests.post(url, headers=headers, files=files, data=data, timeout=60)

        if resp.status_code == 200:
            result = resp.json()
            return {"text": result.get("text", "").strip(), "language": language or "auto"}
        else:
            print(f"❌ Groq Whisper error: {resp.status_code} - {resp.text[:300]}")
            raise HTTPException(status_code=500, detail=f"Groq Whisper failed: {resp.status_code}")
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=500, detail="Groq Whisper timed out")


def transcribe_audio_file(audio_path: str, language: str = None) -> dict:
    """Route to local whisper or Groq based on environment"""
    if IS_CLOUD:
        return transcribe_with_groq(audio_path, language)
    return transcribe_local(audio_path, language)


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = Form("auto"),
    auto_detect: str = Form("false"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        engine = "Groq" if IS_CLOUD else "Sunbird-local"
        is_auto = auto_detect.lower() == "true"
        print(f"🎤 Transcribing {len(content)} bytes via {engine} (lang={language}, auto={is_auto})...")

        if is_auto:
            # Force auto-detection: pass None so Whisper decides
            result = transcribe_audio_file(tmp_path, None)
            detected = result.get("language", "auto")
        else:
            result = transcribe_audio_file(tmp_path, language)
            detected = result.get("language", language)

        os.unlink(tmp_path)

        print(f"✅ Transcribed [{detected}]: {result['text'][:100]}")

        return {
            "text": result["text"],
            "language": detected,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))