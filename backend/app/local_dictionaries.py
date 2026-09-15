"""Local Ugandan dictionaries loaded from extracted JSON files"""
import json
import os
from typing import Optional

BASE = os.path.dirname(os.path.abspath(__file__))

# ============ Load Acholi ============
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

# ============ Load Runyankore ============
# Format: {runyankore_word: english_definition}
RUNYANKORE_DICT = {}
RUNYANKORE_REVERSE = {}  # English keyword -> Runyankore word
try:
    path = os.path.join(BASE, 'runyankore_dict.json')
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            RUNYANKORE_DICT = json.load(f)
        
        # Build reverse map: first English word of definition → Runyankore word
        for runy_word, eng_defn in RUNYANKORE_DICT.items():
            if not eng_defn:
                continue
            # Take the first word(s) of the definition as a lookup key
            # e.g. "these: used to refer to..." → "these"
            first_part = eng_defn.split(':')[0].split('.')[0].strip().lower()
            # Also strip leading "to " for verbs
            key = first_part
            if key.startswith('to '):
                key = key[3:]
            key = key.strip()
            if key and key not in RUNYANKORE_REVERSE:
                RUNYANKORE_REVERSE[key] = runy_word
        
        print(f'✅ Runyankore loaded: {len(RUNYANKORE_DICT)} runy→eng, {len(RUNYANKORE_REVERSE)} eng→runy')
    else:
        print(f'⚠️ runyankore_dict.json not found at {path}')
except Exception as e:
    print(f'❌ Runyankore load error: {e}')


def normalize_key(text: str) -> str:
    """Normalize text for lookup: lowercase, strip whitespace only"""
    return text.lower().strip()


def lookup_local(text: str, target_lang: str, source_lang: str = 'english') -> Optional[str]:
    """
    Universal local dictionary lookup.
    Returns translation if found, None otherwise.
    """
    if not text:
        return None
    
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
    
    # Runyankore/Rukiga: Runyankore → English (from dict key)
    if source_lang in ('runyankore', 'rukiga', 'runyankole') and target_lang == 'english':
        result = RUNYANKORE_DICT.get(key)
        if result:
            # The value is the English definition - clean it
            # Remove trailing details after first period
            result = result.split('.')[0].strip()
            return result
    
    # Runyankore/Rukiga: English → Runyankore (from reverse map)
    if source_lang == 'english' and target_lang in ('runyankore', 'rukiga', 'runyankole'):
        result = RUNYANKORE_REVERSE.get(key)
        if result:
            return result
    
    return None


def get_dictionary_stats() -> dict:
    """Return stats on loaded dictionaries"""
    return {
        'acholi_eng_to_ach': len(ACHOLI_ENG_TO_ACH),
        'acholi_ach_to_eng': len(ACHOLI_ACH_TO_ENG),
        'runyankore': len(RUNYANKORE_DICT),
        'runyankore_reverse': len(RUNYANKORE_REVERSE),
    }