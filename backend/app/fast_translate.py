"""Fast translation with dictionary-first lookup, smart language detection, and universal English pivot"""
import requests
import re
import threading
import os
from typing import Optional, Dict
from dotenv import load_dotenv
from app.local_dictionaries import lookup_local

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
SUNBIRD_API_KEY = os.getenv("SUNBIRD_API_KEY", "")
IS_CLOUD = os.getenv("RENDER", "") == "true" or os.getenv("IS_CLOUD", "") == "true"

GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

_cache: Dict[str, str] = {}
_cache_lock = threading.Lock()

SUNBIRD_TARGETS = {
    "luganda", "acholi", "ateso", "runyankole", "runyankore", "rukiga",
    "lugbara", "lusoga", "rutooro", "lumasaba", "alur", "lango",
    "lugwere", "jopadhola"
}

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

LANG_NAMES = {
    "english": "English", "french": "French", "spanish": "Spanish",
    "german": "German", "portuguese": "Portuguese", "italian": "Italian",
    "dutch": "Dutch", "russian": "Russian", "arabic": "Arabic",
    "hindi": "Hindi", "chinese": "Chinese", "japanese": "Japanese",
    "korean": "Korean", "turkish": "Turkish", "swahili": "Swahili",
    "kinyarwanda": "Kinyarwanda", "luganda": "Luganda", "acholi": "Acholi",
    "ateso": "Ateso", "runyankole": "Runyankole", "runyankore": "Runyankore",
    "rukiga": "Rukiga", "alur": "Alur", "lango": "Lango",
    "lugbara": "Lugbara", "lusoga": "Lusoga", "rutooro": "Rutooro",
    "lumasaba": "Lumasaba", "lugwere": "Lugwere", "jopadhola": "Jopadhola",
    "yoruba": "Yoruba", "hausa": "Hausa", "igbo": "Igbo",
    "zulu": "Zulu", "xhosa": "Xhosa", "afrikaans": "Afrikaans",
    "amharic": "Amharic", "somali": "Somali",
}

ISO_ALIASES = {
    "en": "english", "eng": "english",
    "fr": "french", "fra": "french",
    "es": "spanish", "spa": "spanish",
    "de": "german", "deu": "german",
    "pt": "portuguese", "por": "portuguese",
    "it": "italian", "ita": "italian",
    "nl": "dutch", "nld": "dutch",
    "ru": "russian", "rus": "russian",
    "ar": "arabic", "ara": "arabic",
    "hi": "hindi", "hin": "hindi",
    "zh": "chinese", "zho": "chinese", "zh-cn": "chinese",
    "ja": "japanese", "jpn": "japanese",
    "ko": "korean", "kor": "korean",
    "tr": "turkish", "tur": "turkish",
    "sw": "swahili", "swa": "swahili",
    "rw": "kinyarwanda", "kin": "kinyarwanda",
    "rn": "kirundi", "run": "kirundi",
    "am": "amharic", "amh": "amharic",
    "so": "somali", "som": "somali",
    "yo": "yoruba", "yor": "yoruba",
    "ha": "hausa", "hau": "hausa",
    "ig": "igbo", "ibo": "igbo",
    "zu": "zulu", "zul": "zulu",
    "xh": "xhosa", "xho": "xhosa",
    "af": "afrikaans", "afr": "afrikaans",
}

# ============================================================
# CURATED LANGUAGE HINTS — quick wins for common words
# ============================================================

