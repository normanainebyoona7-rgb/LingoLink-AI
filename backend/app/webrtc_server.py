import socketio
import uvicorn

# WebRTC Signaling Server
sio = socketio.AsyncServer(cors_allowed_origins="*", async_mode="asgi")
app = socketio.ASGIApp(sio)

# Store connected agents and call queues
connected_agents = {}
active_calls = {}
call_queues = {}

@sio.event
async def connect(sid, environ):
    print(f"Agent connected: {sid}")
    connected_agents[sid] = {"status": "available", "name": f"Agent_{sid[:6]}"}

@sio.event
async def disconnect(sid):
    print(f"Agent disconnected: {sid}")
    if sid in connected_agents:
        del connected_agents[sid]
    # End any active calls for this agent
    for call_id, call in list(active_calls.items()):
        if call.get("agent_sid") == sid:
            del active_calls[call_id]

@sio.event
async def agent_register(sid, data):
    """Register agent with name"""
    if sid in connected_agents:
        connected_agents[sid]["name"] = data.get("name", f"Agent_{sid[:6]}")
        await sio.emit("agent_registered", {"sid": sid, "name": connected_agents[sid]["name"]}, to=sid)

@sio.event
async def make_call(sid, data):
    """Agent initiates a call"""
    call_id = data.get("call_id", f"call_{sid[:6]}_{len(active_calls)}")
    target_language = data.get("language", "english")
    source_language = data.get("source_language", "english")
    
    call_data = {
        "call_id": call_id,
        "agent_sid": sid,
        "target_language": target_language,
        "source_language": source_language,
        "status": "active",
        "started_at": __import__("datetime").datetime.now().isoformat()
    }
    active_calls[call_id] = call_data
    
    await sio.emit("call_started", call_data, to=sid)
    return call_data

@sio.event
async def end_call(sid, data):
    """End an active call"""
    call_id = data.get("call_id")
    if call_id in active_calls:
        del active_calls[call_id]
        await sio.emit("call_ended", {"call_id": call_id}, to=sid)

@sio.event
async def stream_audio(sid, data):
    """Receive audio chunk and broadcast translation"""
    call_id = data.get("call_id")
    audio_base64 = data.get("audio")
    target_language = data.get("target_language", "english")
    
    if call_id in active_calls:
        # Broadcast to all agents (in production, route to specific agent)
        await sio.emit("audio_stream", {
            "call_id": call_id,
            "target_language": target_language,
            "timestamp": __import__("datetime").datetime.now().isoformat()
        }, to=sid)

@sio.event
async def simulate_incoming_call(sid, data=None):
    """Simulate a PSTN incoming call for testing"""
    call_id = f"pstn_call_{len(active_calls) + 1}"
    caller_number = data.get("caller_number", f"+256{__import__('random').randint(700000000, 799999999)}")
    language = data.get("language", "luganda")
    
    call_data = {
        "call_id": call_id,
        "caller_number": caller_number,
        "language": language,
        "status": "incoming",
        "timestamp": __import__("datetime").datetime.now().isoformat()
    }
    
    # Notify all connected agents
    for agent_sid in connected_agents:
        await sio.emit("incoming_call", call_data, to=agent_sid)
    
    return call_data

@sio.event
async def accept_call(sid, data):
    """Agent accepts incoming call"""
    call_id = data.get("call_id")
    active_calls[call_id] = {
        "call_id": call_id,
        "agent_sid": sid,
        "status": "active",
        "started_at": __import__("datetime").datetime.now().isoformat()
    }
    await sio.emit("call_accepted", active_calls[call_id], to=sid)

@sio.event
async def get_queue_status(sid):
    """Get current queue status"""
    available_agents = len(connected_agents)
    active_call_count = len(active_calls)
    return {
        "available_agents": available_agents,
        "active_calls": active_call_count,
        "queue_length": len(call_queues)
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
    print("WebRTC Signaling Server running on port 8001")