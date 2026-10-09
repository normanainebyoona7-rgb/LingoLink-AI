"""Speech transcription — Sunbird STT API + Groq Whisper fallback"""
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
SUNBIRD_API_KEY = os.getenv("SUNBIRD_API_KEY", "")
IS_CLOUD = os.getenv("RENDER", "") == "true" or os.getenv("IS_CLOUD", "") == "true"

SUNBIRD_REPO = "Sunbird/faster-whisper-51-african-languages"

SUNBIRD_LANGS = {
    "luganda", "acholi", "ateso", "runyankole", "runyankore", "rukiga",
    "lugbara", "lusoga", "rutooro", "lumasaba", "alur", "lango",
    "lugwere", "jopadhola", "swahili", "kinyarwanda",
}

GROQ_UNSUPPORTED = {
    "luganda", "acholi", "ateso", "runyankole", "runyankore", "rukiga",
    "lugbara", "lusoga", "rutooro", "lumasaba", "alur", "lango",
    "lugwere", "jopadhola",
}

NAME_TO_SUNBIRD = {
    "luganda": "lug", "acholi": "ach", "ateso": "teo",
    "runyankole": "nyn", "runyankore": "nyn", "rukiga": "cgg",
    "lugbara": "lgg", "lusoga": "xog", "rutooro": "ttj",
    "lumasaba": "myx", "alur": "alz", "lango": "laj",
    "lugwere": "gwr", "jopadhola": "adh", "swahili": "swa",
    "kinyarwanda": "kin",
}

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
    "lug": "luganda", "ach": "acholi", "teo": "ateso",
    "nyn": "runyankole", "cgg": "rukiga", "lgg": "lugbara",
    "xog": "lusoga", "ttj": "rutooro", "myx": "lumasaba",
    "alz": "alur", "laj": "lango", "gwr": "lugwere", "adh": "jopadhola",
    "kin": "kinyarwanda",
}

