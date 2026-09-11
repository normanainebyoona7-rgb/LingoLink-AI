"""High-efficiency translation: Sunbird (Ugandan) + Groq (Fast LLM) + Google (Fallback)"""
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

SUNBIRD_LANGS = {
    "luganda", "acholi", "ateso", "runyankole", "rukiga", "lugbara",
    "lusoga", "rutooro", "lumasaba"
}

GROQ_LANGS = {
    "alur", "lango", "lugwere", "dholuo", "kikuyu", "kirundi",
    "amharic", "somali", "oromo", "tigrinya", "yoruba", "hausa",
    "igbo", "zulu", "xhosa", "shona", "chichewa"
}

def clean(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip().strip('"').strip("'")

def is_bad_translation(original: str, result: str) -> bool:
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
    """Sunbird AI Sunflower - gold standard for Ugandan languages"""
    if not SUNBIRD_API_KEY:
        print("⚠️ Sunbird: No API key found")
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
        }
        
        if target_lang not in sunbird_codes:
            print(f"⚠️ Sunbird: {target_lang} not supported")
            return None
        
        target_name, code = sunbird_codes[target_lang]
        
        prompt = f"""You are a native {target_name} speaker. Translate the following text into natural, fluent {target_name}. Output ONLY the translation:

{text}"""
        
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
        
        print(f"🌐 Calling Sunbird for {target_lang}...")
        resp = requests.post(url, headers=headers, json=payload, timeout=20)
        print(f"🌐 Sunbird HTTP {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            result = clean(data.get("content", ""))
            print(f"🌐 Sunbird raw: {result[:100]}")
            if result and not is_bad_translation(text, result):
                return result
            else:
                print(f"⚠️ Sunbird bad output rejected")
        else:
            print(f"❌ Sunbird error body: {resp.text[:200]}")
    except Exception as e:
        print(f"❌ Sunbird exception: {e}")
    return None

def groq_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Groq (Llama 3.3 70B) - ultra-fast LLM translation"""
    if not GROQ_API_KEY:
        return None
    
    try:
        lang_names = {
            "alur": "Alur", "lango": "Lango", "lugwere": "Lugwere",
            "dholuo": "Dholuo", "kikuyu": "Kikuyu", "kirundi": "Kirundi",
            "amharic": "Amharic", "somali": "Somali", "oromo": "Oromo",
            "tigrinya": "Tigrinya", "yoruba": "Yoruba", "hausa": "Hausa",
            "igbo": "Igbo", "zulu": "Zulu", "xhosa": "Xhosa",
            "shona": "Shona", "chichewa": "Chichewa", "afrikaans": "Afrikaans",
            "french": "French", "spanish": "Spanish", "german": "German",
            "portuguese": "Portuguese", "italian": "Italian", "swahili": "Swahili",
            "kinyarwanda": "Kinyarwanda",
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
                {"role": "system", "content": f"You are a native {target_name} speaker and professional translator. Translate the user's text into natural, fluent {target_name}.\n\nRules:\n- Translate the MEANING, not word-for-word\n- Use natural {target_name} sentence structure\n- Output ONLY the {target_name} translation"},
                {"role": "user", "content": text}
            ],
            "temperature": 0.1,
            "max_tokens": 2000
        }
        
        resp = requests.post(url, headers=headers, json=payload, timeout=15)
        
        if resp.status_code == 200:
            data = resp.json()
            result = clean(data["choices"][0]["message"]["content"])
            if result and not is_bad_translation(text, result):
                return result
    except Exception as e:
        print(f"Groq error: {e}")
    return None

def google_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Google Translate free API - instant for major languages"""
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
    """Sunbird first for Ugandan, Google for major, Groq for rest"""
    if not text or not text.strip():
        return None
    
    cache_key = f"{source_lang}:{target_lang}:{text[:100]}"
    with _cache_lock:
        if cache_key in _cache:
            return _cache[cache_key]
    
    # 1. Sunbird for Ugandan languages
    if target_lang in SUNBIRD_LANGS:
        start = time.time()
        result = sunbird_translate(text, target_lang, source_lang)
        if result:
            with _cache_lock:
                _cache[cache_key] = result
            print(f"⚡ Sunbird responded in {time.time()-start:.1f}s")
            return result
        # Sunbird failed → try Groq
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