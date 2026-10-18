from __future__ import annotations

import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.services.seismic_service import seismic_service

router = APIRouter()


@router.websocket("/ws/sensor")
async def sensor_websocket(websocket: WebSocket) -> None:
    await websocket.accept()
    await seismic_service.add_sensor(websocket)
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            raw = message.get("text", message.get("bytes"))
            try:
                payload = json.loads(raw) if isinstance(raw, str) else raw
                await seismic_service.receive_reading(payload)
            except (ValueError, TypeError, ValidationError, json.JSONDecodeError) as exc:
                await websocket.send_json({"error": str(exc)})
    except WebSocketDisconnect:
        pass
    finally:
        seismic_service.remove_sensor(websocket)
        await seismic_service.broadcast()
