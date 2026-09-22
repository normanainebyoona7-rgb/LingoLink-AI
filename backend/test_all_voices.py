import requests, os, json
from dotenv import load_dotenv
load_dotenv()

key = os.getenv('SUNBIRD_API_KEY', '')
headers = {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}

# All known Sunbird voices per language
VOICES = {
    'luganda': ('lug', ['salt_lug_0001', 'waxal_lug_0002', 'waxal_lug_0003',
                        'waxal_lug_0004', 'waxal_lug_0005', 'waxal_lug_0006',
                        'waxal_lug_0007', 'waxal_lug_0008']),
    'acholi': ('ach', ['salt_ach_0001', 'waxal_ach_0001', 'waxal_ach_0005',
                       'waxal_ach_0006', 'waxal_ach_0008']),
    'runyankole': ('nyn', ['salt_nyn_0001', 'waxal_nyn_0003', 'waxal_nyn_0004',
                           'waxal_nyn_0007', 'waxal_nyn_0008']),
    'ateso': ('teo', ['salt_teo_0001']),
    'swahili': ('swa', ['waxal_swa_0006', 'waxal_swa_0007']),
    'english': ('eng', ['salt_eng_0001', 'salt_eng_0002', 'salt_eng_0003']),
}

# Test text per language
TEST_TEXT = {
    'luganda': 'Oli otya, otya gyendi',
    'acholi': 'Itye nining',
    'runyankole': 'Ori ota',
    'ateso': 'Yoga, itooma noi',
    'swahili': 'Habari yako',
    'english': 'Hello, how are you today',
}

out_dir = os.path.join(os.path.dirname(__file__), 'voice_samples')
os.makedirs(out_dir, exist_ok=True)

for lang, (code, voices) in VOICES.items():
    print(f'\n=== {lang.upper()} ({code}) — {len(voices)} voices ===')
    for voice in voices:
        try:
            payload = {'text': TEST_TEXT[lang], 'language': code, 'voice': voice}
            r = requests.post(
                'https://api.sunbird.ai/tasks/audio/speech',
                headers=headers,
                json=payload,
                timeout=90
            )
            if r.status_code == 200:
                data = r.json()
                audio_url = data.get('audio_url')
                if audio_url:
                    audio = requests.get(audio_url, timeout=30)
                    if audio.status_code == 200:
                        path = os.path.join(out_dir, f'{lang}_{voice}.wav')
                        with open(path, 'wb') as f:
                            f.write(audio.content)
                        print(f'  ✅ {voice} → {lang}_{voice}.wav ({len(audio.content)} bytes)')
                    else:
                        print(f'  ❌ {voice} download failed: {audio.status_code}')
                else:
                    print(f'  ❌ {voice} no audio_url')
            else:
                print(f'  ❌ {voice} status {r.status_code}')
        except Exception as e:
            print(f'  ❌ {voice} error: {e}')

print(f'\nAll samples saved to: {out_dir}')
print('Listen to each file and tell me: which are female, which are male, which sound best.')