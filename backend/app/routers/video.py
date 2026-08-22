from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
import tempfile
import os
import subprocess
import requests
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models
import langid

router = APIRouter(prefix="/video", tags=["video"])

FFMPEG_PATH = "C:\\ffmpeg\\bin\\ffmpeg.exe"

model = None

def get_model():
    global model
    if model is None:
        print("Loading faster-whisper tiny model...")
        from faster_whisper import WhisperModel
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        print("Model loaded!")
    return model

def fast_translate(text, source_lang, target_lang):
    url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={source_lang}&tl={target_lang}&dt=t&q={text[:500]}"
    resp = requests.get(url, timeout=5)
    data = resp.json()
    return "".join([part[0] for part in data[0] if part[0]])

@router.post("/extract-subtitles")
async def extract_subtitles(
    file: UploadFile = File(...),
    target_language: str = "en",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
            content = await file.read()
            tmp.write(content)
            video_path = tmp.name

        audio_path = tempfile.NamedTemporaryFile(delete=False, suffix=".wav").name

        subprocess.run(
            [FFMPEG_PATH, "-i", video_path, "-t", "20", "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audio_path],
            capture_output=True,
            check=True,
            timeout=120
        )

        whisper_model = get_model()
        segments, info = whisper_model.transcribe(
            audio_path,
            beam_size=1,
            vad_filter=True
        )

        subtitles = []
        full_text_parts = []
        for segment in segments:
            subtitles.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip()
            })
            full_text_parts.append(segment.text.strip())

        full_text = " ".join(full_text_parts)

        detected_lang = info.language
        try:
            if full_text:
                detected_lang = langid.classify(full_text)[0]
        except:
            pass

        if target_language != detected_lang and full_text.strip():
            translated_text = fast_translate(full_text[:500], detected_lang, target_language)
        else:
            translated_text = full_text[:500]

        db_translation = models.Translation(
            user_id=current_user.id,
            source_text=full_text[:500],
            translated_text=translated_text[:500],
            source_language=detected_lang,
            target_language=target_language,
            translation_type="video"
        )
        db.add(db_translation)
        db.commit()

        os.unlink(video_path)
        os.unlink(audio_path)

        return {
            "detected_language": detected_lang,
            "target_language": target_language,
            "subtitles": subtitles,
            "translated_text": translated_text,
            "segment_count": len(subtitles),
            "video_duration": subtitles[-1]["end"] if subtitles else 0,
            "note": "Processed first 20 seconds with faster-whisper"
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="FFmpeg processing timed out")
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"FFmpeg error: {e.stderr.decode()}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))