import requests

r = requests.post('http://localhost:8000/auth/login', data={'username':'admin','password':'admin123'})
tok = r.json()['access_token']
h = {'Authorization': f'Bearer {tok}', 'Content-Type':'application/json'}

tests = [
    ('swahili', 'english', 'Habari yako'),
    ('sw', 'english', 'Habari yako'),      # ← the likely culprit
    ('swa', 'english', 'Habari yako'),     # ← also possible
    ('auto', 'english', 'Habari yako'),
    ('swahili', 'english', 'asante'),
]

for src, tgt, text in tests:
    r = requests.post('http://localhost:8000/translate/text', headers=h,
                      json={'text': text, 'source_language': src, 'target_language': tgt})
    result = r.json().get('translated_text', r.text)
    status = 'OK' if result and result.strip() != text.strip() else 'ECHO'
    print(f'[{status}] {src} -> {tgt}: "{text}" -> "{result}"')