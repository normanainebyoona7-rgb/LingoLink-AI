"""
Call Center WebSocket routes.

Endpoints:
  POST /call/create           → create new session, returns {code}
  GET  /call/{code}/status    → waiting / connected / unknown
  WS   /ws/call/{code}/{role} → realtime channel (role = agent | caller)

Message types (both directions unless noted):
  joined         (server → client) — session state + recent history
  peer_joined    (server → client) — the other side connected
  peer_left      (server → client) — the other side disconnected
  chat           (both ways)       — { role, text, language, ts }
  typing         (both ways)       — { role, is_typing }
  ai_toggle      (agent → server)  — { enabled: bool }
  ping / pong    (client/server)   — keepalive
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from app.call_manager import manager
import time


router = APIRouter(tags=["call"])


@router.post("/call/create")
async def create_call():
    session = await manager.create_session()
    return {
        "code": session.code,
        "created_at": session.created_at,
        "ai_mode": session.ai_mode,
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

    # Send current state + history to the joiner
    await websocket.send_json({
        "type": "joined",
        "code": session.code,
        "role": role,
        "other_present": session.is_full(),
        "messages": session.messages[-50:],
        "ai_mode": session.ai_mode,
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
                msg = {
                    "type": "chat",
                    "role": role,
                    "text": (data.get("text") or "")[:2000],
                    "language": data.get("language") or "auto",
                    "ts": time.time(),
                }
                session.messages.append(msg)
                if len(session.messages) > 200:
                    session.messages = session.messages[-200:]
                await manager.broadcast(session, msg)

            elif msg_type == "typing":
                await manager.broadcast(session, {
                    "type": "typing",
                    "role": role,
                    "is_typing": bool(data.get("is_typing")),
                }, exclude_role=role)

            elif msg_type == "ai_toggle":
                # Only agent can flip this
                if role == "agent":
                    session.ai_mode = bool(data.get("enabled"))
                    await manager.broadcast(session, {
                        "type": "ai_mode",
                        "enabled": session.ai_mode,
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