HALLUCINATIONS = {
    "thank you", "thank you.", "thanks", "thanks.",
    "subtitles by", "subtitle by", "subtitles:", "please subscribe",
    "amara.org", "mbc", "sbs", "abc",
    "♪", "♪♪", "[music]", "[silence]", "(silence)",
    ".", ",", "!", "?",
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
        print(f"Sunbird language map loaded ({len(_lang_map)} languages)")
        return _lang_map
    except Exception as e:
        print(f"Failed to load Sunbird language map: {e}")
        return None


def get_whisper_model():
    global _whisper_model, _sunbird_load_attempted
    if IS_CLOUD:
        return None
    if _whisper_model is not None:
        return _whisper_model
    if _sunbird_load_attempted:
        return None
    _sunbird_load_attempted = True
    try:
        from faster_whisper import WhisperModel
        print("Loading Sunbird faster-whisper model (CPU, int8)...")
        _whisper_model = WhisperModel(SUNBIRD_REPO, device="cpu", compute_type="int8")
        print("Sunbird local model loaded")
        return _whisper_model
    except Exception as e:
        print(f"Sunbird local model unavailable: {e}")
        return None


def is_hallucination(text: str) -> bool:
    if not text:
        return True
    cleaned = text.strip().lower()
    if len(cleaned) < 2:
        return True
    if cleaned in HALLUCINATIONS:
        return True
    if all(c in ".!?,;:-\"'" for c in cleaned):
        return True
    words = cleaned.split()
    if len(words) >= 2 and len(set(words)) == 1:
        return True
    return False


def convert_to_16k_mono(input_path: str) -> str:
    """
    Convert audio to 16kHz mono MP3 for smaller upload to Sunbird.
    MP3 at 32kbps is ~10x smaller than WAV, which Sunbird handles better.
    """
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(input_path)
        audio = audio.set_frame_rate(16000).set_channels(1)
        output_path = input_path.rsplit(".", 1)[0] + "_16k.mp3"
        audio.export(output_path, format="mp3", bitrate="32k")
        print(f"Converted to 16kHz mono MP3: {os.path.getsize(output_path)} bytes")
        return output_path
    except Exception as e:
        print(f"Audio conversion failed: {e}")
        return input_path


def transcribe_sunbird_api(audio_path: str, language: str = None) -> dict:
    if not SUNBIRD_API_KEY:
        raise HTTPException(status_code=500, detail="SUNBIRD_API_KEY not set")

    original_size = os.path.getsize(audio_path)
    if original_size < 5000:
        print(f"Audio too short: {original_size} bytes")
        return {"text": "", "language": "auto"}

    converted = convert_to_16k_mono(audio_path)

    url = "https://api.sunbird.ai/tasks/stt"
    headers = {"Authorization": f"Bearer {SUNBIRD_API_KEY}"}

    if language and language.lower() in NAME_TO_SUNBIRD:
        sunbird_lang = NAME_TO_SUNBIRD[language.lower()]
    else:
        sunbird_lang = "lug"

    try:
        with open(converted, "rb") as f:
            files = {"audio": (os.path.basename(converted), f, "audio/mp3")}
            data = {"language": sunbird_lang}
            print(f"Sunbird STT: lang={sunbird_lang}, size={os.path.getsize(converted)} bytes")
            resp = requests.post(url, files=files, data=data, headers=headers, timeout=(20, 120))
    except requests.exceptions.Timeout:
        print(f"Sunbird STT timeout for {language}")
        raise HTTPException(status_code=504, detail="Sunbird STT timed out")
    except Exception as e:
        print(f"Sunbird STT request failed: {e}")
        raise HTTPException(status_code=500, detail=f"Sunbird request failed: {e}")
    finally:
        if converted != audio_path:
            try:
                os.unlink(converted)
            except Exception:
                pass

    if resp.status_code == 200:
        result = resp.json()
        text = (
            result.get("audio_transcription")
            or result.get("text")
            or result.get("transcription")
            or ""
        ).strip()
        detected = result.get("language", language or "auto")
        if detected in ISO_TO_NAME:
            detected = ISO_TO_NAME[detected]
        print(f"Sunbird STT OK: [{detected}] {text[:80]}")
        return {"text": text, "language": detected}
    else:
        print(f"Sunbird STT error {resp.status_code}: {resp.text[:200]}")
        raise HTTPException(status_code=500, detail=f"Sunbird STT failed: {resp.status_code}")


def transcribe_sunbird_local(audio_path: str, language: str = None) -> dict:
    model = get_whisper_model()
    if not model:
        raise HTTPException(status_code=503, detail="Local model not available")

    lang_code = None
    if language and language not in ("auto", None):
        lang_map = get_lang_map()
        sunbird_code = NAME_TO_SUNBIRD.get(language.lower())
        if lang_map and sunbird_code:
            lang_code = lang_map.get(sunbird_code)

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
        if detected in ISO_TO_NAME:
            detected = ISO_TO_NAME[detected]
        return {"text": text, "language": detected}
    except Exception as e:
        print(f"Local model error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def transcribe_groq(audio_path: str, language: str = None) -> dict:
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
                "prompt": " ",
            }

            if language and language not in ("auto", None):
                lang_lower = language.lower()
                if lang_lower in GROQ_UNSUPPORTED:
                    print(f"Groq: skipping language hint for {language} (unsupported)")
                else:
                    iso_map = {v: k for k, v in ISO_TO_NAME.items()}
                    iso = iso_map.get(lang_lower)
                    if iso:
                        data["language"] = iso
                        print(f"Groq: {language} -> iso={iso}")

            resp = requests.post(url, headers=headers, files=files, data=data, timeout=(10, 60))

        if resp.status_code == 200:
            result = resp.json()
            text = result.get("text", "").strip()
            detected_iso = (result.get("language") or "").lower()
            detected_name = ISO_TO_NAME.get(detected_iso, language or "auto")
            return {"text": text, "language": detected_name}
        else:
            print(f"Groq error {resp.status_code}: {resp.text[:200]}")
            raise HTTPException(status_code=500, detail=f"Groq failed: {resp.status_code}")
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Groq timed out")


def transcribe_smart(audio_path: str, requested_language: str = None, auto_detect: bool = True) -> dict:
    if SUNBIRD_API_KEY:
        try:
            print(f"Trying Sunbird STT: lang={requested_language or 'auto'}")
            return transcribe_sunbird_api(audio_path, requested_language)
        except HTTPException as e:
            print(f"Sunbird STT failed ({e.detail}), falling back to Groq")

    return transcribe_groq(audio_path, requested_language)


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
        print(f"Transcribing {len(content)} bytes (lang={language}, auto={wants_auto})...")

        if len(content) < 5000:
            os.unlink(tmp_path)
            print("Skipped: audio too small")
            return {"text": "", "language": "auto"}

        result = transcribe_smart(tmp_path, language, auto_detect=wants_auto)

        try:
            os.unlink(tmp_path)
        except Exception:
            pass

        text = result.get("text", "").strip()

        if is_hallucination(text):
            print(f"Rejected hallucination: '{text}'")
            return {"text": "", "language": "auto"}

        print(f"Final: [{result['language']}] {text[:100]}")

        return {"text": text, "language": result["language"]}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Transcription error: {e}")
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

        try:
            os.unlink(tmp_path)
        except Exception:
            pass

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

        try:
            os.unlink(tmp_path)
        except Exception:
            pass

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