"""NLLB-200 only translation (testing accuracy)"""
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

def nllb_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """NLLB-200 via CTranslate2 - optimized inference"""
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

def fast_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    """NLLB-200 ONLY - for testing accuracy"""
    if not text or not text.strip():
        return None
    
    cache_key = f"{source_lang}:{target_lang}:{text[:100]}"
    with _cache_lock:
        if cache_key in _cache:
            return _cache[cache_key]
    
    start = time.time()
    result = nllb_translate(text, target_lang, source_lang)
    if result:
        with _cache_lock:
            _cache[cache_key] = result
        print(f"⚡ NLLB responded in {time.time()-start:.1f}s")
        return result
    
    return None