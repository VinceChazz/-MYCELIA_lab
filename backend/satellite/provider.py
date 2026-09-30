"""Multispectral observation boundary: local mock today, replaceable provider later."""
from typing import Protocol

from backend.db import Database
from backend.domain.repository import history


class SatelliteProvider(Protocol):
    def observations(self, field_id: str) -> list[dict]: ...


class CachedSatelliteProvider:
    def __init__(self, db: Database):
        self.db = db

    def observations(self, field_id: str) -> list[dict]:
        return history(self.db, "satellite_observations", field_id, 12)


def vegetation_trend(observations: list[dict]) -> dict:
    if len(observations) < 2:
        return {"direction": "unknown", "change": 0, "consecutive_declines": 0}
    values = [o["ndvi"] for o in observations]
    decline = 0
    for a, b in zip(reversed(values[:-1]), reversed(values[1:])):
        if b < a - 0.005:
            decline += 1
        else:
            break
    change = round(values[-1] - values[-2], 3)
    return {"direction": "declining" if change < -0.01 else "improving" if change > 0.01 else "stable",
            "change": change, "consecutive_declines": decline}
