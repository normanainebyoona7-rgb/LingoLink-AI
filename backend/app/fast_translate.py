"""Ultra-fast translation using Groq (primary) + Google Translate (fallback)"""
import requests
import re
import threading
import time
import os
from typing import Optional, Dict
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

_cache: Dict[str, str] = {}
_cache_lock = threading.Lock()

def clean(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip().strip('"').strip("'")

def groq_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Groq - ultra fast LLM translation"""
    if not GROQ_API_KEY:
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
            "portuguese": "Portuguese", "italian": "Italian",
            "dutch": "Dutch", "russian": "Russian", "arabic": "Arabic",
            "hindi": "Hindi", "chinese": "Chinese", "japanese": "Japanese",
            "korean": "Korean", "turkish": "Turkish",
        }
        target_name = lang_names.get(target_lang, target_lang.capitalize())
        
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama-3.1-8b-instant",
            "messages": [
                {"role": "system", "content": f"Translate to {target_name}. Output ONLY the translation. No explanations, no notes, no original text."},
                {"role": "user", "content": text}
            ],
            "temperature": 0.1,
            "max_tokens": 2000
        }
        
        resp = requests.post(url, headers=headers, json=payload, timeout=15)
        
        if resp.status_code == 200:
            data = resp.json()
            result = data["choices"][0]["message"]["content"]
            result = clean(result)
            if result and result.lower() != text.lower():
                return result
        else:
            print(f"Groq error: {resp.status_code} - {resp.text[:200]}")
    except Exception as e:
        print(f"Groq error: {e}")
    return None

def google_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Google Translate free API - fallback"""
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

def fast_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Google first (fastest for major languages), Groq second (African languages)"""
    if not text or not text.strip():
        return None
    
    cache_key = f"{source_lang}:{target_lang}:{text[:100]}"
    with _cache_lock:
        if cache_key in _cache:
            return _cache[cache_key]
    
    african_langs = {"luganda", "acholi", "alur", "ateso", "rukiga", "runyankole",
                     "lusoga", "lugwere", "lango", "lugbara", "dholuo", "kikuyu",
                     "kinyarwanda", "kirundi", "oromo", "tigrinya", "igbo", "bemba",
                     "lingala", "kikongo", "shona", "chichewa"}
    
    # For African languages, use Groq (Google doesn't support them)
    if source_lang in african_langs or target_lang in african_langs:
        start = time.time()
        result = groq_translate(text, target_lang, source_lang)
        if result:
            with _cache_lock:
                _cache[cache_key] = result
            print(f"⚡ Groq responded in {time.time()-start:.1f}s")
            return result
    
    # Google first for major languages (fastest)
    start = time.time()
    result = google_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ Google responded in {time.time()-start:.1f}s")
        return result
    
    # Groq as fallback
    start = time.time()
    result = groq_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ Groq responded in {time.time()-start:.1f}s")
        return result
    
    return None