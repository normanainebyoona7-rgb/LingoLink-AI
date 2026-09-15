"""Build Acholi dictionary from HuggingFace parallel corpus"""
from datasets import load_dataset
import json
import re

print('📥 Loading Acholi dataset...')
ds = load_dataset('michsethowusu/english-acholi_sentence-pairs_mt560')
pairs = ds['train']
print(f'✅ Loaded {len(pairs)} pairs')

# Build two-way dictionary (English -> Acholi and Acholi -> English)
eng_to_ach = {}
ach_to_eng = {}

for row in pairs:
    eng = row.get('eng', '').strip()
    ach = row.get('ach', '').strip()
    
    if not eng or not ach:
        continue
    
    # Normalize
    eng_key = eng.lower().strip()
    ach_key = ach.lower().strip()
    
    # Skip very long sentences (only keep phrases under 200 chars)
    if len(eng_key) > 200 or len(ach_key) > 200:
        continue
    
    # Store the SHORTEST translation for each word/phrase
    if eng_key not in eng_to_ach or len(ach) < len(eng_to_ach[eng_key]):
        eng_to_ach[eng_key] = ach
    if ach_key not in ach_to_eng or len(eng) < len(ach_to_eng[ach_key]):
        ach_to_eng[ach_key] = eng

print(f'📖 English→Acholi entries: {len(eng_to_ach)}')
print(f'📖 Acholi→English entries: {len(ach_to_eng)}')

# Save
with open('acholi_dict.json', 'w', encoding='utf-8') as f:
    json.dump({
        'eng_to_ach': eng_to_ach,
        'ach_to_eng': ach_to_eng
    }, f, ensure_ascii=False, indent=2)

print('💾 Saved to acholi_dict.json')

# Sample
print('\n📋 Samples (English → Acholi):')
for i, (k, v) in enumerate(list(eng_to_ach.items())[:10]):
    print(f'  "{k}" → "{v}"')