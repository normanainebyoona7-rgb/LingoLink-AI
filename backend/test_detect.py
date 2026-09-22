from app.fast_translate import detect_language, _lang_hint

for text in ['Habari yako', 'asante', 'Bonjour', 'Hello how are you', 'Oli otya', 'Itye nining']:
    hint = _lang_hint(text)
    detected = detect_language(text)
    print(f'"{text}"')
    print(f'  hint: {hint}')
    print(f'  detect: {detected}')
    print()