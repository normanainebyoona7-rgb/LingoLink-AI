"""Unified Ugandan Language Dictionaries
Combines Luganda, Acholi, Rukiga, Alur, and Ateso into one lookup system
"""
from typing import Optional

# Import all dictionaries
try:
    from app.luganda_dict import LUGANDA_DICT
except ImportError:
    LUGANDA_DICT = {}

try:
    from app.acholi_dict import ACHOLI_DICT
except ImportError:
    ACHOLI_DICT = {}

try:
    from app.rukiga_dict import RUKIGA_DICT
except ImportError:
    RUKIGA_DICT = {}

try:
    from app.alur_dict import ALUR_DICT
except ImportError:
    ALUR_DICT = {}

try:
    from app.ateso_dict import ATESO_DICT
except ImportError:
    ATESO_DICT = {}

# Master lookup table
DICTIONARIES = {
    "luganda": LUGANDA_DICT,
    "acholi": ACHOLI_DICT,
    "rukiga": RUKIGA_DICT,
    "runyankole": RUKIGA_DICT,  # Runyankole shares vocabulary with Rukiga
    "alur": ALUR_DICT,
    "ateso": ATESO_DICT,
}

def normalize_key(text: str) -> str:
    """Normalize text for dictionary lookup"""
    return text.lower().strip().rstrip('!?.,;:')

def lookup_word(text: str, target_lang: str) -> Optional[str]:
    """Look up an English word/phrase in the target language dictionary"""
    lang = target_lang.lower().strip()
    table = DICTIONARIES.get(lang)
    if not table:
        return None
    
    key = normalize_key(text)
    
    # 1. Exact match
    if key in table:
        return table[key]
    
    # 2. Try without articles
    for article in ['a ', 'an ', 'the ']:
        if key.startswith(article):
            stripped = key[len(article):]
            if stripped in table:
                return table[stripped]
    
    # 3. Try singular form (strip 's')
    if key.endswith('s') and len(key) > 3:
        singular = key[:-1]
        if singular in table:
            return table[singular]
    
    return None

def get_dictionary_stats():
    """Get stats on all loaded dictionaries"""
    return {
        "luganda": len(LUGANDA_DICT),
        "acholi": len(ACHOLI_DICT),
        "rukiga": len(RUKIGA_DICT),
        "runyankole": len(RUKIGA_DICT),
        "alur": len(ALUR_DICT),
        "ateso": len(ATESO_DICT),
        "total_unique_entries": sum(len(d) for d in DICTIONARIES.values())
    }