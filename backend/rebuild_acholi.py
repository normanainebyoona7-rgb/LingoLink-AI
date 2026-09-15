"""Rebuild Acholi dictionary - keeps longer sentences"""
from datasets import load_dataset
import json

print('📥 Loading Acholi dataset...')
ds = load_dataset('michsethowusu/english-acholi_sentence-pairs_mt560')
pairs = ds['train']
print(f'✅ Loaded {len(pairs)} pairs')

eng_to_ach = {}
ach_to_eng = {}

for row in pairs:
    eng = row.get('eng', '').strip()
    ach = row.get('ach', '').strip()
    if not eng or not ach:
        continue
    
    eng_key = eng.lower().strip()
    ach_key = ach.lower().strip()
    
    if len(eng) <= 300:
        if eng_key not in eng_to_ach or len(ach) < len(eng_to_ach[eng_key]):
            eng_to_ach[eng_key] = ach
    
    if len(ach) <= 300:
        if ach_key not in ach_to_eng or len(eng) < len(ach_to_eng[ach_key]):
            ach_to_eng[ach_key] = eng

print(f'✅ eng→ach: {len(eng_to_ach)}')
print(f'✅ ach→eng: {len(ach_to_eng)}')

with open('acholi_dict_filtered.json', 'w', encoding='utf-8') as f:
    json.dump({
        'eng_to_ach': eng_to_ach,
        'ach_to_eng': ach_to_eng
    }, f, ensure_ascii=False, indent=2)

print('💾 Saved to acholi_dict_filtered.json')
print(f'\n🔍 Test: "bad things abound!" → {eng_to_ach.get("bad things abound!", "NOT FOUND")}')
print(f'🔍 Test: "in what areas?" → {eng_to_ach.get("in what areas?", "NOT FOUND")}')