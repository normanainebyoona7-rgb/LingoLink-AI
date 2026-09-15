"""Fast translation with smart engine routing and validation"""
import requests
import re
import threading
import time
import os
from typing import Optional, Dict
from dotenv import load_dotenv
from app.local_dictionaries import lookup_local

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
SUNBIRD_API_KEY = os.getenv("SUNBIRD_API_KEY", "")

_cache: Dict[str, str] = {}
_cache_lock = threading.Lock()

# Languages Sunbird handles well (Ugandan)
SUNBIRD_TARGETS = {
    "luganda", "acholi", "ateso", "runyankole", "runyankore", "rukiga",
    "lugbara", "lusoga", "rutooro", "lumasaba", "alur", "lango",
    "lugwere", "jopadhola"
}

# Google language codes
GOOGLE_CODES = {
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
    "urdu": "ur", "bengali": "bn", "tamil": "ta", "telugu": "te",
    "marathi": "mr", "gujarati": "gu", "kannada": "kn", "malayalam": "ml",
    "punjabi": "pa", "nepali": "ne", "sinhala": "si", "khmer": "km",
    "lao": "lo", "burmese": "my", "malay": "ms", "tagalog": "tl",
    "bulgarian": "bg", "croatian": "hr", "serbian": "sr", "slovak": "sk",
    "slovenian": "sl", "estonian": "et", "latvian": "lv", "lithuanian": "lt",
    "icelandic": "is", "irish": "ga", "welsh": "cy", "catalan": "ca",
    "basque": "eu", "galician": "gl", "maltese": "mt", "albanian": "sq",
    "macedonian": "mk", "bosnian": "bs", "belarusian": "be",
    "georgian": "ka", "armenian": "hy", "azerbaijani": "az",
    "kazakh": "kk", "uzbek": "uz", "mongolian": "mn", "tibetan": "bo",
}

# Session for connection reuse
_session = requests.Session()
_session.headers.update({"User-Agent": "Mozilla/5.0"})


