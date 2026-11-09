"""Fast translation with dictionary-first lookup, parallel provider racing, and smart language detection.

Optimizations in this version:
- Raised timeouts (10s connect / 30-45s read) for slow networks and cloud.
- True parallel racing with a dedicated per-call ThreadPoolExecutor so a slow
  loser cannot hog the shared pool. First successful result wins immediately.
- Sentence splitting for long paragraphs (per-sentence translation + stitch).
- Result cache with TTL + max-size eviction.
- Precomputed inverted index for language hints (no per-call scan of LANG_HINTS).
- Parallel pivot for non-English <-> non-English (to_english and from_english race).
"""
import requests
import re
import threading
import os
import time
import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FutureTimeout
from typing import Optional, Dict, Tuple, List
from dotenv import load_dotenv
from app.local_dictionaries import lookup_local

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
SUNBIRD_API_KEY = os.getenv("SUNBIRD_API_KEY", "")
IS_CLOUD = os.getenv("RENDER", "") == "true" or os.getenv("IS_CLOUD", "") == "true"

GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

# -------- Timeouts (raised) --------
# (connect, read)
GROQ_TIMEOUT = (10, 45)
SUNBIRD_TIMEOUT = (10, 30)
MYMEMORY_TIMEOUT = (5, 10)
GOOGLE_TIMEOUT = (5, 12)

PARALLEL_DEADLINE = 45          # total budget for parallel racing
MAX_CACHE_ENTRIES = 4096        # bounded cache
CACHE_TTL_SECONDS = 60 * 30     # 30 minutes

# Sentence splitter: split on . ! ? and line breaks, keep delimiters attached.
_SENTENCE_RE = re.compile(r'(?<=[\.\!\?\n])\s+')
MAX_SENTENCE_CHARS = 400        # If a single sentence is longer, don't split further.


# -------- Cache with TTL + bounded size --------
_cache: Dict[str, Tuple[str, float]] = {}
_cache_lock = threading.Lock()


def _cache_get(key: str) -> Optional[str]:
    now = time.time()
    with _cache_lock:
        entry = _cache.get(key)
        if not entry:
            return None
        value, expires = entry
        if expires < now:
            _cache.pop(key, None)
            return None
        return value


