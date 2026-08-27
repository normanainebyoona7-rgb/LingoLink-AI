from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import tempfile
import os
from gtts import gTTS

router = APIRouter(prefix="/tts", tags=["text-to-speech"])

# Cache for MMS models
_mms_models = {}
_mms_tokenizers = {}

MMS_CODES = {
    "luganda": "lug", "swahili": "swh", "kinyarwanda": "kin",
    "amharic": "amh", "somali": "som", "yoruba": "yor",
    "hausa": "hau", "shona": "sna", "chichewa": "nya",
    "rukiga": "nyn", "runyankole": "nyn", "kirundi": "kin",
    "acholi": "ach", "alur": "ach", "ateso": "teo",
    "oromo": "orm", "tigrinya": "tir", "kikuyu": "kik",
    "bemba": "bem", "lango": "ach", "lugbara": "ach",
}

def get_mms_model(mms_lang):
    """Get cached MMS model or load and cache it"""
    if mms_lang not in _mms_models:
        print(f"Loading MMS model for {mms_lang} (first time only)...")
        from transformers import VitsModel, VitsTokenizer
        model_name = f"facebook/mms-tts-{mms_lang}"
        _mms_models[mms_lang] = VitsModel.from_pretrained(model_name)
        _mms_tokenizers[mms_lang] = VitsTokenizer.from_pretrained(model_name)
        print(f"MMS model for {mms_lang} loaded and cached!")
    return _mms_models[mms_lang], _mms_tokenizers[mms_lang]

@router.post("/speak")
async def speak(text: str, language: str = "english", voice: str = "female"):
    try:
        lang = language.lower()

        # Try gTTS first (fast for major languages)
        try:
            if voice == "male":
                tts = gTTS(text=text, lang=lang, slow=False, tld="co.uk")
            else:
                tts = gTTS(text=text, lang=lang, slow=False)
            output_path = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3").name
            tts.save(output_path)
            return FileResponse(output_path, media_type="audio/mpeg", filename="tts.mp3")
        except:
            pass

        # Try MMS for African languages (cached)
        if lang in MMS_CODES:
            try:
                import torch
                import numpy as np
                import soundfile as sf

                mms_lang = MMS_CODES[lang]
                model, tokenizer = get_mms_model(mms_lang)

                inputs = tokenizer(text, return_tensors="pt")
                with torch.no_grad():
                    output = model(**inputs).waveform
                audio_data = output.squeeze().numpy()
                output_path = tempfile.NamedTemporaryFile(delete=False, suffix=".wav").name
                sf.write(output_path, audio_data, 16000)
                return FileResponse(output_path, media_type="audio/wav", filename="tts.wav")
            except Exception as e:
                print(f"MMS failed for {lang}: {e}")

        # Fallback English
        tts = gTTS(text=text, lang="en", slow=False)
        output_path = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3").name
        tts.save(output_path)
        return FileResponse(output_path, media_type="audio/mpeg", filename="tts_fallback.mp3")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))