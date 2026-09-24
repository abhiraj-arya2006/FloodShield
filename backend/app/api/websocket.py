import asyncio
import json
from datetime import datetime, timezone
from typing import List, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.app.simulation.engine import simulation_engine
from backend.app.alerts.service import alert_service

router = APIRouter(tags=["WebSocket Live Feed"])

class ConnectionManager:
    """Manages active WebSocket connections and broadcasts typed envelopes."""
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message_type: str, payload: dict):
        if not self.active_connections:
            return
            
        envelope = {
            "type": message_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
            "is_simulated": True
        }
        text = json.dumps(envelope)
        
        # Dispatch to all clients, removing disconnected ones
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_text(text)
            except Exception:
                disconnected.add(connection)
                
        for dead_conn in disconnected:
            self.active_connections.discard(dead_conn)

manager = ConnectionManager()

@router.websocket("/ws/live")
async def websocket_live_feed(websocket: WebSocket):
    """
    Live WebSocket feed delivering typed envelopes:
    - simulation_state
    - weather_update
    - alert_event
    """
    await manager.connect(websocket)
    try:
        # Send initial state immediately
        await websocket.send_text(json.dumps({
            "type": "simulation_state",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": simulation_engine.get_state().model_dump(),
            "is_simulated": True
        }))
        
        # Listen for any incoming client commands or keep-alive pings
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("action") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong", "is_simulated": True}))
            except Exception:
                pass
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
