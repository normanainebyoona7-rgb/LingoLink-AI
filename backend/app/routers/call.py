"""
Call Center WebSocket routes.

Endpoints:
  POST /call/create           → create new session, returns {code}
  GET  /call/{code}/status    → is the session waiting / connected / unknown
  WS   /ws/call/{code}/{role} → main realtime channel (role = agent | caller)
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from app.call_manager import manager, CallSession
import time


router = APIRouter(tags=["call"])


@router.post("/call/create")
async def create_call():
    session = await manager.create_session()
    return {
        "code": session.code,
        "created_at": session.created_at,
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

    # Notify the other participant that we joined, and send back recent messages
    await websocket.send_json({
        "type": "joined",
        "code": session.code,
        "role": role,
        "other_present": (session.agent is not None and session.caller is not None),
        "messages": session.messages[-50:],
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
                # { type: "chat", text: str, language: str, source_lang?: str }
                msg = {
                    "type": "chat",
                    "role": role,
                    "text": (data.get("text") or "")[:2000],
                    "language": data.get("language") or "auto",
                    "ts": time.time(),
                }
                session.messages.append(msg)
                # Keep last 200 to bound memory
                if len(session.messages) > 200:
                    session.messages = session.messages[-200:]

                # Broadcast to BOTH (echo back to sender too, so UI is consistent)
                await manager.broadcast(session, msg)

            elif msg_type == "typing":
                await manager.broadcast(session, {
                    "type": "typing",
                    "role": role,
                    "is_typing": bool(data.get("is_typing")),
                }, exclude_role=role)

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