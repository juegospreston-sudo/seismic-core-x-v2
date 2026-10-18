from __future__ import annotations

from math import sqrt
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SensorReading(BaseModel):
    model_config = ConfigDict(extra="ignore")

    value: float | None = Field(default=None, ge=0)
    magnitude: float | None = Field(default=None, ge=0)
    acceleration: float | None = Field(default=None, ge=0)
    x: float | None = None
    y: float | None = None
    z: float | None = None
    direction: str = "--"

    @model_validator(mode="after")
    def validate_reading(self) -> SensorReading:
        axes_present = all(axis is not None for axis in (self.x, self.y, self.z))
        scalar_present = any(
            value is not None
            for value in (self.value, self.magnitude, self.acceleration)
        )
        if not axes_present and not scalar_present:
            raise ValueError("Falta value, magnitude, acceleration o x/y/z.")
        return self

    def signal_value(self) -> float:
        if all(axis is not None for axis in (self.x, self.y, self.z)):
            return sqrt(self.x**2 + self.y**2 + self.z**2)
        scalar = self.value or self.magnitude or self.acceleration
        if scalar is None:
            raise ValueError("No se pudo obtener la magnitud de la señal.")
        return scalar


class Telemetry(BaseModel):
    system_status: str = "SISTEMA ESTABLE"
    magnitude: float = 0.0
    filtered_signal: float = 0.0
    moving_average: float = 0.0
    level: int = 1
    internal_classification: str = "SIN ACTIVIDAD"
    events: int = 0
    relative_intensity: float = 0.0
    communication: str = "EN LÍNEA"
    calibration: str = "COMPLETADA"
    direction: str = "--"
    event_peak: float = 0.0
    event_duration: float = 0.0
    last_signal: float = 0.0
    movement_threshold: float = 0.035
    sudden_threshold: float = 0.060
    sustained_threshold: float = 0.060
    sustained_seconds: float = 3.0
    critical_threshold: float = 0.150
    samples_received: int = 0
    connected_sensors: int = 0


def parse_sensor_payload(payload: Any) -> SensorReading:
    if isinstance(payload, (int, float)):
        return SensorReading(value=abs(float(payload)))
    if not isinstance(payload, dict):
        raise ValueError("El mensaje debe ser un número o un objeto JSON.")
    return SensorReading.model_validate(payload)
