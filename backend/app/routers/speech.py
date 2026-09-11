from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
import tempfile
import os
import requests
import base64
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models
from app.fast_translate import fast_translate
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/speech", tags=["speech"])

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

def transcribe_with_groq(audio_path: str) -> dict:
    """Use Groq Whisper API - fast and works on Render free tier"""
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not set")
    
    try:
        url = "https://api.groq.com/openai/v1/audio/transcriptions"
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
        
        with open(audio_path, "rb") as f:
            files = {"file": (os.path.basename(audio_path), f, "audio/webm")}
            data = {"model": "whisper-large-v3", "response_format": "json"}
            
            resp = requests.post(url, headers=headers, files=files, data=data, timeout=60)
        
        if resp.status_code == 200:
            result = resp.json()
            return {"text": result.get("text", "").strip(), "language": "auto"}
        else:
            print(f"❌ Groq Whisper error: {resp.status_code} - {resp.text[:300]}")
            raise HTTPException(status_code=500, detail=f"Groq Whisper failed: {resp.status_code}")
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=500, detail="Groq Whisper timed out")

@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        print(f"🎤 Transcribing {len(content)} bytes...")
        result = transcribe_with_groq(tmp_path)
        os.unlink(tmp_path)
        
        print(f"✅ Transcribed: {result['text'][:100]}")
        
        return {
            "text": result["text"],
            "language": result["language"]
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
    current_user: models.User = Depends(get_current_user)
):
    try:
        suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        result = transcribe_with_groq(tmp_path)
        os.unlink(tmp_path)
        
        full_text = result["text"]
        translated = ""
        
        if full_text.strip():
            translated = fast_translate(full_text, target_language, source_language) or full_text
        
        db_translation = models.Translation(
            user_id=current_user.id,
            source_text=full_text,
            translated_text=translated,
            source_language=source_language,
            target_language=target_language,
            translation_type="voice"
        )
        db.add(db_translation)
        db.commit()
        
        return {
            "original_text": full_text,
            "translated_text": translated,
            "source_language": source_language,
            "target_language": target_language
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
    current_user: models.User = Depends(get_current_user)
):
    try:
        suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        result = transcribe_with_groq(tmp_path)
        os.unlink(tmp_path)
        
        full_text = result["text"]
        translated = ""
        
        if full_text.strip():
            translated = fast_translate(full_text, target_language, source_language) or full_text
        
        db_translation = models.Translation(
            user_id=current_user.id,
            source_text=full_text,
            translated_text=translated,
            source_language=source_language,
            target_language=target_language,
            translation_type="voice"
        )
        db.add(db_translation)
        db.commit()
        
        return {
            "original_text": full_text,
            "translated_text": translated,
            "source_language": source_language,
            "target_language": target_language
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))