LANG_HINTS = {
    "swahili": {
        "habari", "asante", "karibu", "ndiyo", "hapana", "maji",
        "chakula", "soko", "rafiki", "nyumbani", "kwaheri", "tafadhali",
        "samahani", "polepole", "sana", "vizuri", "nzuri", "mbaya",
        "mzuri", "kubwa", "ndogo", "kaka", "dada", "baba", "mama",
        "mtoto", "wanawake", "wanaume", "jina", "langu", "lako",
        "nini", "nani", "wapi", "lini", "vipi", "kwa", "na", "ya",
        "kwaheri", "tutaonana", "kesho", "jana", "leo", "jioni",
        "asubuhi", "mchana", "usiku", "wiki", "mwaka", "mwezi",
        "safari", "gari", "basi", "shule", "hospitali", "polisi",
        "kazi", "kitabu", "simu", "pesa", "siku", "wakati",
        "ninataka", "nataka", "ninahitaji", "nahitaji",
        "nina", "una", "ana", "tuna", "mna", "wana",
        "niko", "uko", "yuko", "tuko", "mko", "wako",
        "naku", "napenda", "nakupenda", "nampenda",
        "nime", "una", "ame", "tume", "mme", "wame",
    },
    "luganda": {
        "oli", "otya", "gyendi", "webale", "weebale", "nyo",
        "wasuze", "osiibye", "sula", "bulungi", "yee", "nedda",
        "mukwano", "amazzi", "emmere", "akatale", "ennyumba",
        "nze", "ggwe", "ye", "ffe", "mmwe", "bo",
        "nkwagala", "njagala", "nneetaaga", "oyitibwa", "ani",
        "ndi", "oli", "ali", "tuli", "muli", "bali",
        "genda", "jja", "jja", "wano", "wano", "eyo", "eri",
    },
    "acholi": {
        "itye", "nining", "apwoyo", "apwoyo", "matek",
        "atye", "maber", "ee", "pe", "kica", "konya",
        "pii", "kec", "gwok", "ot", "lakwor",
        "an", "in", "en", "wan", "wun", "gin",
        "amari", "amito", "nyinga", "nga", "adi",
    },
    "runyankole": {
        "ori", "ota", "webare", "munonga", "mwaramutse",
        "mwabonaho", "eego", "nanga", "kyangye", "ndakwiheka",
        "amaizi", "ekyokurya", "omukyaalo", "enju", "munywani",
        "nyowe", "iwe", "we", "itwe", "imwe", "bo",
        "ninkukunda", "ninkwenda", "ibara", "ryawe", "nirii",
        "ndi", "ori", "ari", "turi", "muri", "bari",
    },
    "french": {
        "bonjour", "salut", "merci", "oui", "non", "s'il",
        "vous", "plaît", "au", "revoir", "comment", "ça",
        "va", "bien", "très", "je", "tu", "il", "elle",
        "nous", "ils", "elles", "le", "la", "les", "un",
        "une", "des", "et", "ou", "mais", "où", "quand",
        "pourquoi", "qui", "quoi", "avec", "sans", "pour",
    },
    "spanish": {
        "hola", "gracias", "sí", "no", "por", "favor",
        "adiós", "cómo", "estás", "bien", "muy", "yo",
        "tú", "él", "ella", "nosotros", "ellos", "el",
        "la", "los", "las", "un", "una", "unos", "y",
        "o", "pero", "dónde", "cuándo", "por", "qué",
    },
    "german": {
        "hallo", "danke", "ja", "nein", "bitte", "guten",
        "morgen", "tag", "abend", "nacht", "wie", "geht",
        "es", "dir", "ihnen", "ich", "du", "er", "sie",
        "wir", "ihr", "der", "die", "das", "und", "oder",
        "aber", "wo", "wann", "warum", "wer", "was",
    },
    "english": {
        "hello", "hi", "thanks", "thank", "yes", "no",
        "please", "sorry", "good", "morning", "afternoon",
        "evening", "night", "how", "are", "you", "i", "am",
        "the", "a", "an", "and", "or", "but", "is", "was",
        "to", "of", "in", "on", "at", "for", "with", "by",
        "what", "where", "when", "why", "who", "this", "that",
    },
    "italian": {
        "ciao", "grazie", "sì", "no", "per", "favore",
        "arrivederci", "come", "stai", "bene", "molto",
        "io", "tu", "lui", "lei", "noi", "loro", "il",
        "la", "i", "le", "un", "una", "e", "o", "ma",
    },
    "portuguese": {
        "olá", "obrigado", "obrigada", "sim", "não", "por",
        "favor", "adeus", "como", "está", "bem", "muito",
        "eu", "você", "ele", "ela", "nós", "eles", "o",
        "a", "os", "as", "um", "uma", "e", "ou", "mas",
    },
    "arabic": {
        "مرحبا", "شكرا", "نعم", "لا", "من", "فضلك", "وداعا",
        "كيف", "حال", "بخير", "أنا", "أنت", "هو", "هي",
    },
    "chinese": {
        "你好", "谢谢", "是", "不", "请", "再见", "怎么样",
        "我", "你", "他", "她", "我们", "他们",
    },
    "hindi": {
        "नमस्ते", "धन्यवाद", "हाँ", "नहीं", "कृपया", "अलविदा",
        "कैसे", "है", "ठीक", "मैं", "तुम", "वह",
    },
}


def _lang_hint(text: str) -> Optional[str]:
    """Fast curated detection: any word in our hints triggers the language."""
    words = set(re.findall(r'\w+', text.lower()))
    if not words:
        return None
    # Check strongest signal first
    best_lang = None
    best_hits = 0
    for lang, hint_set in LANG_HINTS.items():
        hits = len(words & hint_set)
        if hits > best_hits:
            best_hits = hits
            best_lang = lang
    # Require at least 1 hint match to accept
    if best_hits >= 1:
        return best_lang
    return None


_session = requests.Session()
_session.headers.update({"User-Agent": "Mozilla/5.0"})


