"""Normalize Runyankore dictionary keys"""
import json
import os

INPUT = 'runyankore_extracted.json'

if not os.path.exists(INPUT):
    print(f'❌ {INPUT} not found. Run extract_dict.py first.')
    exit(1)

with open(INPUT, 'r', encoding='utf-8') as f:
    data = json.load(f)

def normalize(s):
    return s.lower().strip().rstrip('!?.,;:')

new_dict = {}
for k, v in data.items():
    new_dict[normalize(k)] = v

print(f'Before: {len(data)} entries')
print(f'After: {len(new_dict)} entries')

with open(INPUT, 'w', encoding='utf-8') as f:
    json.dump(new_dict, f, ensure_ascii=False, indent=2)

print(f'\n💾 Saved to {INPUT}')

# Test
test_keys = ['water', 'eat', 'friend']
for k in test_keys:
    print(f'  "{k}" → {new_dict.get(k, "NOT FOUND")}')