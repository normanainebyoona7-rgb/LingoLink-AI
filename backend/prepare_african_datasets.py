"""
Extract African language Bible parallel data.
Source: michsethowusu/african-bible-parallel (open, not gated)

Each config = one African language. Columns:
  verse_key, lang_code, local (native), en, fr, ar, zh, pt

We extract: English -> native pairs, capped at 5000 per language.
"""
from datasets import load_dataset
import json
import os

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app")
CAP = 5000

# Config code -> your internal language name
TARGETS = {
    "amh": "amharic",
    "afr": "afrikaans",
    "bem": "bemba",
    "hau": "hausa",
    "ibo": "igbo",
    "kin": "kinyarwanda",
    "yor": "yoruba",
    "zul": "zulu",
    "xho": "xhosa",
    "sna": "shona",
    "som": "somali",
    "lin": "lingala",
    "swh": "swahili_african",  # separate from UgandaLex2 swahili
    # Add more if you confirm the config exists
}

DS_ID = "michsethowusu/african-bible-parallel"


def extract(config_code, lang_name):
    print(f"\n=== {lang_name} ({config_code}) ===")
    try:
        ds = load_dataset(DS_ID, config_code, split="train", streaming=True)
    except Exception as e:
        print(f"  FAILED to load: {str(e)[:200]}")
        return 0

    pairs = {}
    count = 0
    skipped = 0

    for row in ds:
        en = (row.get("en") or "").strip()
        local = (row.get("local") or "").strip()

        if not en or not local:
            skipped += 1
            continue

        # Length sanity
        if len(en) > 500 or len(local) > 800:
            skipped += 1
            continue

        # Length ratio sanity
        ratio = max(len(en), len(local)) / max(1, min(len(en), len(local)))
        if ratio > 8:
            skipped += 1
            continue

        key = en.lower()
        if key not in pairs:
            pairs[key] = local
            count += 1

        if count >= CAP:
            break

    out_path = os.path.join(OUTPUT_DIR, f"{lang_name}_corpus.json")
    try:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(pairs, f, ensure_ascii=False, indent=2)
        size_kb = os.path.getsize(out_path) / 1024
        print(f"  Saved {count} pairs ({size_kb:.0f} KB)  [skipped={skipped}]")
    except Exception as e:
        print(f"  SAVE FAILED: {e}")

    return count


if __name__ == "__main__":
    print(f"Extracting African languages. Cap: {CAP} per language.")
    print(f"Output dir: {OUTPUT_DIR}")

    results = {}
    for code, name in TARGETS.items():
        try:
            results[name] = extract(code, name)
        except Exception as e:
            print(f"  UNEXPECTED ERROR for {name}: {e}")
            results[name] = 0

    print("\n\n===== SUMMARY =====")
    total = 0
    for name, n in results.items():
        total += n
        status = "OK" if n > 0 else "SKIP"
        print(f"  [{status}] {name}: {n}")
    print(f"\nTotal: {total}")
