import os
from dataclasses import dataclass


@dataclass(frozen=True)
class SeismicSettings:
    movement_threshold: float = 0.035
    sudden_threshold: float = 0.060
    sustained_seconds: float = 3.0
    critical_threshold: float = 0.150
    moving_average_window: int = 20
    filter_weight: float = 0.2
    event_end_seconds: float = 1.0
    alert_stable_seconds: float = 5.0
    alert_sender_name: str = os.getenv("ALERTAS_SENDER_NAME", "MONITOR SÍSMICO")
    alert_sender_email: str = os.getenv(
        "ALERTAS_SENDER_EMAIL", "sismoencurso@gmail.com"
    )

    @property
    def alert_recipients(self) -> list[str]:
        return [
            address.strip()
            for address in os.getenv("ALERTAS_EMAILS", "").split(",")
            if "@" in address and "." in address.rsplit("@", 1)[-1]
        ]


settings = SeismicSettings()