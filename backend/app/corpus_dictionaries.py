"""
Loads the 24 UgandaLex2 corpus JSON files (6,200 pairs each).
Provides fast English <-> native lookup as a middle tier between
common_phrases and the big JSON dictionaries.
"""
import json
import os
from typing import Optional, Dict

BASE = os.path.dirname(os.path.abspath(__file__))

CORPUS_LANGS = {
    "acholi": "acholi_corpus.json",
    "adhola": "adhola_corpus.json",
    "alur": "alur_corpus.json",
    "aringa": "aringa_corpus.json",
    "ateso": "ateso_corpus.json",
    "gungu": "gungu_corpus.json",
    "kakwa": "kakwa_corpus.json",
    "karamojong": "karamojong_corpus.json",
    "kebu": "kebu_corpus.json",
    "keliko": "keliko_corpus.json",
    "kinyarwanda": "kinyarwanda_corpus.json",
    "kumam": "kumam_corpus.json",
    "lango": "lango_corpus.json",
    "luganda": "luganda_corpus.json",
    "lugbara": "lugbara_corpus.json",
    "lugwere": "lugwere_corpus.json",
    "lumasaba": "lumasaba_corpus.json",
    "lusoga": "lusoga_corpus.json",
    "nyole": "nyole_corpus.json",
    "runyankole": "runyankole_corpus.json",
    "runyoro": "runyoro_corpus.json",
    "samia": "samia_corpus.json",
    "swahili": "swahili_corpus.json",
    "talinga": "talinga_corpus.json",
}

ENG_TO_NATIVE: Dict[str, Dict[str, str]] = {}
NATIVE_TO_ENG: Dict[str, Dict[str, str]] = {}


def _normalize(text: str) -> str:
    return text.lower().strip()


def _load_all():
    for code, filename in CORPUS_LANGS.items():
        path = os.path.join(BASE, filename)
        if not os.path.exists(path):
            print(f"Corpus missing: {filename}")
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            ENG_TO_NATIVE[code] = data
            NATIVE_TO_ENG[code] = {_normalize(v): k for k, v in data.items()}
            print(f"Corpus loaded: {code} ({len(data)} pairs)")
        except Exception as e:
            print(f"Corpus load error ({filename}): {e}")


_load_all()


def lookup_corpus(text: str, target_lang: str, source_lang: str = "english") -> Optional[str]:
    if not text:
        return None
    key = _normalize(text)

    if source_lang in ("english", "en", "auto") and target_lang in ENG_TO_NATIVE:
        return ENG_TO_NATIVE[target_lang].get(key)

    if target_lang in ("english", "en") and source_lang in NATIVE_TO_ENG:
        return NATIVE_TO_ENG[source_lang].get(key)

    if source_lang in NATIVE_TO_ENG and target_lang in ENG_TO_NATIVE:
        english = NATIVE_TO_ENG[source_lang].get(key)
        if english:
            return ENG_TO_NATIVE[target_lang].get(english)

    return None


def get_corpus_stats() -> dict:
    return {code: len(pairs) for code, pairs in ENG_TO_NATIVE.items()}


def get_supported_languages() -> list:
    return list(ENG_TO_NATIVE.keys())
