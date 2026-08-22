from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
import tempfile
import os
import requests
import base64
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models
import langid
from gtts import gTTS

router = APIRouter(prefix="/speech", tags=["speech"])

model = None

def get_model():
    global model
    if model is None:
        print("Loading faster-whisper small model...")
        from faster_whisper import WhisperModel
        model = WhisperModel("small", device="cpu", compute_type="int8")
        print("Model loaded!")
    return model

def fast_translate(text, source_lang, target_lang):
    url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={source_lang}&tl={target_lang}&dt=t&q={text[:500]}"
    resp = requests.get(url, timeout=5)
    data = resp.json()
    return "".join([part[0] for part in data[0] if part[0]])

def transcribe_audio_file(audio_path):
    """Transcribe using faster-whisper with fallback to Google"""
    try:
        whisper_model = get_model()
        segments, info = whisper_model.transcribe(
            audio_path,
            beam_size=1,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        
        text_parts = [s.text.strip() for s in segments]
        full_text = " ".join(text_parts)
        
        detected_lang = info.language
        try:
            if full_text.strip():
                detected_lang = langid.classify(full_text)[0]
        except:
            pass
        
        return {"text": full_text, "language": detected_lang}
    except Exception as e:
        # Fallback to Google Speech Recognition
        try:
            import speech_recognition as sr
            recognizer = sr.Recognizer()
            with sr.AudioFile(audio_path) as source:
                audio = recognizer.record(source)
            text = recognizer.recognize_google(audio)
            detected_lang = "en"
            try:
                detected_lang = langid.classify(text)[0]
            except:
                pass
            return {"text": text, "language": detected_lang}
        except:
            raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        result = transcribe_audio_file(tmp_path)
        os.unlink(tmp_path)

        return {
            "text": result["text"],
            "language": result["language"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/translate-voice")
async def translate_voice(
    file: UploadFile = File(...),
    source_language: str = "auto",
    target_language: str = "en",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        result = transcribe_audio_file(tmp_path)
        os.unlink(tmp_path)

        full_text = result["text"]
        detected_lang = result["language"]

        if source_language != "auto":
            detected_lang = source_language

        if full_text.strip():
            translated = fast_translate(full_text, detected_lang, target_language)
        else:
            translated = ""

        db_translation = models.Translation(
            user_id=current_user.id,
            source_text=full_text,
            translated_text=translated,
            source_language=detected_lang,
            target_language=target_language,
            translation_type="voice"
        )
        db.add(db_translation)
        db.commit()

        return {
            "original_text": full_text,
            "translated_text": translated,
            "source_language": detected_lang,
            "target_language": target_language
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/voice-to-voice")
async def voice_to_voice(
    file: UploadFile = File(...),
    source_language: str = "auto",
    target_language: str = "en",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        result = transcribe_audio_file(tmp_path)
        os.unlink(tmp_path)

        full_text = result["text"]
        detected_lang = result["language"]

        if source_language != "auto":
            detected_lang = source_language

        if full_text.strip():
            translated = fast_translate(full_text, detected_lang, target_language)
        else:
            translated = ""

        tts = gTTS(text=translated, lang=target_language, slow=False)
        output_path = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3").name
        tts.save(output_path)

        db_translation = models.Translation(
            user_id=current_user.id,
            source_text=full_text,
            translated_text=translated,
            source_language=detected_lang,
            target_language=target_language,
            translation_type="voice"
        )
        db.add(db_translation)
        db.commit()

        with open(output_path, "rb") as f:
            audio_base64 = base64.b64encode(f.read()).decode("utf-8")
        os.unlink(output_path)

        return {
            "original_text": full_text,
            "translated_text": translated,
            "source_language": detected_lang,
            "target_language": target_language,
            "audio_base64": audio_base64
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))