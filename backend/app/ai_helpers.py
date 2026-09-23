"""
Shared AI helper functions for the Call Center.

Used by both:
- /ai/reply HTTP endpoint (manual testing, agent draft replies)
- WebSocket auto-AI (backend replies on behalf of the caller automatically)
"""
import os
import httpx
from typing import List, Optional

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "qwen/qwen3.8-27b"

SYSTEM_PROMPT = (
    "You are a friendly, professional customer service assistant for LingoLink AI, "
    "a real-time translation platform used across Africa. "
    "Answer in a warm, concise way (1-3 short sentences max). "
    "If the caller asks something you cannot help with, politely offer to connect them "
    "with a human agent. Never invent prices, guarantees, or features. "
    "If the caller speaks a Ugandan language, they may only know a few words — "
    "be patient and helpful. Do not repeat the caller's question back. Just answer."
)


def translate_safe(text: str, source: str, target: str) -> str:
    """Translate via fast_translate. Falls back to original text on failure."""
    if not text or not text.strip():
        return text

    src = (source or "auto").lower()
    tgt = (target or "english").lower()

    if src == tgt:
        return text
    if src == "en":
        src = "english"
    if tgt == "en":
        tgt = "english"

    try:
        from app.fast_translate import fast_translate  # type: ignore
        result = fast_translate(text, tgt, src)
        if result and result.strip():
            return result
        return text
    except Exception as e:
        print(f"[translate_safe] failed ({src}->{tgt}): {e}")
        return text


async def generate_ai_reply(
    caller_text: str,
    caller_language: str,
    context: Optional[List[dict]] = None,
) -> dict:
    """
    Generate an AI reply in the caller's language.

    Args:
        caller_text: what the caller said (in their language)
        caller_language: e.g. "luganda", "english", "swahili"
        context: list of {"role": "user"|"assistant", "content": str}
                 Content should be in English (we translate before sending).

    Returns:
        {
          "reply_english": str,
          "reply_original": str,
          "context": list,      # updated context to persist on session
        }
    """
    if not GROQ_API_KEY:
        return {
            "reply_english": "Sorry, the AI is not configured right now.",
            "reply_original": "Sorry, the AI is not configured right now.",
            "context": context or [],
        }

    caller_text = (caller_text or "").strip()
    if not caller_text:
        return {
            "reply_english": "",
            "reply_original": "",
            "context": context or [],
        }

    caller_lang = (caller_language or "english").lower()

    # Translate caller's message to English for the LLM
    if caller_lang in ("english", "en", "auto"):
        text_en = caller_text
    else:
        text_en = translate_safe(caller_text, caller_lang, "english")

    # Build Groq messages
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in (context or []):
        role = "user" if m.get("role") == "user" else "assistant"
        messages.append({"role": role, "content": m.get("content", "")})
    messages.append({"role": "user", "content": text_en})

    # Call Groq
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                GROQ_URL,
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": GROQ_MODEL,
                    "messages": messages,
                    "temperature": 0.5,
                    "max_tokens": 300,
                },
            )
            if r.status_code != 200:
                print(f"[generate_ai_reply] Groq error {r.status_code}: {r.text[:300]}")
                return {
                    "reply_english": "I had trouble processing that. Could you rephrase?",
                    "reply_original": "I had trouble processing that. Could you rephrase?",
                    "context": context or [],
                }
            data = r.json()
            reply_en = (data["choices"][0]["message"]["content"] or "").strip()
    except Exception as e:
        print(f"[generate_ai_reply] error: {e}")
        return {
            "reply_english": "Connection issue on my side. Please try again.",
            "reply_original": "Connection issue on my side. Please try again.",
            "context": context or [],
        }

    # Translate back to caller's language
    if caller_lang in ("english", "en", "auto"):
        reply_original = reply_en
    else:
        reply_original = translate_safe(reply_en, "english", caller_lang)

    # Update context (stored in English)
    new_context = list(context or [])
    new_context.append({"role": "user", "content": text_en})
    new_context.append({"role": "assistant", "content": reply_en})
    new_context = new_context[-20:]

    return {
        "reply_english": reply_en,
        "reply_original": reply_original,
        "context": new_context,
    }


async def generate_tts_audio(text: str, language: str, gender: str = "female") -> Optional[bytes]:
    """
    Generate speech audio for the given text.

    Returns raw audio bytes (WAV or MP3) or None on failure.
    Reuses the /tts/speak pipeline directly.
    """
    if not text or not text.strip():
        return None

    lang = (language or "english").lower()
    gen = (gender or "female").lower()

    sunbird_langs = {
        "luganda", "acholi", "ateso", "runyankole", "runyankore",
        "rukiga", "swahili",
    }

    try:
        from app.routers.tts import sunbird_tts, edge_tts_generate, SUNBIRD_VOICES, EDGE_VOICES

        # Path 1: Ugandan → Sunbird
        if lang in sunbird_langs and lang in SUNBIRD_VOICES:
            print(f"[TTS] Trying Sunbird for {lang}...")
            audio = sunbird_tts(text, lang, gen)
            if audio:
                print(f"[TTS] Sunbird returned {len(audio)} bytes")
                return audio
            print(f"[TTS] Sunbird failed, falling back to Edge-TTS")

        # Path 2: Edge-TTS
        voice_entry = EDGE_VOICES.get(lang)
        if not voice_entry:
            voice_entry = {"male": "en-US-GuyNeural", "female": "en-US-JennyNeural"}
        voice = voice_entry.get(gen) or voice_entry.get("female") or "en-US-JennyNeural"

        print(f"[TTS] Using Edge-TTS voice={voice}")
        audio = await edge_tts_generate(text, voice, "+0%")
        if audio:
            print(f"[TTS] Edge-TTS returned {len(audio)} bytes")
            return audio
    except Exception as e:
        print(f"[TTS] error: {e}")

    return None