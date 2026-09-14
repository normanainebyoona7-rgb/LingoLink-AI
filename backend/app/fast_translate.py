"""Multi-engine translation:
- Ugandan dictionaries (instant, accurate for known phrases)
- NLLB (local, for sentences not in dictionary)
- MyMemory + Lingva (for international languages)
- Groq (final fallback)
"""
import requests
import re
import threading
import time
import os
from typing import Optional, Dict
from dotenv import load_dotenv
from app.ugandan_dictionaries import lookup_word, DICTIONARIES

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

_cache: Dict[str, str] = {}
_cache_lock = threading.Lock()

UGANDAN_LANGS = set(DICTIONARIES.keys())

def clean(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip().strip('"').strip("'")

def is_bad_translation(original: str, result: str) -> bool:
    if not result or len(result.strip()) < 1:
        return True
    if result.lower().strip() == original.lower().strip():
        return True
    return False

# ============== DICTIONARY LOOKUP (INSTANT) ==============

def dictionary_translate(text: str, target_lang: str) -> Optional[str]:
    """Check Ugandan phrase dictionaries first - instant response"""
    result = lookup_word(text, target_lang)
    if result:
        print(f"📖 Dictionary hit: {result}")
    return result

# ============== NLLB (LOCAL) ==============

def nllb_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """NLLB-200 via CTranslate2"""
    try:
        import ctranslate2
        from transformers import AutoTokenizer
        
        if not hasattr(nllb_translate, "translator"):
            print("🔄 Loading NLLB...")
            start = time.time()
            model_path = r"C:\Users\user\.cache\huggingface\hub\models--olob0--nllb-200-distilled-600M-ct2-int8_float16\snapshots\16e211293ac0adb8518d19a9ffe930bf9235d47a"
            nllb_translate.tokenizer = AutoTokenizer.from_pretrained('facebook/nllb-200-distilled-600M')
            nllb_translate.translator = ctranslate2.Translator(model_path, device="cpu", compute_type="int8")
            print(f"✅ NLLB loaded in {time.time()-start:.1f}s")
        
        lang_map = {
            "english": "eng_Latn", "luganda": "lug_Latn", "swahili": "swh_Latn",
            "acholi": "ach_Latn", "alur": "alz_Latn", "ateso": "teo_Latn",
            "runyankole": "nyn_Latn", "rukiga": "cgg_Latn", "lugbara": "lgg_Latn",
            "lango": "laj_Latn", "lusoga": "xog_Latn", "lugwere": "gwr_Latn",
            "kinyarwanda": "kin_Latn", "kirundi": "run_Latn",
            "amharic": "amh_Ethi", "somali": "som_Latn", "oromo": "gaz_Latn",
            "yoruba": "yor_Latn", "hausa": "hau_Latn", "igbo": "ibo_Latn",
            "zulu": "zul_Latn", "xhosa": "xho_Latn", "shona": "sna_Latn",
            "chichewa": "nya_Latn",
        }
        
        src_code = lang_map.get(source_lang, "eng_Latn")
        tgt_code = lang_map.get(target_lang, "eng_Latn")
        
        nllb_translate.tokenizer.src_lang = src_code
        tokens = nllb_translate.tokenizer.convert_ids_to_tokens(
            nllb_translate.tokenizer(text).input_ids
        )
        
        results = nllb_translate.translator.translate_batch(
            [tokens],
            target_prefix=[[tgt_code]],
            beam_size=4,
            max_decoding_length=256,
            repetition_penalty=1.2
        )
        
        output = results[0].hypotheses[0]
        if tgt_code in output:
            output.remove(tgt_code)
        
        result = nllb_translate.tokenizer.decode(
            nllb_translate.tokenizer.convert_tokens_to_ids(output)
        )
        result = clean(result)
        
        if result and not is_bad_translation(text, result):
            return result
    except Exception as e:
        print(f"NLLB error: {e}")
    return None

# ============== MYMEMORY (INTERNATIONAL) ==============

def mymemory_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
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
            if result and result != text and "INVALID" not in result.upper():
                return clean(result)
    except Exception as e:
        print(f"MyMemory error: {e}")
    return None

# ============== GROQ (LLM FALLBACK) ==============

def groq_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    if not GROQ_API_KEY:
        return None
    try:
        lang_names = {
            "luganda": "Luganda", "acholi": "Acholi", "ateso": "Ateso",
            "runyankole": "Runyankole", "rukiga": "Rukiga", "alur": "Alur",
            "lango": "Lango", "lugbara": "Lugbara",
            "swahili": "Swahili", "kinyarwanda": "Kinyarwanda",
        }
        target_name = lang_names.get(target_lang, target_lang.capitalize())
        
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
        payload = {
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": f"You are a native {target_name} translator. Translate to natural {target_name}. Output ONLY the translation."},
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
    """Smart routing: Dictionary → NLLB → MyMemory → Groq"""
    if not text or not text.strip():
        return None

    cache_key = f"{source_lang}:{target_lang}:{text[:100]}"
    with _cache_lock:
        if cache_key in _cache:
            return _cache[cache_key]

    # 1. Ugandan languages → Dictionary first (INSTANT)
    if target_lang in UGANDAN_LANGS:
        start = time.time()
        result = dictionary_translate(text, target_lang)
        if result:
            with _cache_lock:
                _cache[cache_key] = result
            print(f"⚡ Dictionary in {time.time()-start:.3f}s")
            return result
        
        # 2. Not in dictionary → NLLB
        start = time.time()
        result = nllb_translate(text, target_lang, source_lang)
        if result:
            with _cache_lock:
                _cache[cache_key] = result
            print(f"⚡ NLLB in {time.time()-start:.1f}s")
            return result
        
        # 3. NLLB failed → Groq
        start = time.time()
        result = groq_translate(text, target_lang, source_lang)
        if result:
            with _cache_lock:
                _cache[cache_key] = result
            print(f"⚡ Groq in {time.time()-start:.1f}s")
            return result

    # 4. International → MyMemory
    start = time.time()
    result = mymemory_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ MyMemory in {time.time()-start:.1f}s")
        return result

    # 5. Final fallback → Groq
    start = time.time()
    result = groq_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ Groq in {time.time()-start:.1f}s")
        return result

    return None