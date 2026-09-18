"""Local Ugandan + Swahili dictionaries: curated phrases + large extracted corpora"""
import json
import os
from typing import Optional

from app.common_phrases import PHRASES as COMMON_PHRASES, REVERSE as COMMON_REVERSE

BASE = os.path.dirname(os.path.abspath(__file__))

# ============================================================
# Load Acholi JSON (72k entries, Bible-based)
# ============================================================
ACHOLI_ENG_TO_ACH = {}
ACHOLI_ACH_TO_ENG = {}
try:
    path = os.path.join(BASE, 'acholi_dict.json')
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            ACHOLI_ENG_TO_ACH = data.get('eng_to_ach', {})
            ACHOLI_ACH_TO_ENG = data.get('ach_to_eng', {})
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

        print(f'✅ Runyankole loaded: {len(RUNYANKORE_DICT)} runy→eng, {len(RUNYANKORE_REVERSE)} eng→runy')
    else:
        print(f'⚠️ runyankore_dict.json not found at {path}')
except Exception as e:
    print(f'❌ Runyankole load error: {e}')

# ============================================================
# Load Swahili JSON (16,683 entries — Swahili→Swahili definitions)
# Source: Kalebu/kamusi (scraped from Kamusi-Mobile by Jack Siro)
# Format: {"1": {"Word": "habari", "Meaning": "...", "Synonyms": "...", "Conjugation": null}, ...}
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

            # Clean up the word (remove trailing punctuation like "a!")
            word_clean = word.rstrip('!?.,;:').strip().lower()
            if not word_clean:
                continue

            meaning = (entry.get('Meaning') or '').strip()
            synonyms = (entry.get('Synonyms') or '').strip()

            # Keep the shortest meaning (most likely a direct translation)
            # Split on '|' and ':' to get the primary gloss
            primary = meaning.split('|')[0].split(':')[0].strip()

            # Only store if we don't already have this word, or if the new meaning is shorter
            if word_clean not in SWAHILI_DICT or len(primary) < len(SWAHILI_DICT[word_clean]):
                SWAHILI_DICT[word_clean] = primary

            # Build reverse map: pick out English words from synonyms if any
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
    """Normalize text for lookup: lowercase, strip whitespace and trailing punctuation"""
    return text.lower().strip().rstrip('.!?,')


def _lookup_common(text: str, target_lang: str, source_lang: str) -> Optional[str]:
    """Check curated common_phrases first (fastest + most accurate for daily speech)"""
    key = normalize_key(text)
    if not key:
        return None

    # English → Native (common phrases)
    if source_lang == 'english' and target_lang in COMMON_PHRASES:
        result = COMMON_PHRASES[target_lang].get(key)
        if result:
            return result

    # Native → English (common phrases)
    if target_lang == 'english' and source_lang in COMMON_REVERSE:
        result = COMMON_REVERSE[source_lang].get(key)
        if result:
            return result

    return None


def _lookup_big_dict(text: str, target_lang: str, source_lang: str) -> Optional[str]:
    """Fall back to the large JSON dicts (Acholi, Runyankole, Swahili)"""
    key = normalize_key(text)

    # Acholi: English → Acholi
    if source_lang == 'english' and target_lang == 'acholi':
        result = ACHOLI_ENG_TO_ACH.get(key)
        if result:
            return result

    # Acholi: Acholi → English
    if source_lang == 'acholi' and target_lang == 'english':
        result = ACHOLI_ACH_TO_ENG.get(key)
        if result:
            return result

    # Runyankole: native → English
    if source_lang in ('runyankole', 'runyankore', 'rukiga') and target_lang == 'english':
        result = RUNYANKORE_DICT.get(key)
        if result:
            return result.split('.')[0].strip()

    # Runyankole: English → native
    if source_lang == 'english' and target_lang in ('runyankole', 'runyankore', 'rukiga'):
        result = RUNYANKORE_REVERSE.get(key)
        if result:
            return result

    # Swahili: Swahili → English (use definition as best-effort translation)
    if source_lang == 'swahili' and target_lang == 'english':
        result = SWAHILI_DICT.get(key)
        if result:
            # Only return if the meaning looks like a real translation (short, no pipes)
            # Otherwise the caller should fall through to Sunbird/Groq
            if len(result) <= 60 and '|' not in result:
                return result

    # Swahili: English → Swahili (limited — most entries are Swahili→Swahili)
    if source_lang == 'english' and target_lang == 'swahili':
        result = SWAHILI_REVERSE.get(key)
        if result:
            return result

    return None


def lookup_local(text: str, target_lang: str, source_lang: str = 'english') -> Optional[str]:
    """
    Universal local dictionary lookup.
    Order: curated common phrases → large JSON dicts → None.
    """
    if not text:
        return None

    # 1. Curated everyday phrases (instant, exact)
    result = _lookup_common(text, target_lang, source_lang)
    if result:
        return result

    # 2. Big JSON dicts (Acholi 72k, Runyankole 8k, Swahili 16k)
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