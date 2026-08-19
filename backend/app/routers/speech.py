from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
import whisper
import tempfile
import os
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models
from deep_translator import GoogleTranslator
from langdetect import detect
from gtts import gTTS
from fastapi.responses import FileResponse
import json

router = APIRouter(prefix="/speech", tags=["speech"])

model = None

def get_model():
    global model
    if model is None:
        print("Loading Whisper model...")
        model = whisper.load_model("base")
        print("Model loaded!")
    return model

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

        whisper_model = get_model()
        result = whisper_model.transcribe(tmp_path)

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

        whisper_model = get_model()
        result = whisper_model.transcribe(tmp_path)
        os.unlink(tmp_path)

        detected_lang = result["language"]
        if source_language == "auto":
            try:
                detected_lang = detect(result["text"])
            except:
                detected_lang = result["language"]

        translator = GoogleTranslator(
            source=detected_lang,
            target=target_language
        )
        translated = translator.translate(result["text"])

        db_translation = models.Translation(
            user_id=current_user.id,
            source_text=result["text"],
            translated_text=translated,
            source_language=detected_lang,
            target_language=target_language,
            translation_type="voice"
        )
        db.add(db_translation)
        db.commit()

        return {
            "original_text": result["text"],
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

        whisper_model = get_model()
        result = whisper_model.transcribe(tmp_path)
        os.unlink(tmp_path)

        detected_lang = result["language"]
        if source_language == "auto":
            try:
                detected_lang = detect(result["text"])
            except:
                detected_lang = result["language"]

        translator = GoogleTranslator(
            source=detected_lang,
            target=target_language
        )
        translated = translator.translate(result["text"])

        tts = gTTS(text=translated, lang=target_language, slow=False)
        output_path = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3").name
        tts.save(output_path)

        db_translation = models.Translation(
            user_id=current_user.id,
            source_text=result["text"],
            translated_text=translated,
            source_language=detected_lang,
            target_language=target_language,
            translation_type="voice"
        )
        db.add(db_translation)
        db.commit()

        # Return JSON with base64 audio
        import base64
        with open(output_path, "rb") as f:
            audio_base64 = base64.b64encode(f.read()).decode("utf-8")
        os.unlink(output_path)

        return {
            "original_text": result["text"],
            "translated_text": translated,
            "source_language": detected_lang,
            "target_language": target_language,
            "audio_base64": audio_base64
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))