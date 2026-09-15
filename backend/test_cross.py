import requests

r = requests.post('http://localhost:8000/auth/login', data={'username': 'admin', 'password': 'admin123'})
token = r.json()['access_token']
h = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

tests = [
    ('Good morning', 'english', 'swahili'),
    ('Habari', 'swahili', 'english'),
    ('Good morning', 'english', 'kinyarwanda'),
    ('Bonjour', 'french', 'swahili'),
    ('Habari', 'swahili', 'luganda'),
    ('Good morning', 'english', 'luganda'),
    ('Good morning', 'english', 'spanish'),
    ('Bad things abound!', 'english', 'acholi'),
    ('How are you?', 'english', 'french'),
    ('Danke', 'german', 'italian'),
]

for text, src, tgt in tests:
    r2 = requests.post(
        'http://localhost:8000/translate/text',
        headers=h,
        json={'text': text, 'source_language': src, 'target_language': tgt}
    )
    d = r2.json()
    result = d.get('translated_text', 'ERROR')
    print(f'{src} -> {tgt}: {result[:60]}')