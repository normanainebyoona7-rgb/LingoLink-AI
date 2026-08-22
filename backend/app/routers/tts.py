from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import tempfile
import os
from gtts import gTTS

router = APIRouter(prefix="/tts", tags=["text-to-speech"])

# ------------------------------------------------------------------
# MMS TTS codes for African languages (voice support)
# ------------------------------------------------------------------
MMS_CODES = {
    "luganda": "lug", "swahili": "swh", "kinyarwanda": "kin",
    "amharic": "amh", "somali": "som", "yoruba": "yor",
    "hausa": "hau", "shona": "sna", "chichewa": "nya",
    "rukiga": "nyn", "runyankole": "nyn", "kirundi": "kin",
    "acholi": "ach", "alur": "ach", "ateso": "teo",
    "oromo": "orm", "tigrinya": "tir", "kikuyu": "kik",
    "bemba": "bem", "lango": "ach", "lugbara": "ach",
    "adhola": "ach", "kumam": "ach", "karamojong": "teo",
    "lingala": "lin", "kikongo": "kon", "luba": "lua",
    "zulu": "zul", "xhosa": "xho", "afrikaans": "afr",
    "sesotho": "sot", "setswana": "tsn", "ndebele": "nde",
    "swati": "ssw", "venda": "ven", "tsonga": "tso",
    "kabyle": "kab", "tachelhit": "shi", "tamazight": "zgh",
}

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
        
        # Try MMS for African languages
        if lang in MMS_CODES:
            try:
                from transformers import VitsModel, VitsTokenizer
                import torch
                import numpy as np
                import soundfile as sf
                
                mms_lang = MMS_CODES[lang]
                model_name = f"facebook/mms-tts-{mms_lang}"
                model = VitsModel.from_pretrained(model_name)
                tokenizer = VitsTokenizer.from_pretrained(model_name)
                inputs = tokenizer(text, return_tensors="pt")
                with torch.no_grad():
                    output = model(**inputs).waveform
                audio_data = output.squeeze().numpy()
                output_path = tempfile.NamedTemporaryFile(delete=False, suffix=".wav").name
                sf.write(output_path, audio_data, 16000)
                return FileResponse(output_path, media_type="audio/wav", filename="tts.wav")
            except Exception as e:
                print(f"MMS failed for {lang}: {e}")
        
        # Final fallback English
        tts = gTTS(text=text, lang="en", slow=False)
        output_path = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3").name
        tts.save(output_path)
        return FileResponse(output_path, media_type="audio/mpeg", filename="tts_fallback.mp3")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))