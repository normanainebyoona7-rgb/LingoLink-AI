"""Normalize dictionary keys by stripping punctuation"""
import json
import os

INPUT = 'acholi_dict_filtered.json'

if not os.path.exists(INPUT):
    print(f'❌ {INPUT} not found. Run filter_acholi_dict.py first.')
    exit(1)

with open(INPUT, 'r', encoding='utf-8') as f:
    data = json.load(f)

def normalize(s):
    return s.lower().strip().rstrip('!?.,;:')

# Normalize eng_to_ach
new_eng_to_ach = {}
for k, v in data.get('eng_to_ach', {}).items():
    new_eng_to_ach[normalize(k)] = v

# Normalize ach_to_eng
new_ach_to_eng = {}
for k, v in data.get('ach_to_eng', {}).items():
    new_ach_to_eng[normalize(k)] = v

print(f'Before: {len(data.get("eng_to_ach", {}))} eng→ach')
print(f'After: {len(new_eng_to_ach)} eng→ach')
print(f'Before: {len(data.get("ach_to_eng", {}))} ach→eng')
print(f'After: {len(new_ach_to_eng)} ach→eng')

with open(INPUT, 'w', encoding='utf-8') as f:
    json.dump({
        'eng_to_ach': new_eng_to_ach,
        'ach_to_eng': new_ach_to_eng
    }, f, ensure_ascii=False, indent=2)

print(f'\n💾 Saved to {INPUT}')

# Test
test_key = 'bad things abound'
print(f'\n🔍 Test lookup: "{test_key}"')
result = new_eng_to_ach.get(test_key, 'NOT FOUND')
print(f'   → {result}')