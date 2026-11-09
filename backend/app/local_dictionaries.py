"""Local Ugandan + Swahili dictionaries: curated phrases + large extracted corpora.

Optimizations in this version:
- Precomputed lowercase index for acholi dict at load (no .lower() per lookup).
- Multi-word phrase matching: try full phrase, then progressively smaller
  leading chunks, then word-level fallback.
- Merged lookup path: common → corpus → big dict, single pass through the
  unified `_lookup_any` helper.
- Word-level fallback for long sentences where phrase lookup misses.
"""
import json
import os
import re
from typing import Optional, List, Tuple

from app.common_phrases import PHRASES as COMMON_PHRASES, REVERSE as COMMON_REVERSE
from app.corpus_dictionaries import lookup_corpus

BASE = os.path.dirname(os.path.abspath(__file__))

# Split points we use for multi-word matching
_WORD_SPLIT_RE = re.compile(r"[\s,;:.!?]+")


# ============================================================
# Load Acholi JSON (72k entries, Bible-based)
# ============================================================
ACHOLI_ENG_TO_ACH = {}
ACHOLI_ACH_TO_ENG = {}
# Precomputed lowercase indexes
ACHOLI_ENG_TO_ACH_LC = {}
ACHOLI_ACH_TO_ENG_LC = {}
try:
    path = os.path.join(BASE, 'acholi_dict.json')
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            ACHOLI_ENG_TO_ACH = data.get('eng_to_ach', {})
            ACHOLI_ACH_TO_ENG = data.get('ach_to_eng', {})
        for k, v in ACHOLI_ENG_TO_ACH.items():
            ACHOLI_ENG_TO_ACH_LC[k.strip().lower()] = v
        for k, v in ACHOLI_ACH_TO_ENG.items():
            ACHOLI_ACH_TO_ENG_LC[k.strip().lower()] = v
        print(f'✅ Acholi loaded: {len(ACHOLI_ENG_TO_ACH)} eng→ach, {len(ACHOLI_ACH_TO_ENG)} ach→eng')
    else:
        print(f'⚠️ acholi_dict.json not found at {path}')
except Exception as e:
    print(f'❌ Acholi load error: {e}')

# ============================================================
# Load Runyankole JSON (8k entries, word dictionary)
# ============================================================
RUNYANKORE_DICT = {}
RUNYANKORE_REVERSE = {}
RUNYANKORE_DICT_LC = {}
try:
    path = os.path.join(BASE, 'runyankore_dict.json')
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            RUNYANKORE_DICT = json.load(f)

        for runy_word, eng_defn in RUNYANKORE_DICT.items():
            if not eng_defn:
                continue
            first_part = eng_defn.split(':')[0].split('.')[0].strip().lower()
            key = first_part
            if key.startswith('to '):
                key = key[3:]
            key = key.strip()
            if key and key not in RUNYANKORE_REVERSE:
                RUNYANKORE_REVERSE[key] = runy_word

        # Lowercase source index
        for k, v in RUNYANKORE_DICT.items():
            RUNYANKORE_DICT_LC[k.strip().lower()] = v

        print(f'✅ Runyankole loaded: {len(RUNYANKORE_DICT)} runy→eng, {len(RUNYANKORE_REVERSE)} eng→runy')
    else:
        print(f'⚠️ runyankore_dict.json not found at {path}')
except Exception as e:
    print(f'❌ Runyankole load error: {e}')

# ============================================================
# Load Swahili JSON (16,683 entries — Swahili→Swahili definitions)
# ============================================================
SWAHILI_DICT = {}
SWAHILI_REVERSE = {}
try:
    path = os.path.join(BASE, 'swahili_dict.json')
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            raw = json.load(f)

        for _id, entry in raw.items():
            word = (entry.get('Word') or '').strip()
            if not word:
                continue

            word_clean = word.rstrip('!?.,;:').strip().lower()
            if not word_clean:
                continue

            meaning = (entry.get('Meaning') or '').strip()
            synonyms = (entry.get('Synonyms') or '').strip()

            primary = meaning.split('|')[0].split(':')[0].strip()

            if word_clean not in SWAHILI_DICT or len(primary) < len(SWAHILI_DICT[word_clean]):
                SWAHILI_DICT[word_clean] = primary

            if synonyms:
                for syn in synonyms.split(','):
                    syn_clean = syn.strip().lower()
                    if syn_clean and syn_clean not in SWAHILI_REVERSE:
                        SWAHILI_REVERSE[syn_clean] = word_clean

        print(f'✅ Swahili loaded: {len(SWAHILI_DICT)} sw→def, {len(SWAHILI_REVERSE)} rev-indexed')
    else:
        print(f'⚠️ swahili_dict.json not found at {path}')
except Exception as e:
    print(f'❌ Swahili load error: {e}')


# ============================================================
# Lookup helpers
# ============================================================

def normalize_key(text: str) -> str:
    return text.lower().strip().rstrip('.!?,')


