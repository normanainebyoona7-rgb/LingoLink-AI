"""Sunbird for Ugandan languages + Google for international"""
import requests
import re
import threading
import time
import os
from typing import Optional, Dict
from dotenv import load_dotenv

load_dotenv()

SUNBIRD_API_KEY = os.getenv("SUNBIRD_API_KEY", "")

_cache: Dict[str, str] = {}
_cache_lock = threading.Lock()

UGANDAN_LANGS = {
    "luganda", "acholi", "ateso", "runyankole", "rukiga", "lugbara",
    "lusoga", "rutooro", "lumasaba", "alur", "lango", "jopadhola", "lugwere"
}

def clean(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip().strip('"').strip("'")

def is_bad_translation(original: str, result: str) -> bool:
    """Detect hallucinations from casual LLMs"""
    if not result or len(result.strip()) < 1:
        return True
    # If output is longer than 5x the input, likely hallucinated
    if len(result) > len(original) * 6:
        return True
    return False

def sunbird_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Sunbird AI Sunflower - Ugandan languages"""
    if not SUNBIRD_API_KEY:
        print("⚠️ Sunbird: No API key")
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
            "alur": ("Alur", "alz"),
            "lango": ("Lango", "laj"),
            "lugwere": ("Lugwere", "gwr"),
            "jopadhola": ("Jopadhola", "adh"),
        }
        
        if target_lang not in sunbird_codes:
            return None
        
        target_name, code = sunbird_codes[target_lang]
        
        prompt = f"""You are a translation tool. Your ONLY job is to translate the English phrase below into {target_name}.

Do NOT answer, comment, continue the conversation, or generate new sentences.
If the phrase is a greeting, translate it as a greeting.
Output ONLY the {target_name} translation of the exact words below. No explanations.

English phrase: "{text}"

{target_name} translation:"""
        
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
        
        print(f"🌐 Sunbird {target_lang}: '{text[:60]}'")
        resp = requests.post(url, headers=headers, json=payload, timeout=20)
        
        if resp.status_code == 200:
            data = resp.json()
            result = clean(data.get("content", ""))
            print(f"🌐 Sunbird returned: '{result[:120]}'")
            if result and not is_bad_translation(text, result):
                return result
            else:
                print(f"⚠️ Sunbird rejected (likely hallucination)")
        else:
            print(f"❌ Sunbird HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        print(f"❌ Sunbird exception: {e}")
    return None

def google_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Google Translate for international languages"""
    try:
        lang_codes = {
            "english": "en", "french": "fr", "spanish": "es", "german": "de",
            "portuguese": "pt", "italian": "it", "dutch": "nl", "russian": "ru",
            "arabic": "ar", "hindi": "hi", "chinese": "zh-CN", "japanese": "ja",
            "korean": "ko", "turkish": "tr", "vietnamese": "vi", "thai": "th",
            "indonesian": "id", "hebrew": "he", "greek": "el",
            "polish": "pl", "swedish": "sv", "danish": "da", "finnish": "fi",
            "norwegian": "no", "czech": "cs", "romanian": "ro",
            "hungarian": "hu", "ukrainian": "uk", "persian": "fa",
            "swahili": "sw", "kinyarwanda": "rw", "kirundi": "rn",
            "amharic": "am", "somali": "so", "yoruba": "yo", "hausa": "ha",
            "igbo": "ig", "shona": "sn", "chichewa": "ny", "afrikaans": "af",
            "zulu": "zu", "xhosa": "xh", "sesotho": "st", "setswana": "tn",
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
    except Exception as e:
        print(f"Google error: {e}")
    return None

def fast_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Sunbird for Ugandan, Google for the rest"""
    if not text or not text.strip():
        return None
    
    cache_key = f"{source_lang}:{target_lang}:{text[:100]}"
    with _cache_lock:
        if cache_key in _cache:
            return _cache[cache_key]
    
    result = None
    
    # 1. Ugandan → Sunbird
    if target_lang in UGANDAN_LANGS:
        start = time.time()
        result = sunbird_translate(text, target_lang, source_lang)
        if result:
            with _cache_lock:
                _cache[cache_key] = result
            print(f"⚡ Sunbird responded in {time.time()-start:.1f}s")
            return result
        # Fall through to Google if Sunbird hallucinated
        print(f"🔄 Sunbird failed, falling back to Google")
    
    # 2. Everything else → Google
    start = time.time()
    result = google_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ Google responded in {time.time()-start:.1f}s")
        return result
    
    return None