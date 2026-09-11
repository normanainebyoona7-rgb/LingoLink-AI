"""Ultra-fast translation with Sunbird Sunflower (Ugandan) + Groq + Google"""
import requests
import re
import threading
import time
import os
from typing import Optional, Dict
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
SUNBIRD_API_KEY = os.getenv("SUNBIRD_API_KEY", "")

_cache: Dict[str, str] = {}
_cache_lock = threading.Lock()

# Languages Sunbird Sunflower supports well
SUNBIRD_LANGS = {
    "luganda", "acholi", "ateso", "runyankole", "rukiga", "lugbara",
    "lusoga", "rutooro", "lumasaba"
}

# Languages with poor translation quality across all engines
POOR_SUPPORT_LANGS = {"alur", "lango", "lugwere", "dholuo", "kikuyu"}

def clean(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip().strip('"').strip("'")

def is_bad_translation(original: str, result: str) -> bool:
    """Detect hallucinations, repetition loops, and untranslated output"""
    if not result or len(result.strip()) < 1:
        return True
    
    if original.lower().strip() in result.lower():
        return True
    
    words = result.lower().split()
    for w in set(words):
        if len(w) > 2 and words.count(w) > 2:
            return True
    
    if result.lower().strip() == original.lower().strip():
        return True
    
    return False

def sunbird_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Sunbird AI Sunflower - for Ugandan languages"""
    if not SUNBIRD_API_KEY:
        return None
    
    try:
        sunbird_codes = {
            "luganda": ("Luganda", "lug"),
            "acholi": ("Acholi", "ach"),
            "ateso": ("Ateso", "teo"),
            "runyankole": ("Runyankole", "nyn"),
            "rukiga": ("Rukiga", "cgg"),
            "lugbara": ("Lugbara", "lgg"),
            "lusoga": ("Lusoga", "xog"),
            "rutooro": ("Rutooro", "ttj"),
            "lumasaba": ("Lumasaba", "myx"),
            "swahili": ("Swahili", "swa"),
            "kinyarwanda": ("Kinyarwanda", "kin"),
        }
        
        if target_lang not in sunbird_codes:
            return None
        
        target_name, code = sunbird_codes[target_lang]
        
        prompt = f"Translate the following English text to {target_name}. Return ONLY the {target_name} translation, no explanation:\n\n{text}"
        
        url = "https://api.sunbird.ai/tasks/sunflower_inference"
        headers = {
            "Authorization": f"Bearer {SUNBIRD_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "messages": [{"role": "user", "content": prompt}],
            "target_language": code,
            "temperature": 0.1
        }
        
        resp = requests.post(url, headers=headers, json=payload, timeout=20)
        
        if resp.status_code == 200:
            data = resp.json()
            result = data.get("content", "")
            result = clean(result)
            
            if is_bad_translation(text, result):
                print(f"⚠️ Sunbird returned bad output: {result}")
                return None
            
            if result:
                return result
        else:
            print(f"Sunbird error: {resp.status_code} - {resp.text[:200]}")
    except Exception as e:
        print(f"Sunbird error: {e}")
    return None

def groq_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Groq - fast LLM translation fallback"""
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
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": f"You are a native {target_name} translator. Translate the user's text to {target_name}. Output ONLY the translation. No explanations, no notes, no original text."},
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
            if result and not is_bad_translation(text, result):
                return result
    except Exception as e:
        print(f"Groq error: {e}")
    return None

def google_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Google Translate free API - for major languages"""
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
    """Priority: Sunbird (Ugandan) → Google (major) → Groq (fallback) → error message"""
    if not text or not text.strip():
        return None
    
    cache_key = f"{source_lang}:{target_lang}:{text[:100]}"
    with _cache_lock:
        if cache_key in _cache:
            return _cache[cache_key]
    
    # Languages with no reliable translation engine
    if target_lang in POOR_SUPPORT_LANGS:
        msg = f"[{target_lang.capitalize()} translation not yet supported. Original: {text}]"
        with _cache_lock:
            _cache[cache_key] = msg
        return msg
    
    # 1. Sunbird Sunflower for Ugandan languages
    if source_lang in SUNBIRD_LANGS or target_lang in SUNBIRD_LANGS:
        start = time.time()
        result = sunbird_translate(text, target_lang, source_lang)
        if result:
            with _cache_lock:
                _cache[cache_key] = result
            print(f"⚡ Sunbird responded in {time.time()-start:.1f}s")
            return result
        # Sunbird failed → Groq fallback
        start = time.time()
        result = groq_translate(text, target_lang, source_lang)
        if result:
            with _cache_lock:
                _cache[cache_key] = result
            print(f"⚡ Groq (Sunbird fallback) responded in {time.time()-start:.1f}s")
            return result
    
    # 2. Google for major languages
    start = time.time()
    result = google_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ Google responded in {time.time()-start:.1f}s")
        return result
    
    # 3. Groq final fallback
    start = time.time()
    result = groq_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ Groq responded in {time.time()-start:.1f}s")
        return result
    
    return None