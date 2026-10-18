from dataclasses import dataclass


@dataclass(frozen=True)
class SeismicSettings:
    movement_threshold: float = 0.035
    sudden_threshold: float = 0.060
    sustained_seconds: float = 3.0
    critical_threshold: float = 0.150
    moving_average_window: int = 20
    filter_weight: float = 0.2


settings = SeismicSettings()