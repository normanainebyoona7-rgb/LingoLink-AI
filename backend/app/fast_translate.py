"""Fast translation using Google Translate + Gemini (cloud-only)"""
import requests
import re
import threading
import time
import os
from typing import Optional, Dict
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

_cache: Dict[str, str] = {}
_cache_lock = threading.Lock()

def clean(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip().strip('"').strip("'")

def google_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Google Translate free API - PRIMARY"""
    try:
        lang_codes = {
            "english": "en", "french": "fr", "spanish": "es", "german": "de",
            "swahili": "sw", "kinyarwanda": "rw", "kirundi": "rn",
            "amharic": "am", "somali": "so", "yoruba": "yo", "hausa": "ha",
            "igbo": "ig", "shona": "sn", "chichewa": "ny", "afrikaans": "af",
            "zulu": "zu", "xhosa": "xh", "portuguese": "pt", "italian": "it",
            "dutch": "nl", "russian": "ru", "arabic": "ar", "hindi": "hi",
            "chinese": "zh-CN", "japanese": "ja", "korean": "ko",
            "turkish": "tr", "vietnamese": "vi", "thai": "th",
            "indonesian": "id", "greek": "el", "polish": "pl",
            "swedish": "sv", "danish": "da", "finnish": "fi",
            "norwegian": "no", "czech": "cs", "romanian": "ro",
            "hungarian": "hu", "ukrainian": "uk", "persian": "fa",
        }
        
        tgt = lang_codes.get(target_lang)
        if not tgt:
            return None
        
        src = lang_codes.get(source_lang, "auto")
        
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={src}&tl={tgt}&dt=t&q={requests.utils.quote(text)}"
        resp = requests.get(url, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            result = "".join([part[0] for part in data[0] if part[0]])
            if result and result != text:
                return clean(result)
    except:
        pass
    return None

def gemini_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Gemini 3.6 Flash for African languages (Luganda, Alur, Ateso, Rukiga, etc.)"""
    if not GEMINI_API_KEY:
        return None
    
    try:
        lang_names = {
            "english": "English", "luganda": "Luganda", "swahili": "Swahili",
            "french": "French", "spanish": "Spanish", "german": "German",
            "acholi": "Acholi", "alur": "Alur", "ateso": "Ateso",
            "rukiga": "Rukiga", "runyankole": "Runyankole",
            "kinyarwanda": "Kinyarwanda", "kirundi": "Kirundi",
            "amharic": "Amharic", "somali": "Somali", "oromo": "Oromo",
            "yoruba": "Yoruba", "hausa": "Hausa", "igbo": "Igbo",
            "zulu": "Zulu", "xhosa": "Xhosa", "shona": "Shona",
            "chichewa": "Chichewa", "afrikaans": "Afrikaans",
        }
        target_name = lang_names.get(target_lang, target_lang.capitalize())
        
        prompt = f"Translate to {target_name}: {text}"
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={GEMINI_API_KEY}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": 500, "temperature": 0.2}
        }
        
        resp = requests.post(url, json=payload, timeout=30)
        
        if resp.status_code == 200:
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates:
                result = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                result = clean(result)
                if result and result.lower() != text.lower():
                    return result
    except Exception as e:
        print(f"Gemini error: {e}")
    return None

def fast_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Google first (fast), Gemini second (African languages)"""
    if not text or not text.strip():
        return None
    
    cache_key = f"{source_lang}:{target_lang}:{text[:100]}"
    with _cache_lock:
        if cache_key in _cache:
            return _cache[cache_key]
    
    # 1. Google Translate (fast, major languages)
    start = time.time()
    result = google_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ Google responded in {time.time()-start:.1f}s")
        return result
    
    # 2. Gemini (African languages)
    result = gemini_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ Gemini responded in {time.time()-start:.1f}s")
        return result
    
    return None