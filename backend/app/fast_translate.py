"""Fast translation using Google Translate + NLLB-200 (lazy loading)"""
import requests
import re
import threading
import time
from typing import Optional, Dict
from dotenv import load_dotenv

load_dotenv()

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

def nllb_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """NLLB-200 local model - LAZY LOAD (only loads when needed)"""
    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        import torch
        
        # Load once, only when needed
        if not hasattr(nllb_translate, "model"):
            print("🔄 Loading NLLB (first time only)...")
            nllb_translate.tokenizer = AutoTokenizer.from_pretrained("facebook/nllb-200-distilled-600M")
            nllb_translate.model = AutoModelForSeq2SeqLM.from_pretrained("facebook/nllb-200-distilled-600M")
            nllb_translate.model.eval()
            print("✅ NLLB loaded")
        
        lang_map = {
            "english": "eng_Latn", "luganda": "lug_Latn", "swahili": "swh_Latn",
            "french": "fra_Latn", "spanish": "spa_Latn", "german": "deu_Latn",
            "acholi": "ach_Latn", "alur": "alz_Latn", "ateso": "teo_Latn",
            "kinyarwanda": "kin_Latn", "kirundi": "run_Latn",
            "amharic": "amh_Ethi", "somali": "som_Latn", "oromo": "gaz_Latn",
            "yoruba": "yor_Latn", "hausa": "hau_Latn", "igbo": "ibo_Latn",
            "zulu": "zul_Latn", "xhosa": "xho_Latn", "shona": "sna_Latn",
            "chichewa": "nya_Latn", "afrikaans": "afr_Latn",
        }
        
        src_code = lang_map.get(source_lang, "eng_Latn")
        tgt_code = lang_map.get(target_lang, "eng_Latn")
        
        nllb_translate.tokenizer.src_lang = src_code
        inputs = nllb_translate.tokenizer(text, return_tensors="pt")
        
        tgt_id = nllb_translate.tokenizer.convert_tokens_to_ids(tgt_code)
        
        with torch.no_grad():
            outputs = nllb_translate.model.generate(**inputs, forced_bos_token_id=tgt_id, max_length=100)
        
        result = nllb_translate.tokenizer.decode(outputs[0], skip_special_tokens=True)
        return clean(result)
    except Exception as e:
        print(f"NLLB error: {e}")
        return None

def fast_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """Google first (fast), NLLB second (slow, only for African languages)"""
    if not text or not text.strip():
        return None
    
    cache_key = f"{source_lang}:{target_lang}:{text[:100]}"
    with _cache_lock:
        if cache_key in _cache:
            return _cache[cache_key]
    
    # 1. Google (fast, no API key)
    start = time.time()
    result = google_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ Google responded in {time.time()-start:.1f}s")
        return result
    
    # 2. NLLB (slow, African languages only)
    result = nllb_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"🐢 NLLB responded in {time.time()-start:.1f}s")
        return result
    
    return None