def clean(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip().strip('"').strip("'")


def is_bad_translation(original: str, result: str) -> bool:
    if not result or len(result.strip()) < 1:
        return True
    if result.lower().strip() == original.lower().strip():
        return True
    return False


# ============== GOOGLE TRANSLATE ==============

def google_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Google Translate free API with validation"""
    try:
        tgt = GOOGLE_CODES.get(target_lang)
        if not tgt:
            return None
        src = GOOGLE_CODES.get(source_lang, "auto") if source_lang != "auto" else "auto"
        
        url = (
            f"https://translate.googleapis.com/translate_a/single"
            f"?client=gtx&sl={src}&tl={tgt}&dt=t&q={requests.utils.quote(text[:1500])}"
        )
        resp = _session.get(url, timeout=6)
        
        if resp.status_code == 200:
            data = resp.json()
            result = "".join([part[0] for part in data[0] if part and part[0]])
            result = clean(result)
            # Reject truncated results (< 40% of input length for short texts)
            if result and result != text:
                if len(text) < 20 or len(result) >= len(text) * 0.4:
                    return result
    except Exception as e:
        print(f"Google error: {e}")
    return None


# ============== MYMEMORY ==============

def mymemory_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    try:
        tgt = GOOGLE_CODES.get(target_lang, target_lang)
        src = GOOGLE_CODES.get(source_lang, "en")
        if not tgt:
            return None
        
        url = f"https://api.mymemory.translated.net/get?q={requests.utils.quote(text[:500])}&langpair={src}|{tgt}"
        resp = _session.get(url, timeout=6)
        if resp.status_code == 200:
            data = resp.json()
            result = data.get("responseData", {}).get("translatedText", "")
            if result and result != text and "INVALID" not in result.upper():
                return clean(result)
    except Exception as e:
        print(f"MyMemory error: {e}")
    return None


# ============== SUNBIRD ==============

def sunbird_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    if not SUNBIRD_API_KEY:
        return None
    try:
        sunbird_codes = {
            "luganda": ("Luganda", "lug"),
            "acholi": ("Acholi", "ach"),
            "ateso": ("Ateso", "teo"),
            "runyankole": ("Runyankole", "nyn"),
            "runyankore": ("Runyankole", "nyn"),
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
        
        prompt = f"Translate to {target_name}: {text}"
        url = "https://api.sunbird.ai/tasks/sunflower_inference"
        headers = {"Authorization": f"Bearer {SUNBIRD_API_KEY}", "Content-Type": "application/json"}
        payload = {
            "messages": [{"role": "user", "content": prompt}],
            "target_language": code,
            "temperature": 0.1
        }
        resp = _session.post(url, headers=headers, json=payload, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            result = clean(data.get("content", ""))
            if result and not is_bad_translation(text, result):
                return result
    except Exception as e:
        print(f"Sunbird error: {e}")
    return None


# ============== GROQ ==============

def groq_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    if not GROQ_API_KEY:
        return None
    try:
        lang_names = {
            "luganda": "Luganda", "acholi": "Acholi", "ateso": "Ateso",
            "runyankole": "Runyankole", "runyankore": "Runyankore", "rukiga": "Rukiga",
            "alur": "Alur", "lango": "Lango", "lugbara": "Lugbara",
            "french": "French", "spanish": "Spanish", "german": "German",
            "swahili": "Swahili", "kinyarwanda": "Kinyarwanda",
        }
        target_name = lang_names.get(target_lang, target_lang.capitalize())
        
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
        payload = {
            "model": "llama-3.1-8b-instant",
            "messages": [
                {"role": "system", "content": f"You are a native {target_name} translator. Output ONLY the {target_name} translation."},
                {"role": "user", "content": text}
            ],
            "temperature": 0.1,
            "max_tokens": 1000
        }
        resp = _session.post(url, headers=headers, json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            result = clean(data["choices"][0]["message"]["content"])
            if result and not is_bad_translation(text, result):
                return result
    except Exception as e:
        print(f"Groq error: {e}")
    return None


# ============== MAIN ROUTER ==============

def fast_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Smart routing with pivot through English if needed"""
    if not text or not text.strip():
        return None

    cache_key = f"{source_lang}:{target_lang}:{text[:100]}"
    with _cache_lock:
        if cache_key in _cache:
            return _cache[cache_key]

    # 1. LOCAL DICTIONARY FIRST
    result = lookup_local(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"📖 Local dict hit")
        return result

    # 2. DIRECT TRANSLATION
    result = _translate_direct(text, source_lang, target_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        return result

    # 3. PIVOT THROUGH ENGLISH
    if source_lang != "english" and target_lang != "english" and source_lang != "auto":
        print(f"🔄 Pivot: {source_lang} → en → {target_lang}")
        
        # Step 1: source → English (Google first)
        english_text = google_translate(text, "english", source_lang)
        if not english_text:
            english_text = groq_translate(text, "english", source_lang)
        
        if english_text:
            # Step 2: English → target
            result = _translate_direct(english_text, "english", target_lang)
            if result:
                with _cache_lock:
                    _cache[cache_key] = result
                return result

    return None


def _translate_direct(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    """Direct translation based on target language"""
    
    # Ugandan languages → Sunbird first, then Groq
    if target_lang in SUNBIRD_TARGETS:
        result = sunbird_translate(text, target_lang, source_lang)
        if result and len(result) >= 2:
            return result
        result = groq_translate(text, target_lang, source_lang)
        if result and len(result) >= 2:
            return result
        return None
    
    # Everything else → Google first (fast, broad coverage)
    result = google_translate(text, target_lang, source_lang)
    if result and len(result) >= 2:
        return result
    
    result = mymemory_translate(text, target_lang, source_lang)
    if result and len(result) >= 2:
        return result
    
    result = groq_translate(text, target_lang, source_lang)
    if result and len(result) >= 2:
        return result
    
    return None