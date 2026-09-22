from app.local_dictionaries import lookup_local, get_dictionary_stats
import json

print(json.dumps(get_dictionary_stats(), indent=2))
print()

tests = [
    ('english', 'swahili', 'hello'),
    ('english', 'swahili', 'thank you'),
    ('english', 'swahili', 'how are you'),
    ('english', 'swahili', 'water'),
    ('english', 'swahili', 'friend'),
    ('english', 'swahili', 'good morning'),
    ('english', 'swahili', 'i love you'),
    ('swahili', 'english', 'habari'),
    ('swahili', 'english', 'asante'),
    ('swahili', 'english', 'rafiki'),
]

for src, tgt, text in tests:
    result = lookup_local(text, tgt, src)
    print(f'{src}->{tgt}: "{text}" -> {result}')