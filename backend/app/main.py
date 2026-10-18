from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.schemas.telemetry import Telemetry
from app.services.seismic_service import seismic_service
from app.websocket.dashboard import router as dashboard_router
from app.websocket.sensor import router as sensor_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    seismic_service._dashboard_clients.clear()
    seismic_service._sensor_clients.clear()


app = FastAPI(title="Seismic Core X", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.include_router(sensor_router)
app.include_router(dashboard_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/telemetry", response_model=Telemetry)
async def telemetry() -> dict[str, Any]:
    return seismic_service.telemetry.model_dump()
