from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.seismic_service import seismic_service

router = APIRouter()


@router.websocket("/ws/dashboard")
async def dashboard_websocket(websocket: WebSocket) -> None:
    await websocket.accept()
    await seismic_service.add_dashboard(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        seismic_service.remove_dashboard(websocket)
