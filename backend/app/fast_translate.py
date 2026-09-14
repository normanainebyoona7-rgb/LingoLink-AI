"""Fast translation: Sunbird (Ugandan) + MyMemory + Lingva + Google + Groq"""
import requests
import re
import threading
import time
import os
from typing import Optional, Dict
from dotenv import load_dotenv

load_dotenv()

SUNBIRD_API_KEY = os.getenv("SUNBIRD_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

_cache: Dict[str, str] = {}
_cache_lock = threading.Lock()

UGANDAN_LANGS = {
    "luganda", "acholi", "ateso", "runyankole", "rukiga", "lugbara",
    "lusoga", "rutooro", "lumasaba", "alur", "lango", "jopadhola", "lugwere"
}

# ============== HELPERS ==============

def clean(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip().strip('"').strip("'")

def is_bad_translation(original: str, result: str) -> bool:
    if not result or len(result.strip()) < 1:
        return True
    if len(result) > len(original) * 6:
        return True
    return False

# ============== SUNBIRD (UGANDAN) ==============

def sunbird_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Sunbird AI Sunflower - BEST for Ugandan languages"""
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
            "alur": ("Alur", "alz"),
            "lango": ("Lango", "laj"),
            "lugwere": ("Lugwere", "gwr"),
            "jopadhola": ("Jopadhola", "adh"),
        }
        if target_lang not in sunbird_codes:
            return None
        target_name, code = sunbird_codes[target_lang]
        
        prompt = f"""You are a translation tool. Translate the following English phrase to {target_name}.
Output ONLY the {target_name} translation. No explanations, no chat.

English: {text}
{target_name}:"""
        
        url = "https://api.sunbird.ai/tasks/sunflower_inference"
        headers = {"Authorization": f"Bearer {SUNBIRD_API_KEY}", "Content-Type": "application/json"}
        payload = {"messages": [{"role": "user", "content": prompt}], "target_language": code, "temperature": 0.1}
        
        resp = requests.post(url, headers=headers, json=payload, timeout=20)
        if resp.status_code == 200:
            data = resp.json()
            result = clean(data.get("content", ""))
            if result and not is_bad_translation(text, result):
                return result
    except Exception as e:
        print(f"Sunbird error: {e}")
    return None

# ============== MYMEMORY (FREE, FAST) ==============

def mymemory_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """MyMemory - 5000 words/day free, no API key"""
    try:
        codes = {
            "english": "en", "french": "fr", "spanish": "es", "german": "de",
            "portuguese": "pt", "italian": "it", "dutch": "nl", "russian": "ru",
            "arabic": "ar", "hindi": "hi", "chinese": "zh-CN", "japanese": "ja",
            "korean": "ko", "turkish": "tr", "vietnamese": "vi", "thai": "th",
            "indonesian": "id", "hebrew": "he", "greek": "el",
            "polish": "pl", "swedish": "sv", "danish": "da", "finnish": "fi",
            "norwegian": "no", "czech": "cs", "romanian": "ro",
            "hungarian": "hu", "ukrainian": "uk", "persian": "fa",
            "swahili": "sw", "afrikaans": "af", "zulu": "zu",
            "yoruba": "yo", "hausa": "ha", "igbo": "ig",
        }
        tgt = codes.get(target_lang)
        src = codes.get(source_lang, "en")
        if not tgt:
            return None
        
        url = f"https://api.mymemory.translated.net/get?q={requests.utils.quote(text[:500])}&langpair={src}|{tgt}"
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            result = data.get("responseData", {}).get("translatedText", "")
            if result and result != text and "INVALID" not in result.upper() and "QUERY LENGTH" not in result.upper():
                return clean(result)
    except Exception as e:
        print(f"MyMemory error: {e}")
    return None

# ============== LINGVA (GOOGLE PROXY, FREE) ==============

def lingva_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Lingva Translate - Google proxy, no key needed"""
    try:
        codes = {
            "english": "en", "french": "fr", "spanish": "es", "german": "de",
            "portuguese": "pt", "italian": "it", "dutch": "nl", "russian": "ru",
            "arabic": "ar", "hindi": "hi", "chinese": "zh", "japanese": "ja",
            "korean": "ko", "turkish": "tr", "vietnamese": "vi", "thai": "th",
            "indonesian": "id", "hebrew": "he", "greek": "el",
            "polish": "pl", "swedish": "sv", "danish": "da", "finnish": "fi",
            "norwegian": "no", "czech": "cs", "romanian": "ro",
            "hungarian": "hu", "ukrainian": "uk", "persian": "fa",
            "swahili": "sw", "afrikaans": "af", "zulu": "zu",
        }
        tgt = codes.get(target_lang)
        src = codes.get(source_lang, "auto")
        if not tgt:
            return None
        
        # Try multiple Lingva instances for reliability
        instances = [
            "https://lingva.ml",
            "https://lingva.lunar.icu",
            "https://translate.plausibility.cloud",
        ]
        
        for instance in instances:
            try:
                url = f"{instance}/api/v1/{src}/{tgt}/{requests.utils.quote(text[:500])}"
                resp = requests.get(url, timeout=8)
                if resp.status_code == 200:
                    data = resp.json()
                    result = data.get("translation", "")
                    if result and result != text:
                        return clean(result)
            except:
                continue
    except Exception as e:
        print(f"Lingva error: {e}")
    return None

# ============== GOOGLE DIRECT (LAST RESORT) ==============

def google_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Google Translate free endpoint - can hit 429"""
    try:
        codes = {
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
        tgt = codes.get(target_lang)
        src = codes.get(source_lang, "auto")
        if not tgt:
            return None
        
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={src}&tl={tgt}&dt=t&q={requests.utils.quote(text)}"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            result = "".join([part[0] for part in data[0] if part[0]])
            if result and result != text:
                return clean(result)
    except:
        pass
    return None

# ============== GROQ (LLM FALLBACK) ==============

def groq_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Groq Llama 3.3 70B - best for languages no other API covers"""
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
            "portuguese": "Portuguese", "italian": "Italian",
            "swahili": "Swahili", "kinyarwanda": "Kinyarwanda",
            "luganda": "Luganda", "acholi": "Acholi", "ateso": "Ateso",
            "runyankole": "Runyankole", "rukiga": "Rukiga",
        }
        target_name = lang_names.get(target_lang, target_lang.capitalize())
        
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
        payload = {
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": f"You are a native {target_name} translator. Translate to natural {target_name}. Output ONLY the translation. No notes, no explanations."},
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

# ============== MAIN ROUTER ==============

def fast_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Smart routing to fastest, most accurate engine"""
    if not text or not text.strip():
        return None

    cache_key = f"{source_lang}:{target_lang}:{text[:100]}"
    with _cache_lock:
        if cache_key in _cache:
            return _cache[cache_key]

    result = None

    # 1. Ugandan languages → Sunbird (fast + accurate)
    if target_lang in UGANDAN_LANGS:
        start = time.time()
        result = sunbird_translate(text, target_lang, source_lang)
        if result:
            with _cache_lock:
                _cache[cache_key] = result
            print(f"⚡ Sunbird in {time.time()-start:.1f}s")
            return result
        # Fallback to Groq for Ugandan if Sunbird failed
        start = time.time()
        result = groq_translate(text, target_lang, source_lang)
        if result:
            with _cache_lock:
                _cache[cache_key] = result
            print(f"⚡ Groq (Sunbird fallback) in {time.time()-start:.1f}s")
            return result

    # 2. International → MyMemory first (fast, free, no rate limit issues)
    start = time.time()
    result = mymemory_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ MyMemory in {time.time()-start:.1f}s")
        return result

    # 3. Try Lingva (Google proxy)
    start = time.time()
    result = lingva_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ Lingva in {time.time()-start:.1f}s")
        return result

    # 4. Try Google direct
    start = time.time()
    result = google_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ Google in {time.time()-start:.1f}s")
        return result

    # 5. Final fallback: Groq (handles everything)
    start = time.time()
    result = groq_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ Groq in {time.time()-start:.1f}s")
        return result

    return None