def _lookup_common(text: str, target_lang: str, source_lang: str) -> Optional[str]:
    """Check curated common_phrases first (fastest + most accurate for daily speech)"""
    key = normalize_key(text)
    if not key:
        return None

    if source_lang == 'english' and target_lang in COMMON_PHRASES:
        result = COMMON_PHRASES[target_lang].get(key)
        if result:
            return result

    if target_lang == 'english' and source_lang in COMMON_REVERSE:
        result = COMMON_REVERSE[source_lang].get(key)
        if result:
            return result

    return None


def _lookup_corpus(text: str, target_lang: str, source_lang: str) -> Optional[str]:
    """Check the UgandaLex2 corpora (6,200 pairs per language)."""
    return lookup_corpus(text, target_lang, source_lang)


# ---- Big dict lookups (with precomputed lowercase indexes) ----

def _lookup_big_dict_single(text: str, target_lang: str, source_lang: str) -> Optional[str]:
    """Single-token lookup against big JSON dicts. Assumes `text` is already lowercased/normalized."""
    if source_lang == 'english' and target_lang == 'acholi':
        result = ACHOLI_ENG_TO_ACH_LC.get(text)
        if result:
            return result

    if source_lang == 'acholi' and target_lang == 'english':
        result = ACHOLI_ACH_TO_ENG_LC.get(text)
        if result:
            return result

    if source_lang in ('runyankole', 'runyankore', 'rukiga') and target_lang == 'english':
        result = RUNYANKORE_DICT_LC.get(text)
        if result:
            return result.split('.')[0].strip()

    if source_lang == 'english' and target_lang in ('runyankole', 'runyankore', 'rukiga'):
        result = RUNYANKORE_REVERSE.get(text)
        if result:
            return result

    if source_lang == 'swahili' and target_lang == 'english':
        result = SWAHILI_DICT.get(text)
        if result:
            if len(result) <= 60 and '|' not in result:
                return result

    if source_lang == 'english' and target_lang == 'swahili':
        result = SWAHILI_REVERSE.get(text)
        if result:
            return result

    return None


def _lookup_big_dict(text: str, target_lang: str, source_lang: str) -> Optional[str]:
    """Try full phrase, then progressively shorter leading chunks, then word fallback."""
    key = normalize_key(text)
    if not key:
        return None

    # 1. Exact
    result = _lookup_big_dict_single(key, target_lang, source_lang)
    if result:
        return result

    # 2. Progressively smaller leading chunks (multi-word phrases like "good morning")
    words = [w for w in _WORD_SPLIT_RE.split(key) if w]
    if len(words) > 1:
        for size in range(len(words) - 1, 0, -1):
            chunk = " ".join(words[:size])
            result = _lookup_big_dict_single(chunk, target_lang, source_lang)
            if result:
                return result

        # 3. Word-level fallback: if source is a big-dict language, translate word by word
        if _is_big_dict_lang(source_lang):
            pieces: List[str] = []
            matched_any = False
            for w in words:
                hit = _lookup_big_dict_single(w, target_lang, source_lang)
                if hit:
                    pieces.append(hit)
                    matched_any = True
                else:
                    pieces.append(w)  # leave unmatched word as-is
            if matched_any:
                return " ".join(pieces)

    return None


def _is_big_dict_lang(lang: str) -> bool:
    return lang in ('acholi', 'runyankole', 'runyankore', 'rukiga', 'swahili')


def lookup_local(text: str, target_lang: str, source_lang: str = 'english') -> Optional[str]:
    """
    Universal local dictionary lookup.
    Order: curated common phrases → corpus (6k pairs) → big JSON dicts.
    """
    if not text:
        return None

    # 1. Curated everyday phrases (instant, exact)
    result = _lookup_common(text, target_lang, source_lang)
    if result:
        return result

    # 2. UgandaLex2 corpus — 6,200 verified pairs per language
    result = _lookup_corpus(text, target_lang, source_lang)
    if result:
        return result

    # 3. Big JSON dicts (Acholi 72k, Runyankole 8k, Swahili 16k)
    #    Handles: exact phrase → leading chunk → word-level fallback.
    result = _lookup_big_dict(text, target_lang, source_lang)
    if result:
        return result

    return None


def get_dictionary_stats() -> dict:
    """Return stats on loaded dictionaries"""
    stats = {
        'acholi_eng_to_ach': len(ACHOLI_ENG_TO_ACH),
        'acholi_ach_to_eng': len(ACHOLI_ACH_TO_ENG),
        'runyankore': len(RUNYANKORE_DICT),
        'runyankore_reverse': len(RUNYANKORE_REVERSE),
        'swahili': len(SWAHILI_DICT),
        'swahili_reverse': len(SWAHILI_REVERSE),
    }
    for lang, phrases in COMMON_PHRASES.items():
        stats[f'common_{lang}'] = len(phrases)
    return stats