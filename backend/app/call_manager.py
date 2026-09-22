"""
In-memory call session manager for LingoLink AI Call Center.
"""
import asyncio
import random
import time
from typing import Optional, Dict, List
from fastapi import WebSocket


def generate_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choices(alphabet, k=6))


class CallSession:
    def __init__(self, code: str):
        self.code = code
        self.agent: Optional[WebSocket] = None
        self.caller: Optional[WebSocket] = None
        self.messages: List[dict] = []
        self.created_at = time.time()
        self.lock = asyncio.Lock()
        self.ai_mode: bool = True  # AI answers by default; agent can toggle off

    def is_full(self) -> bool:
        return self.agent is not None and self.caller is not None

    def is_empty(self) -> bool:
        return self.agent is None and self.caller is None


class CallManager:
    def __init__(self):
        self.sessions: Dict[str, CallSession] = {}
        self.lock = asyncio.Lock()

    async def create_session(self) -> CallSession:
        async with self.lock:
            for _ in range(10):
                code = generate_code()
                if code not in self.sessions:
                    session = CallSession(code)
                    self.sessions[code] = session
                    return session
            raise RuntimeError("Could not generate unique session code")

    async def get_session(self, code: str) -> Optional[CallSession]:
        return self.sessions.get(code.upper())

    async def join(self, code: str, role: str, ws: WebSocket) -> Optional[CallSession]:
        async with self.lock:
            session = self.sessions.get(code.upper())
            if not session:
                return None
            if role == "agent":
                if session.agent is not None:
                    return None
                session.agent = ws
            elif role == "caller":
                if session.caller is not None:
                    return None
                session.caller = ws
            else:
                return None
            return session

    async def leave(self, session: CallSession, role: str):
        async with self.lock:
            if role == "agent":
                session.agent = None
            elif role == "caller":
                session.caller = None
            if session.is_empty():
                self.sessions.pop(session.code, None)

    async def broadcast(self, session: CallSession, message: dict, exclude_role: Optional[str] = None):
        for role_name, ws in (("agent", session.agent), ("caller", session.caller)):
            if ws is None:
                continue
            if exclude_role and role_name == exclude_role:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                pass

    async def count_sessions(self) -> int:
        return len(self.sessions)


manager = CallManager()