def clean(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip().strip('"').strip("'")


def normalize_lang(lang: str) -> str:
    if not lang:
        return "auto"
    lang_lower = lang.lower().strip()
    if lang_lower in ("auto", "detect"):
        return "auto"
    return ISO_ALIASES.get(lang_lower, lang_lower)


def is_bad_translation(original: str, result: str) -> bool:
    if not result or len(result.strip()) < 1:
        return True
    orig_clean = original.lower().strip()
    res_clean = result.lower().strip()
    if res_clean == orig_clean:
        return True
    if len(orig_clean) < 20:
        orig_alpha = re.sub(r'[^\w\s]', '', orig_clean)
        res_alpha = re.sub(r'[^\w\s]', '', res_clean)
        if orig_alpha == res_alpha:
            return True
    orig_words = set(re.findall(r'\w+', orig_clean))
    res_words = set(re.findall(r'\w+', res_clean))
    if orig_words and res_words:
        overlap = len(orig_words & res_words) / max(len(orig_words), 1)
        if overlap >= 0.7 and len(orig_words) >= 2:
            return True
    return False


def looks_like_english(text: str) -> bool:
    if not text or len(text.strip()) < 2:
        return False
    english_markers = {
        'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
        'be', 'been', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by',
        'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
        'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
        'what', 'how', 'where', 'when', 'who', 'why', 'yes', 'no', 'hello',
        'hi', 'thanks', 'thank', 'good', 'morning', 'please', 'sorry',
        'you', 'are', 'coming',
    }
    words = set(re.findall(r'\w+', text.lower()))
    if not words:
        return False
    if words & english_markers:
        return True
    if all(ord(c) < 128 for c in text):
        return True
    return False


# ============== SMART LANGUAGE DETECTION ==============

def detect_language(text: str) -> str:
    """
    Multi-stage detection:
    1. Curated hints (fast, accurate for our supported languages)
    2. langid (fallback)
    3. Groq LLM (final fallback)
    """
    if not text or len(text.strip()) < 2:
        return "english"

    # Stage 1: curated hints — most accurate for our common words
    hint = _lang_hint(text)
    if hint:
        print(f"🔍 Lang hint: {hint}")
        return hint

    # Stage 2: langid — but filter out nonsense results for short text
    try:
        import langid
        lang_code, confidence = langid.classify(text)
        normalized = normalize_lang(lang_code)
        # Only accept if it's a language we recognize and reasonably confident
        if normalized != "auto" and normalized in LANG_NAMES:
            # Reject if langid says Indonesian but the text has Swahili words
            return normalized
    except Exception as e:
        print(f"langid error: {e}")

    # Stage 3: Groq — explicit detection prompt
    if GROQ_API_KEY:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
            payload = {
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content":
                        "Detect the language of the user's text. "
                        "Reply with ONLY the ISO 639-1 code (two letters like 'en', 'sw', 'fr'). "
                        "If unsure, reply 'en'."},
                    {"role": "user", "content": text[:200]}
                ],
                "temperature": 0.0,
                "max_tokens": 5
            }
            resp = _session.post(url, headers=headers, json=payload, timeout=10)
            if resp.status_code == 200:
                code = clean(resp.json()["choices"][0]["message"]["content"]).lower().strip()
                code = re.sub(r'[^a-z]', '', code)[:2]
                if code:
                    return normalize_lang(code)
        except Exception as e:
            print(f"Groq detect error: {e}")

    return "english"


# ============== DICTIONARIES ==============

def translate_via_dict(text: str, target_lang: str, source_lang: str) -> Optional[str]:
    try:
        return lookup_local(text, target_lang, source_lang)
    except Exception as e:
        print(f"Dict error: {e}")
        return None


# ============== GOOGLE ==============

def google_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    if IS_CLOUD:
        return None
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
            if result and not is_bad_translation(text, result):
                return result
    except Exception as e:
        print(f"Google error: {e}")
    return None


# ============== MYMEMORY ==============

