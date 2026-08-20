from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
import whisper
import tempfile
import os
import subprocess
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models
from deep_translator import GoogleTranslator
from langdetect import detect

router = APIRouter(prefix="/video", tags=["video"])

model = None

def get_model():
    global model
    if model is None:
        print("Loading Whisper model...")
        model = whisper.load_model("base")
        print("Model loaded!")
    return model

@router.post("/extract-subtitles")
async def extract_subtitles(
    file: UploadFile = File(...),
    target_language: str = "en",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        # Save uploaded video
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
            content = await file.read()
            tmp.write(content)
            video_path = tmp.name

        # Extract audio using FFmpeg
        audio_path = tempfile.NamedTemporaryFile(delete=False, suffix=".wav").name

        subprocess.run(
            ["ffmpeg", "-i", video_path, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audio_path],
            capture_output=True,
            check=True
        )

        # Transcribe audio
        whisper_model = get_model()
        result = whisper_model.transcribe(audio_path)

        # Build subtitles
        subtitles = []
        for segment in result["segments"]:
            subtitles.append({
                "start": segment["start"],
                "end": segment["end"],
                "text": segment["text"].strip()
            })

        # Detect language
        detected_lang = result["language"]
        try:
            if result["text"]:
                detected_lang = detect(result["text"])
        except:
            pass

        # Translate all subtitle text
        translated_subtitles = []
        full_text = " ".join([s["text"] for s in subtitles])

        if target_language != detected_lang:
            translator = GoogleTranslator(source=detected_lang, target=target_language)
            translated_text = translator.translate(full_text)
        else:
            translated_text = full_text

        # Save to database
        db_translation = models.Translation(
            user_id=current_user.id,
            source_text=full_text[:1000],
            translated_text=translated_text[:1000],
            source_language=detected_lang,
            target_language=target_language,
            translation_type="video"
        )
        db.add(db_translation)
        db.commit()

        # Clean up
        os.unlink(video_path)
        os.unlink(audio_path)

        return {
            "detected_language": detected_lang,
            "target_language": target_language,
            "subtitles": subtitles,
            "translated_text": translated_text,
            "segment_count": len(subtitles),
            "video_duration": result["segments"][-1]["end"] if result["segments"] else 0
        }
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"FFmpeg error: {e.stderr.decode()}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-srt")
async def generate_srt(
    file: UploadFile = File(...),
    target_language: str = "en",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        # Save uploaded video
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
            content = await file.read()
            tmp.write(content)
            video_path = tmp.name

        # Extract audio
        audio_path = tempfile.NamedTemporaryFile(delete=False, suffix=".wav").name

        subprocess.run(
            ["ffmpeg", "-i", video_path, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audio_path],
            capture_output=True,
            check=True
        )

        # Transcribe
        whisper_model = get_model()
        result = whisper_model.transcribe(audio_path)

        detected_lang = result["language"]
        try:
            if result["text"]:
                detected_lang = detect(result["text"])
        except:
            pass

        # Build SRT content
        srt_lines = []
        for i, segment in enumerate(result["segments"], 1):
            start = segment["start"]
            end = segment["end"]
            text = segment["text"].strip()

            # Translate if needed
            if target_language != detected_lang:
                translator = GoogleTranslator(source=detected_lang, target=target_language)
                text = translator.translate(text)

            # Format SRT timestamp
            start_str = format_timestamp(start)
            end_str = format_timestamp(end)

            srt_lines.append(f"{i}\n{start_str} --> {end_str}\n{text}\n")

        srt_content = "\n".join(srt_lines)

        # Clean up
        os.unlink(video_path)
        os.unlink(audio_path)

        return {
            "detected_language": detected_lang,
            "target_language": target_language,
            "srt_content": srt_content
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def format_timestamp(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"