"""Filter Acholi dictionary to keep only useful short entries"""
import json
import re

print('📥 Loading acholi_dict.json...')
with open('acholi_dict.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

eng_to_ach = data['eng_to_ach']
ach_to_eng = data['ach_to_eng']

print(f'Before: {len(eng_to_ach)} English→Acholi')

# Filter: keep only entries where English is <= 8 words (short phrases)
filtered_eng_to_ach = {}
for eng, ach in eng_to_ach.items():
    word_count = len(eng.split())
    if word_count <= 8 and len(eng) <= 80:
        # Skip entries with verse citations (numbers like 22:20)
        if re.search(r'\d+:\d+', eng):
            continue
        # Skip parentheticals like (heb. 6:10)
        if re.search(r'\([^)]*\d+:', eng):
            continue
        filtered_eng_to_ach[eng] = ach

filtered_ach_to_eng = {}
for ach, eng in ach_to_eng.items():
    word_count = len(ach.split())
    if word_count <= 8 and len(ach) <= 80:
        if re.search(r'\d+:\d+', ach):
            continue
        filtered_ach_to_eng[ach] = eng

print(f'After: {len(filtered_eng_to_ach)} English→Acholi (short entries)')
print(f'After: {len(filtered_ach_to_eng)} Acholi→English (short entries)')

# Save filtered
with open('acholi_dict_filtered.json', 'w', encoding='utf-8') as f:
    json.dump({
        'eng_to_ach': filtered_eng_to_ach,
        'ach_to_eng': filtered_ach_to_eng
    }, f, ensure_ascii=False, indent=2)

print('💾 Saved to acholi_dict_filtered.json')

# Sample
print('\n📋 Sample short entries (English → Acholi):')
for i, (k, v) in enumerate(list(filtered_eng_to_ach.items())[:20]):
    print(f'  "{k}" → "{v}"')