from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from app.core.config import SeismicSettings, settings
from app.schemas.telemetry import Telemetry, parse_sensor_payload


class SeismicService:
    """Processes readings and broadcasts telemetry to dashboard clients."""

    def __init__(self, configuration: SeismicSettings = settings) -> None:
        self.settings = configuration
        self.telemetry = Telemetry(
            movement_threshold=configuration.movement_threshold,
            sudden_threshold=configuration.sudden_threshold,
            sustained_threshold=configuration.sudden_threshold,
            sustained_seconds=configuration.sustained_seconds,
            critical_threshold=configuration.critical_threshold,
        )
        self._window: list[float] = []
        self._ema = 0.0
        self._event_started_at: float | None = None
        self._event_peak = 0.0
        self._last_sample_at: float | None = None
        self._dashboard_clients: set[WebSocket] = set()
        self._sensor_clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def add_dashboard(self, websocket: WebSocket) -> None:
        self._dashboard_clients.add(websocket)
        await self.send_to_dashboard(websocket)

    def remove_dashboard(self, websocket: WebSocket) -> None:
        self._dashboard_clients.discard(websocket)

    async def add_sensor(self, websocket: WebSocket) -> None:
        self._sensor_clients.add(websocket)
        self._update_connection_status()
        await self.broadcast()

    def remove_sensor(self, websocket: WebSocket) -> None:
        self._sensor_clients.discard(websocket)
        self._update_connection_status()

    async def receive_reading(self, payload: Any) -> None:
        reading = parse_sensor_payload(payload)
        value = reading.signal_value()
        now = time.monotonic()

        async with self._lock:
            filtered = (
                self.settings.filter_weight * value
                + (1 - self.settings.filter_weight) * self._ema
            )
            self._ema = filtered
            self._window.append(filtered)
            self._window = self._window[-self.settings.moving_average_window :]
            average = sum(self._window) / len(self._window)
            active = filtered >= self.settings.movement_threshold

            if active and self._event_started_at is None:
                self._event_started_at = now
                self._event_peak = filtered
            elif active:
                self._event_peak = max(self._event_peak, filtered)
            elif self._event_started_at is not None:
                self._event_started_at = None
                self._event_peak = 0.0

            duration = (
                now - self._event_started_at
                if self._event_started_at is not None
                else 0.0
            )
            level, classification = self._classify(filtered, duration)
            events = self.telemetry.events + (
                1 if active and self.telemetry.level == 1 and level > 1 else 0
            )
            intensity = min(
                100.0, (filtered / self.settings.critical_threshold) * 100
            )
            self._last_sample_at = now
            self.telemetry = Telemetry(
                system_status=(
                    "SISTEMA CRÍTICO" if level >= 4
                    else "ACTIVIDAD DETECTADA" if level > 1
                    else "SISTEMA ESTABLE"
                ),
                magnitude=value,
                filtered_signal=filtered,
                moving_average=average,
                level=level,
                internal_classification=classification,
                events=events,
                relative_intensity=intensity,
                communication=(
                    "EN LÍNEA" if self._sensor_clients else "SIN CONEXIÓN"
                ),
                calibration=self.telemetry.calibration,
                direction=reading.direction,
                event_peak=self._event_peak if active else self.telemetry.event_peak,
                event_duration=duration,
                movement_threshold=self.settings.movement_threshold,
                sudden_threshold=self.settings.sudden_threshold,
                sustained_threshold=self.settings.sudden_threshold,
                sustained_seconds=self.settings.sustained_seconds,
                critical_threshold=self.settings.critical_threshold,
                samples_received=self.telemetry.samples_received + 1,
                connected_sensors=len(self._sensor_clients),
            )
            await self.broadcast()

    async def broadcast(self) -> None:
        for websocket in tuple(self._dashboard_clients):
            try:
                await self.send_to_dashboard(websocket)
            except (RuntimeError, WebSocketDisconnect):
                self.remove_dashboard(websocket)

    async def send_to_dashboard(self, websocket: WebSocket) -> None:
        data = self.telemetry.model_dump()
        data["last_signal"] = (
            0.0
            if self._last_sample_at is None
            else max(0.0, time.monotonic() - self._last_sample_at)
        )
        await websocket.send_json(data)

    def _update_connection_status(self) -> None:
        self.telemetry = self.telemetry.model_copy(
            update={
                "connected_sensors": len(self._sensor_clients),
                "communication": (
                    "EN LÍNEA" if self._sensor_clients else "SIN CONEXIÓN"
                ),
            }
        )

    def _classify(self, value: float, duration: float) -> tuple[int, str]:
        if value >= self.settings.critical_threshold:
            return 4, "CRÍTICO"
        if value >= self.settings.sudden_threshold:
            return 3, "MOVIMIENTO BRUSCO"
        if (
            value >= self.settings.movement_threshold
            and duration >= self.settings.sustained_seconds
        ):
            return 2, "ACTIVIDAD SOSTENIDA"
        if value >= self.settings.movement_threshold:
            return 2, "MOVIMIENTO"
        return 1, "SIN ACTIVIDAD"


seismic_service = SeismicService()
