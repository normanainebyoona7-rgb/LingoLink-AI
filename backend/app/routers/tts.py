from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from gtts import gTTS
import tempfile
import os

router = APIRouter(prefix="/tts", tags=["text-to-speech"])

@router.post("/speak")
async def speak(text: str, language: str = "en"):
    try:
        tts = gTTS(text=text, lang=language, slow=False)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
            tmp_path = tmp.name

        tts.save(tmp_path)

        return FileResponse(
            tmp_path,
            media_type="audio/mpeg",
            filename="translation.mp3"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))