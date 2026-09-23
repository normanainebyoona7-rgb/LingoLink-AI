"""
Call Center WebSocket routes.

Now with auto-AI: when the caller sends a message and the session is in
AI mode, the backend automatically:
  1. Calls Groq for a reply
  2. Translates to the caller's language
  3. Generates TTS audio
  4. Broadcasts the AI reply text + audio back

The agent can watch live and take over, but doesn't have to be present.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.call_manager import manager
from app.ai_helpers import generate_ai_reply, generate_tts_audio
import time
import base64
import asyncio


router = APIRouter(tags=["call"])


class CreateCallRequest(BaseModel):
    agent_language: Optional[str] = "english"
    caller_language: Optional[str] = "luganda"
    ai_gender: Optional[str] = "female"


@router.post("/call/create")
async def create_call(req: Optional[CreateCallRequest] = None):
    agent_lang = (req.agent_language if req else None) or "english"
    caller_lang = (req.caller_language if req else None) or "luganda"
    ai_gender = (req.ai_gender if req else None) or "female"
    session = await manager.create_session(agent_lang, caller_lang, ai_gender)
    return {
        "code": session.code,
        "created_at": session.created_at,
        "ai_mode": session.ai_mode,
        "agent_language": session.agent_language,
        "caller_language": session.caller_language,
        "ai_gender": session.ai_gender,
    }


@router.get("/call/{code}/status")
async def call_status(code: str):
    session = await manager.get_session(code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "code": session.code,
        "agent_connected": session.agent is not None,
        "caller_connected": session.caller is not None,
        "waiting_for_caller": session.agent is not None and session.caller is None,
        "connected": session.is_full(),
        "message_count": len(session.messages),
        "ai_mode": session.ai_mode,
    }


async def _handle_auto_ai(session, caller_text: str):
    """
    Fire-and-forget AI reply. Runs in background so the WS loop isn't blocked.
    """
    try:
        # Notify both sides: AI is thinking
        await manager.broadcast(session, {
            "type": "ai_thinking",
            "value": True,
        })

        # Generate reply
        result = await generate_ai_reply(
            caller_text=caller_text,
            caller_language=session.caller_language,
            context=session.ai_context,
        )

        session.ai_context = result.get("context", session.ai_context)

        reply_original = result.get("reply_original", "").strip()
        if not reply_original:
            await manager.broadcast(session, {
                "type": "ai_thinking",
                "value": False,
            })
            return

        # Broadcast AI reply text
        ai_msg = {
            "type": "chat",
            "role": "ai",
            "text": reply_original,
            "language": session.caller_language,
            "ts": time.time(),
        }
        session.messages.append(ai_msg)
        if len(session.messages) > 200:
            session.messages = session.messages[-200:]
        await manager.broadcast(session, ai_msg)

        # Generate and send audio to caller
        audio = await generate_tts_audio(
            reply_original,
            session.caller_language,
            session.ai_gender,
        )

        if audio and session.caller is not None:
            try:
                audio_b64 = base64.b64encode(audio).decode("ascii")
                # Detect format roughly from bytes
                is_wav = audio[:4] == b"RIFF"
                fmt = "wav" if is_wav else "mp3"
                await session.caller.send_json({
                    "type": "ai_audio",
                    "audio": audio_b64,
                    "format": fmt,
                    "text": reply_original,
                })
                print(f"[auto_ai] sent {len(audio)} bytes of {fmt} to caller")
            except Exception as e:
                print(f"[auto_ai] audio send failed: {e}")

        await manager.broadcast(session, {
            "type": "ai_thinking",
            "value": False,
        })

    except Exception as e:
        print(f"[auto_ai] error: {e}")
        try:
            await manager.broadcast(session, {
                "type": "ai_thinking",
                "value": False,
            })
        except Exception:
            pass


@router.websocket("/ws/call/{code}/{role}")
async def call_ws(websocket: WebSocket, code: str, role: str):
    if role not in ("agent", "caller"):
        await websocket.close(code=4000, reason="Invalid role")
        return

    await websocket.accept()

    session = await manager.join(code, role, websocket)
    if session is None:
        await websocket.send_json({
            "type": "error",
            "message": "Session not found or role already taken",
        })
        await websocket.close(code=4004)
        return

    # Send current state to the joiner
    await websocket.send_json({
        "type": "joined",
        "code": session.code,
        "role": role,
        "other_present": session.is_full(),
        "messages": session.messages[-50:],
        "ai_mode": session.ai_mode,
        "agent_language": session.agent_language,
        "caller_language": session.caller_language,
    })

    await manager.broadcast(session, {
        "type": "peer_joined",
        "role": role,
    }, exclude_role=role)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "chat":
                text = (data.get("text") or "")[:2000]
                language = data.get("language") or (session.caller_language if role == "caller" else session.agent_language)

                msg = {
                    "type": "chat",
                    "role": role,
                    "text": text,
                    "language": language,
                    "ts": time.time(),
                }
                session.messages.append(msg)
                if len(session.messages) > 200:
                    session.messages = session.messages[-200:]
                await manager.broadcast(session, msg)

                # Auto-AI: only when caller sends AND ai_mode is on
                if role == "caller" and session.ai_mode and text.strip():
                    asyncio.create_task(_handle_auto_ai(session, text))

            elif msg_type == "typing":
                await manager.broadcast(session, {
                    "type": "typing",
                    "role": role,
                    "is_typing": bool(data.get("is_typing")),
                }, exclude_role=role)

            elif msg_type == "ai_toggle":
                if role == "agent":
                    session.ai_mode = bool(data.get("enabled"))
                    await manager.broadcast(session, {
                        "type": "ai_mode",
                        "enabled": session.ai_mode,
                    })

            elif msg_type == "set_languages":
                # agent sets caller's + agent's language mid-session
                if role == "agent":
                    if data.get("agent_language"):
                        session.agent_language = str(data["agent_language"]).lower()
                    if data.get("caller_language"):
                        session.caller_language = str(data["caller_language"]).lower()
                    await manager.broadcast(session, {
                        "type": "languages",
                        "agent_language": session.agent_language,
                        "caller_language": session.caller_language,
                    })

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong", "ts": time.time()})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[call_ws] error: {e}")
    finally:
        await manager.leave(session, role)
        await manager.broadcast(session, {
            "type": "peer_left",
            "role": role,
        }, exclude_role=role)