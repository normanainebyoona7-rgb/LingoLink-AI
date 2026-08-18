from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
import whisper
import tempfile
import os
from app.database import get_db
import app.models as models
from deep_translator import GoogleTranslator

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
    db: Session = Depends(get_db)
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
    target_language: str = "en"
):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        whisper_model = get_model()
        result = whisper_model.transcribe(tmp_path)

        translator = GoogleTranslator(
            source=source_language,
            target=target_language
        )
        translated = translator.translate(result["text"])

        os.unlink(tmp_path)

        return {
            "original_text": result["text"],
            "translated_text": translated,
            "source_language": result["language"],
            "target_language": target_language
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))