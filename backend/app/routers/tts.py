async def sunbird_tts(text: str, language: str) -> bytes | None:
    """
    Call Sunbird TTS (single attempt). Returns audio bytes on success.
    Falls back to Edge-TTS on any failure.
    """
    if not SUNBIRD_API_KEY:
        return None

    lang_key = language.lower()
    if lang_key not in VOICE_MAP:
        return None

    speaker_id = VOICE_MAP[lang_key]["id"]

    timeout = httpx.Timeout(connect=15.0, read=120.0, write=15.0, pool=15.0)
    headers = {
        "Authorization": f"Bearer {SUNBIRD_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(
                SUNBIRD_TTS_URL,
                headers=headers,
                json={"text": text, "speaker_id": speaker_id},
            )

            if r.status_code != 200:
                print(f"Sunbird TTS {r.status_code} — falling back")
                return None

            data = r.json()
            audio_url = (
                (data.get("output") or {}).get("audio_url")
                or data.get("audio_url")
            )
            if not audio_url:
                return None

            audio_res = await client.get(audio_url, timeout=60.0)
            if audio_res.status_code != 200:
                return None
            return audio_res.content

    except httpx.TimeoutException:
        print(f"Sunbird TTS timeout for {language}")
        return None
    except Exception as e:
        print(f"Sunbird TTS exception: {str(e)[:150]}")
        return None