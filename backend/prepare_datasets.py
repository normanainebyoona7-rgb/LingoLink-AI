from datasets import load_dataset
import json
import os

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# Map UgandaLex2 column names to your app's language codes
LANG_MAP = {
    "Acholi": "acholi",
    "Alur": "alur",
    "Ateso": "ateso",
    "Ganda": "luganda",
    "Jopadhola": "adhola",
    "Kakwa": "kakwa",
    "Kinyarwanda": "kinyarwanda",
    "Kumam": "kumam",
    "Lango": "lango",
    "Masaaba": "lumasaba",
    "Ng'akarimojong": "karamojong",
    "Nyankore": "runyankole",
    "Nyole": "nyole",
    "Soga": "lusoga",
    "Lugbara": "lugbara",
    "Gwere": "lugwere",
    "Swahili": "swahili",
    "Aringa": "aringa",
    "Gungu": "gungu",
    "Keliko": "keliko",
    "Talinga-Bwisi": "talinga",
    "Kebu": "kebu",
    "Nyoro": "runyoro",
    "Saamya-Gwe": "samia",
}

print("Loading UgandaLex2...")
ds = load_dataset("allandclive/UgandaLex2", split="train")
print(f"Loaded {len(ds)} rows across {len(ds.column_names)} columns")

# Build a per-language English -> native lookup
lang_pairs = {code: {} for code in LANG_MAP.values()}

for i, row in enumerate(ds):
    english = str(row.get("English", "")).strip()
    if not english:
        continue

    for col, code in LANG_MAP.items():
        native = str(row.get(col, "")).strip()
        if native:
            # Store lowercase English as key
            key = english.lower()
            if key not in lang_pairs[code]:
                lang_pairs[code][key] = native

    if (i + 1) % 1000 == 0:
        print(f"  Processed {i + 1} rows...")

print("\n=== Saving per-language corpus files ===")
for code, pairs in lang_pairs.items():
    if not pairs:
        print(f"  {code}: SKIPPED (no data)")
        continue
    out = os.path.join(OUTPUT_DIR, f"{code}_corpus.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(pairs, f, ensure_ascii=False, indent=2)
    size_kb = os.path.getsize(out) / 1024
    print(f"  {code}: {len(pairs)} pairs ({size_kb:.0f} KB)")

print("\nDone.")
