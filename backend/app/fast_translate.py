"""Ultra-fast translation: Sunbird + NLLB (CTranslate2) + Groq + Google"""
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

# Languages NLLB supports well (fallback when Sunbird is unavailable)
NLLB_LANGS = {
    "luganda", "acholi", "alur", "ateso", "runyankole", "rukiga",
    "lugbara", "lango", "lusoga", "lugwere", "kinyarwanda", "kirundi",
    "swahili", "amharic", "somali", "oromo", "tigrinya", "yoruba",
    "hausa", "igbo", "zulu", "xhosa", "shona", "chichewa",
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
        }
        
        if target_lang not in sunbird_codes:
            return None
        
        target_name, code = sunbird_codes[target_lang]
        
        prompt = f"Translate the following text to {target_name}. Return ONLY the {target_name} translation:\n\n{text}"
        
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
            result = clean(data.get("content", ""))
            if result and not is_bad_translation(text, result):
                return result
    except Exception as e:
        print(f"Sunbird error: {e}")
    return None

def nllb_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """NLLB-200 via CTranslate2 - optimized inference for African languages"""
    try:
        import ctranslate2
        import transformers
        
        if not hasattr(nllb_translate, "translator"):
            print("🔄 Loading NLLB (CTranslate2)...")
            start = time.time()
            model_path = "facebook/nllb-200-distilled-600M"
            nllb_translate.tokenizer = transformers.AutoTokenizer.from_pretrained(model_path)
            nllb_translate.translator = ctranslate2.Translator(
                "Tushe/nllb-200-600M-ct2-float16",
                device="cpu",
                compute_type="int8"
            )
            print(f"✅ NLLB loaded in {time.time()-start:.1f}s")
        
        lang_map = {
            "english": "eng_Latn", "luganda": "lug_Latn", "swahili": "swh_Latn",
            "acholi": "ach_Latn", "alur": "alz_Latn", "ateso": "teo_Latn",
            "runyankole": "nyn_Latn", "rukiga": "cgg_Latn", "lugbara": "lgg_Latn",
            "lango": "laj_Latn", "lusoga": "xog_Latn", "lugwere": "gwr_Latn",
            "kinyarwanda": "kin_Latn", "kirundi": "run_Latn",
            "amharic": "amh_Ethi", "somali": "som_Latn", "oromo": "gaz_Latn",
            "tigrinya": "tir_Ethi", "yoruba": "yor_Latn", "hausa": "hau_Latn",
            "igbo": "ibo_Latn", "zulu": "zul_Latn", "xhosa": "xho_Latn",
            "shona": "sna_Latn", "chichewa": "nya_Latn", "afrikaans": "afr_Latn",
            "french": "fra_Latn", "spanish": "spa_Latn", "german": "deu_Latn",
            "portuguese": "por_Latn", "italian": "ita_Latn", "arabic": "arb_Arab",
            "hindi": "hin_Deva", "chinese": "zho_Hans", "japanese": "jpn_Jpan",
            "korean": "kor_Hang", "turkish": "tur_Latn", "russian": "rus_Cyrl",
        }
        
        src_code = lang_map.get(source_lang, "eng_Latn")
        tgt_code = lang_map.get(target_lang, "eng_Latn")
        
        nllb_translate.tokenizer.src_lang = src_code
        source_tokens = nllb_translate.tokenizer.convert_ids_to_tokens(
            nllb_translate.tokenizer.encode(text)
        )
        
        results = nllb_translate.translator.translate_batch(
            [source_tokens],
            target_prefix=[[tgt_code]],
            beam_size=4,
            max_decoding_length=256,
            repetition_penalty=1.2
        )
        
        output_tokens = results[0].hypotheses[0]
        if tgt_code in output_tokens:
            output_tokens.remove(tgt_code)
        
        result = nllb_translate.tokenizer.decode(
            nllb_translate.tokenizer.convert_tokens_to_ids(output_tokens)
        )
        result = clean(result)
        
        if result and not is_bad_translation(text, result):
            return result
    except Exception as e:
        print(f"NLLB error: {e}")
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
                {"role": "system", "content": f"You are a native {target_name} translator. Translate to {target_name}. Output ONLY the translation."},
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
    """Priority: Sunbird → NLLB → Google → Groq"""
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
    
    # 2. NLLB for all African languages (fallback)
    if target_lang in NLLB_LANGS or source_lang in NLLB_LANGS:
        start = time.time()
        result = nllb_translate(text, target_lang, source_lang)
        if result:
            with _cache_lock:
                _cache[cache_key] = result
            print(f"⚡ NLLB responded in {time.time()-start:.1f}s")
            return result
    
    # 3. Google for major languages
    start = time.time()
    result = google_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ Google responded in {time.time()-start:.1f}s")
        return result
    
    # 4. Groq final fallback
    start = time.time()
    result = groq_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ Groq responded in {time.time()-start:.1f}s")
        return result
    
    return None