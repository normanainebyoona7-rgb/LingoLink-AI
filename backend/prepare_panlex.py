"""
Extract PanLex dictionary data for priority African languages.
Downloads only the needed TSV files, joins with English, saves as JSON.
"""
import csv
import json
import os
import requests
from collections import defaultdict

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app")
BASE_URL = "https://huggingface.co/datasets/cointegrated/panlex-meanings/resolve/main/data"

# PanLex language codes
LANGUAGES = {
    "lug": "luganda",
    "yor": "yoruba",
    "zul": "zulu",
    "hau": "hausa",
    "ibo": "igbo",
    "swa": "swahili_panlex",
    "som": "somali",
    "amh": "amharic_panlex",
    "afr": "afrikaans_panlex",
    "bem": "bemba_panlex",
}


def download_tsv(code, cache_dir="panlex_cache"):
    """Download a PanLex TSV file, caching locally."""
    os.makedirs(cache_dir, exist_ok=True)
    local_path = os.path.join(cache_dir, f"{code}.tsv")
    
    if os.path.exists(local_path):
        print(f"  Cached: {code}.tsv")
        return local_path
    
    url = f"{BASE_URL}/{code}.tsv"
    print(f"  Downloading {code}.tsv...")
    try:
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        with open(local_path, "w", encoding="utf-8") as f:
            f.write(r.text)
        size_kb = len(r.text) / 1024
        print(f"    Saved {size_kb:.0f} KB")
        return local_path
    except Exception as e:
        print(f"    FAILED: {str(e)[:100]}")
        return None


def load_meanings_by_id(path):
    """Load TSV: meaning_id -> list of words."""
    meanings = defaultdict(list)
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            meaning = row.get("meaning", "")
            text = row.get("txt", "").strip()
            if meaning and text:
                meanings[meaning].append(text)
    return meanings


def extract_language(panlex_code, app_name):
    """Join PanLex language with English, save as JSON."""
    print(f"\n=== {app_name} ({panlex_code}) ===")
    
    native_path = download_tsv(panlex_code)
    eng_path = download_tsv("eng")
    
    if not native_path or not eng_path:
        return 0
    
    native_meanings = load_meanings_by_id(native_path)
    eng_meanings = load_meanings_by_id(eng_path)
    
    print(f"  Native entries: {sum(len(v) for v in native_meanings.values())}")
    print(f"  English entries: {sum(len(v) for v in eng_meanings.values())}")
    
    # Join on meaning ID
    pairs = {}
    for meaning_id, native_words in native_meanings.items():
        eng_words = eng_meanings.get(meaning_id, [])
        if not eng_words:
            continue
        # Take first pair, prefer shorter words
        eng_word = min(eng_words, key=len)
        native_word = min(native_words, key=len)
        key = eng_word.lower().strip()
        if key and key not in pairs:
            pairs[key] = native_word.strip()
    
    out_path = os.path.join(OUTPUT_DIR, f"{app_name}_dict.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(pairs, f, ensure_ascii=False, indent=2)
    
    size_kb = os.path.getsize(out_path) / 1024
    print(f"  Saved {len(pairs)} pairs ({size_kb:.0f} KB)")
    return len(pairs)


if __name__ == "__main__":
    print("Extracting PanLex dictionaries...")
    results = {}
    for code, name in LANGUAGES.items():
        try:
            results[name] = extract_language(code, name)
        except Exception as e:
            print(f"  ERROR for {name}: {e}")
            results[name] = 0
    
    print("\n\n===== SUMMARY =====")
    total = 0
    for name, n in results.items():
        total += n
        status = "OK" if n > 0 else "SKIP"
        print(f"  [{status}] {name}: {n}")
    print(f"\nTotal: {total}")
