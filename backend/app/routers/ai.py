"""
AI reply endpoint for hybrid Call Center.

Given a caller's message in their own language, this endpoint:
  1. Translates it to English (for the LLM)
  2. Sends to Groq for a contextual reply
  3. Translates the reply back into the caller's language
  4. Returns both the English reply and the caller-language reply
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict
import os
import httpx

router = APIRouter(prefix="/ai", tags=["ai"])

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = (
    "You are a friendly, professional customer service assistant for LingoLink AI, "
    "a real-time translation platform used across Africa. "
    "Answer in a warm, concise way (1-3 short sentences max). "
    "If the caller asks something you cannot help with, politely offer to connect them "
    "with a human agent. Never invent prices, guarantees, or features. "
    "If the caller speaks a Ugandan language, they may only know a few words — "
    "be patient and helpful. Do not repeat the caller's question back. Just answer."
)


class ChatMessage(BaseModel):
    role: str       # "user" or "assistant"
    content: str


class AIRequest(BaseModel):
    caller_text: str
    caller_language: str = "english"
    context: Optional[List[ChatMessage]] = []


class AIResponse(BaseModel):
    ai_reply_english: str
    ai_reply_original: str
    model: str
    context: List[ChatMessage]


def _translate(text: str, source: str, target: str) -> str:
    """
    Call the existing fast_translate pipeline internally.

    Signature in fast_translate.py: fast_translate(text, target_lang, source_lang="auto")
    NOTE the argument order: TARGET first, SOURCE second.
    """
    if not text or not text.strip():
        return text

    src = (source or "auto").lower()
    tgt = (target or "english").lower()

    if src == tgt:
        return text
    if src in ("en",):
        src = "english"
    if tgt in ("en",):
        tgt = "english"

    try:
        from app.fast_translate import fast_translate  # type: ignore
        result = fast_translate(text, tgt, src)
        if result and result.strip():
            return result
        return text
    except Exception as e:
        print(f"[ai._translate] failed ({src}->{tgt}): {e}")
        return text


@router.post("/reply", response_model=AIResponse)
async def ai_reply(req: AIRequest):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")

    caller_text = (req.caller_text or "").strip()
    if not caller_text:
        raise HTTPException(status_code=400, detail="caller_text is empty")

    caller_lang = (req.caller_language or "english").lower()

    # ---- 1. Translate caller message to English for the LLM ----
    if caller_lang in ("english", "en", "auto"):
        caller_text_en = caller_text
    else:
        caller_text_en = _translate(caller_text, caller_lang, "english")

    # ---- 2. Build messages for Groq ----
    messages: List[Dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]

    for m in req.context or []:
        role = "user" if m.role == "user" else "assistant"
        messages.append({"role": role, "content": m.content})

    messages.append({"role": "user", "content": caller_text_en})

    # ---- 3. Call Groq ----
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
                    "max_tokens": 200,
                },
            )
            if r.status_code != 200:
                print(f"[ai.reply] Groq error {r.status_code}: {r.text[:400]}")
                raise HTTPException(status_code=502, detail=f"Groq error: {r.status_code}")
            data = r.json()
            reply_en = (data["choices"][0]["message"]["content"] or "").strip()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Groq timed out")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ai.reply] unexpected: {e}")
        raise HTTPException(status_code=500, detail="AI generation failed")

    # ---- 4. Translate reply back to caller's language ----
    if caller_lang in ("english", "en", "auto"):
        reply_original = reply_en
    else:
        reply_original = _translate(reply_en, "english", caller_lang)

    # ---- 5. Update rolling context ----
    new_context = list(req.context or [])
    new_context.append(ChatMessage(role="user", content=caller_text_en))
    new_context.append(ChatMessage(role="assistant", content=reply_en))
    new_context = new_context[-20:]

    return AIResponse(
        ai_reply_english=reply_en,
        ai_reply_original=reply_original,
        model=GROQ_MODEL,
        context=new_context,
    )


@router.get("/health")
async def ai_health():
    return {
        "status": "ok",
        "groq_configured": bool(GROQ_API_KEY),
        "model": GROQ_MODEL,
    }