import requests

r = requests.post('http://localhost:8000/auth/login', data={'username': 'admin', 'password': 'admin123'})
token = r.json()['access_token']
h = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

tests = [
    ('aba', 'runyankore', 'english'),
    ('Good morning', 'english', 'spanish'),
    ('Bonjour', 'french', 'german'),
    ('Buenos días', 'spanish', 'luganda'),
    ('bad things abound!', 'english', 'acholi'),
    ('Hello my friend', 'english', 'french'),
]

for text, src, tgt in tests:
    r2 = requests.post(
        'http://localhost:8000/translate/text',
        headers=h,
        json={'text': text, 'source_language': src, 'target_language': tgt}
    )
    d = r2.json()
    result = d.get('translated_text', 'ERROR')
    provider = d.get('provider', '?')
    print(f'{src}→{tgt}: {result[:80]}')
    print(f'    provider: {provider}')
    print()