def mymemory_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    try:
        tgt = GOOGLE_CODES.get(target_lang, target_lang)
        src = GOOGLE_CODES.get(source_lang, "auto")
        if not tgt:
            return None
        url = f"https://api.mymemory.translated.net/get?q={requests.utils.quote(text[:500])}&langpair={src}|{tgt}"
        resp = _session.get(url, timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            result = data.get("responseData", {}).get("translatedText", "")
            if result and "INVALID" not in result.upper():
                result = clean(result)
                if not is_bad_translation(text, result):
                    return result
    except Exception as e:
        print(f"MyMemory error: {e}")
    return None


# ============== SUNBIRD ==============

def sunbird_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    if not SUNBIRD_API_KEY:
        return None
    try:
        sunbird_codes = {
            "luganda": ("Luganda", "lug"), "acholi": ("Acholi", "ach"),
            "ateso": ("Ateso", "teo"), "runyankole": ("Runyankole", "nyn"),
            "runyankore": ("Runyankole", "nyn"), "rukiga": ("Rukiga", "cgg"),
            "lugbara": ("Lugbara", "lgg"), "lusoga": ("Lusoga", "xog"),
            "rutooro": ("Rutooro", "ttj"), "lumasaba": ("Lumasaba", "myx"),
            "alur": ("Alur", "alz"), "lango": ("Lango", "laj"),
            "lugwere": ("Lugwere", "gwr"), "jopadhola": ("Jopadhola", "adh"),
        }
        if target_lang not in sunbird_codes:
            return None
        target_name, code = sunbird_codes[target_lang]
        prompt = f"Translate to {target_name}: {text}"
        url = "https://api.sunbird.ai/tasks/sunflower_inference"
        headers = {"Authorization": f"Bearer {SUNBIRD_API_KEY}", "Content-Type": "application/json"}
        payload = {"messages": [{"role": "user", "content": prompt}], "target_language": code, "temperature": 0.1}
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
        target_name = LANG_NAMES.get(target_lang, target_lang.capitalize())
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
        system_prompt = (
            f"You are a professional translator. Translate the user's text into {target_name}. "
            f"Output ONLY the {target_name} translation — no explanations, no notes, no original text, no quotes. "
            f"If the input is already in {target_name}, rewrite it naturally in {target_name}. "
            f"Never return the input unchanged if it is in a different language."
        )
        payload = {
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Translate to {target_name}: {text}"}
            ],
            "temperature": 0.3,
            "max_tokens": 1000
        }
        resp = _session.post(url, headers=headers, json=payload, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            result = clean(data["choices"][0]["message"]["content"])
            if result and not is_bad_translation(text, result):
                return result
        else:
            print(f"Groq status {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        print(f"Groq error: {e}")
    return None


# ============== DIRECT TRANSLATION ==============

def _translate_direct(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    result = translate_via_dict(text, target_lang, source_lang)
    if result:
        print(f"📖 Dict hit: {source_lang} → {target_lang}")
        return result

    if target_lang in SUNBIRD_TARGETS:
        result = sunbird_translate(text, target_lang, source_lang)
        if result:
            return result
        result = groq_translate(text, target_lang, source_lang)
        if result:
            return result
        return None

    if not IS_CLOUD:
        result = google_translate(text, target_lang, source_lang)
        if result:
            return result

    result = mymemory_translate(text, target_lang, source_lang)
    if result:
        return result

    result = groq_translate(text, target_lang, source_lang)
    if result:
        return result

    return None


# ============== ENGLISH PIVOT ==============

def to_english(text: str, source_lang: str) -> Optional[str]:
    if source_lang == "english":
        return text
    result = translate_via_dict(text, "english", source_lang)
    if result:
        print(f"📖 Dict pivot: {source_lang} → english")
        return result
    if not IS_CLOUD:
        result = google_translate(text, "english", source_lang)
        if result and looks_like_english(result):
            return result
    result = mymemory_translate(text, "english", source_lang)
    if result and looks_like_english(result):
        return result
    result = groq_translate(text, "english", source_lang)
    if result and looks_like_english(result):
        return result
    return None


def from_english(text: str, target_lang: str) -> Optional[str]:
    return _translate_direct(text, "english", target_lang)


# ============== MAIN ROUTER ==============

def fast_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    if not text or not text.strip():
        return None

    source_lang = normalize_lang(source_lang)
    target_lang = normalize_lang(target_lang)

    cache_key = f"{source_lang}:{target_lang}:{text[:100]}"
    with _cache_lock:
        if cache_key in _cache:
            return _cache[cache_key]

    def _save(result: Optional[str]):
        if result:
            with _cache_lock:
                _cache[cache_key] = result
        return result

    # Step 0: Detect language
    if source_lang == "auto":
        detected = detect_language(text)
        print(f"🔍 Detected: {detected}")
        source_lang = detected

    # 1. Dictionary
    result = translate_via_dict(text, target_lang, source_lang)
    if result:
        print(f"📖 Dict hit: {source_lang} → {target_lang}")
        return _save(result)

    # 2. Direct
    result = _translate_direct(text, source_lang, target_lang)
    if result:
        return _save(result)

    # 3. Pivot
    if source_lang != "english" and target_lang != "english":
        print(f"🔄 Pivot: {source_lang} → en → {target_lang}")
        english_text = to_english(text, source_lang)
        if english_text:
            print(f"   → EN: '{english_text[:60]}'")
            result = from_english(english_text, target_lang)
            if result:
                return _save(result)

    return None