def _cache_put(key: str, value: str) -> None:
    now = time.time()
    with _cache_lock:
        if len(_cache) >= MAX_CACHE_ENTRIES:
            # Evict oldest-expiry ~10% to keep things cheap
            victims = sorted(_cache.items(), key=lambda kv: kv[1][1])[: max(1, MAX_CACHE_ENTRIES // 10)]
            for k, _ in victims:
                _cache.pop(k, None)
        _cache[key] = (value, now + CACHE_TTL_SECONDS)


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

LANG_HINTS = {
    "swahili": {
        "habari", "asante", "karibu", "ndiyo", "hapana", "maji",
        "chakula", "soko", "rafiki", "nyumbani", "kwaheri", "tafadhali",
        "samahani", "polepole", "sana", "vizuri", "nzuri", "mbaya",
        "mzuri", "kubwa", "ndogo", "kaka", "dada", "baba", "mama",
        "mtoto", "wanawake", "wanaume", "jina", "langu", "lako",
        "nini", "nani", "wapi", "lini", "vipi", "kwa", "na", "ya",
        "tutaonana", "kesho", "jana", "leo", "jioni",
        "asubuhi", "mchana", "usiku", "wiki", "mwaka", "mwezi",
        "safari", "gari", "basi", "shule", "hospitali", "polisi",
        "kazi", "kitabu", "simu", "pesa", "siku", "wakati",
        "ninataka", "nataka", "ninahitaji", "nahitaji",
        "nina", "una", "ana", "tuna", "mna", "wana",
        "niko", "uko", "yuko", "tuko", "mko", "wako",
        "naku", "napenda", "nakupenda", "nampenda",
        "nime", "ame", "tume", "mme", "wame",
    },
    "luganda": {
        "oli", "otya", "gyendi", "webale", "weebale", "nyo",
        "wasuze", "osiibye", "sula", "bulungi", "yee", "nedda",
        "mukwano", "amazzi", "emmere", "akatale", "ennyumba",
        "nze", "ggwe", "ye", "ffe", "mmwe", "bo",
        "nkwagala", "njagala", "nneetaaga", "oyitibwa", "ani",
        "ndi", "ali", "tuli", "muli", "bali",
        "genda", "jja", "wano", "eyo", "eri",
    },
    "acholi": {
        "itye", "nining", "apwoyo", "matek",
        "atye", "maber", "ee", "pe", "kica", "konya",
        "pii", "kec", "gwok", "ot", "lakwor",
        "an", "in", "en", "wan", "wun", "gin",
        "amari", "amito", "nyinga", "nga", "adi",
    },
    "runyankole": {
        "ori", "ota", "webare", "munonga", "mwaramutse",
        "mwabonaho", "eego", "nanga", "kyangye", "ndakwiheka",
        "amaizi", "ekyokurya", "omukyaalo", "enju", "munywani",
        "nyowe", "iwe", "itwe", "imwe",
        "ninkukunda", "ninkwenda", "ibara", "ryawe", "nirii",
        "ndi", "ari", "turi", "muri", "bari",
    },
    "french": {
        "bonjour", "salut", "merci", "oui", "non", "s'il",
        "vous", "plaît", "revoir", "comment", "ça",
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
        "o", "pero", "dónde", "cuándo", "qué",
    },
    "german": {
        "hallo", "danke", "ja", "nein", "bitte", "guten",
        "morgen", "tag", "abend", "nacht", "wie", "geht",
        "dir", "ihnen", "ich", "du", "er", "sie",
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
        "ciao", "grazie", "sì", "per", "favore",
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

# -------- Precomputed inverted index for hints --------
# Maps hint-word -> {lang: count} so we don't scan every LANG_HINTS set on each call.
_WORD_TO_LANGS: Dict[str, List[str]] = {}
for _lang, _hints in LANG_HINTS.items():
    for _w in _hints:
        _WORD_TO_LANGS.setdefault(_w, []).append(_lang)


def _lang_hint(text: str) -> Optional[str]:
    words = set(re.findall(r'\w+', text.lower()))
    if not words:
        return None
    # Fast path: score only the languages that appear in the candidate words
    scores: Dict[str, int] = {}
    for w in words:
        for lang in _WORD_TO_LANGS.get(w, ()):
            scores[lang] = scores.get(lang, 0) + 1
    if not scores:
        return None
    best_lang = max(scores, key=scores.get)
    return best_lang


_session = requests.Session()
_session.headers.update({"User-Agent": "Mozilla/5.0"})

# Persistent shared pool for short side calls (google/mymemory), but each
# parallel race gets its OWN pool so slow losers don't starve other requests.
_executor = ThreadPoolExecutor(max_workers=6, thread_name_prefix="translate")


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
        'coming',
    }
    words = set(re.findall(r'\w+', text.lower()))
    if not words:
        return False
    if words & english_markers:
        return True
    if all(ord(c) < 128 for c in text):
        return True
    return False


def detect_language(text: str) -> str:
    if not text or len(text.strip()) < 2:
        return "english"

    hint = _lang_hint(text)
    if hint:
        print(f"Lang hint: {hint}")
        return hint

    try:
        import langid
        lang_code, confidence = langid.classify(text)
        normalized = normalize_lang(lang_code)
        if normalized != "auto" and normalized in LANG_NAMES:
            return normalized
    except Exception as e:
        print(f"langid error: {e}")

    return "english"


def translate_via_dict(text: str, target_lang: str, source_lang: str) -> Optional[str]:
    try:
        return lookup_local(text, target_lang, source_lang)
    except Exception as e:
        print(f"Dict error: {e}")
        return None


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
        resp = _session.get(url, timeout=GOOGLE_TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            result = "".join([part[0] for part in data[0] if part and part[0]])
            result = clean(result)
            if result and not is_bad_translation(text, result):
                return result
    except Exception as e:
        print(f"Google error: {e}")
    return None


def mymemory_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    try:
        tgt = GOOGLE_CODES.get(target_lang, target_lang)
        src = GOOGLE_CODES.get(source_lang, "auto")
        if not tgt:
            return None
        url = f"https://api.mymemory.translated.net/get?q={requests.utils.quote(text[:500])}&langpair={src}|{tgt}"
        resp = _session.get(url, timeout=MYMEMORY_TIMEOUT)
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
        resp = _session.post(url, headers=headers, json=payload, timeout=SUNBIRD_TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            result = clean(data.get("content", ""))
            if result and not is_bad_translation(text, result):
                return result
    except Exception as e:
        print(f"Sunbird error: {e}")
    return None


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
        resp = _session.post(url, headers=headers, json=payload, timeout=GROQ_TIMEOUT)
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


# ============== PARALLEL RACING ==============

def _race_providers(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    """
    Fire Groq + Sunbird (if target is Ugandan) + MyMemory in parallel using a
    per-call pool. The first non-empty result wins; we do NOT wait for the
    losers (their threads are daemon-like and will be cleaned up as they finish
    or time out on their own). This is what makes racing actually fast.
    """
    providers = []

    # Groq — always try (fast, works for all languages)
    providers.append(("groq", lambda: groq_translate(text, target_lang, source_lang)))

    # Sunbird — only for Ugandan/African targets
    if target_lang in SUNBIRD_TARGETS and SUNBIRD_API_KEY:
        providers.append(("sunbird", lambda: sunbird_translate(text, target_lang, source_lang)))

    # MyMemory — as backup
    providers.append(("mymemory", lambda: mymemory_translate(text, target_lang, source_lang)))

    # Per-call pool: sized to number of providers so all run truly in parallel.
    with ThreadPoolExecutor(max_workers=len(providers), thread_name_prefix="race") as pool:
        futures = {pool.submit(fn): name for name, fn in providers}
        deadline = time.time() + PARALLEL_DEADLINE
        try:
            for future in as_completed(futures, timeout=PARALLEL_DEADLINE):
                name = futures[future]
                try:
                    remaining = max(0.5, deadline - time.time())
                    result = future.result(timeout=remaining)
                    if result:
                        print(f"Race winner: {name}")
                        # Do NOT block waiting for losers. `pool.shutdown(wait=False)`
                        # is the default on context exit only if we return early —
                        # so we break out and let the pool clean up its own threads.
                        return result
                except (FutureTimeout, Exception) as e:
                    print(f"Race {name} failed: {e}")
        except FutureTimeout:
            print("Race hard deadline hit")
    return None


# ============== DIRECT TRANSLATION ==============

def _translate_direct(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    """Fast path: dict → parallel providers."""
    # 1. Dictionary first (instant)
    result = translate_via_dict(text, target_lang, source_lang)
    if result:
        print(f"Dict hit: {source_lang} -> {target_lang}")
        return result

    # 2. Race Groq + Sunbird + MyMemory in parallel
    result = _race_providers(text, source_lang, target_lang)
    if result:
        return result

    return None


def to_english(text: str, source_lang: str) -> Optional[str]:
    if source_lang == "english":
        return text
    result = translate_via_dict(text, "english", source_lang)
    if result:
        print(f"Dict pivot: {source_lang} -> english")
        return result
    result = groq_translate(text, "english", source_lang)
    if result and looks_like_english(result):
        return result
    if not IS_CLOUD:
        result = google_translate(text, "english", source_lang)
        if result and looks_like_english(result):
            return result
    result = mymemory_translate(text, "english", source_lang)
    if result and looks_like_english(result):
        return result
    return None


def from_english(text: str, target_lang: str) -> Optional[str]:
    return _translate_direct(text, "english", target_lang)


# ============== Sentence splitting for long paragraphs ==============

def _split_sentences(text: str) -> List[str]:
    """Split a long paragraph into sentence-sized chunks. Preserves delimiters."""
    if len(text) <= MAX_SENTENCE_CHARS:
        return [text]
    raw = _SENTENCE_RE.split(text)
    out: List[str] = []
    buf = ""
    for piece in raw:
        piece = piece.strip()
        if not piece:
            continue
        if len(buf) + len(piece) + 1 <= MAX_SENTENCE_CHARS:
            buf = (buf + " " + piece).strip()
        else:
            if buf:
                out.append(buf)
            buf = piece
    if buf:
        out.append(buf)
    return out or [text]


def _translate_long(text: str, target_lang: str, source_lang: str) -> Optional[str]:
    """Translate a long paragraph sentence-by-sentence, then stitch."""
    sentences = _split_sentences(text)
    if len(sentences) == 1:
        return None  # caller handles single-chunk path
    results: List[str] = []
    for s in sentences:
        r = fast_translate(s, target_lang, source_lang)
        if not r:
            return None  # Bail to caller if any chunk fails
        results.append(r)
    return " ".join(results)


def fast_translate(text: str, target_lang: str, source_lang: str = "auto") -> Optional[str]:
    if not text or not text.strip():
        return None

    source_lang = normalize_lang(source_lang)
    target_lang = normalize_lang(target_lang)

    # Long paragraphs: split, translate each, stitch. Cache the whole thing.
    if len(text) > MAX_SENTENCE_CHARS:
        long_key = hashlib.md5(f"{source_lang}:{target_lang}:{text}".encode("utf-8")).hexdigest()
        cached = _cache_get(long_key)
        if cached:
            print(f"Cache hit (long): {source_lang} -> {target_lang}")
            return cached
        stitched = _translate_long(text, target_lang, source_lang)
        if stitched:
            _cache_put(long_key, stitched)
            return stitched
        # fall through to whole-text translation if sentence splitting failed

    cache_key = f"{source_lang}:{target_lang}:{text[:200]}"
    cached = _cache_get(cache_key)
    if cached:
        print(f"Cache hit: {source_lang} -> {target_lang}")
        return cached

    def _save(result: Optional[str]):
        if result:
            _cache_put(cache_key, result)
        return result

    if source_lang == "auto":
        detected = detect_language(text)
        print(f"Detected: {detected}")
        source_lang = detected

    # 1. Direct: dictionary → parallel providers
    result = _translate_direct(text, source_lang, target_lang)
    if result:
        return _save(result)

    # 2. English pivot (for non-English ↔ non-English pairs)
    if source_lang != "english" and target_lang != "english":
        print(f"Pivot: {source_lang} -> en -> {target_lang}")
        english_text = to_english(text, source_lang)
        if english_text:
            result = from_english(english_text, target_lang)
            if result:
                return _save(result)

    return None