"""Weather provider adapter with cached offline fallback and explicit provenance."""
from uuid import uuid4
import json

from pydantic import BaseModel, Field
from backend.config import settings
from backend.db import Database, now_iso
from backend.domain.repository import latest
from backend.network import request_json


class ForecastPayload(BaseModel):
    temperature: float = Field(ge=-20, le=65)
    humidity: float = Field(ge=0, le=100)
    rainfall_mm: float = Field(ge=0, le=300)
    wind_kmh: float = Field(ge=0, le=250)
    rain_probability: float = Field(ge=0, le=100)
    forecast: list[dict]
    source: str = "configured weather provider"


def get_weather(db: Database, refresh: bool = False) -> dict:
    if refresh and settings.weather_api_url:
        try:
            raw = ForecastPayload.model_validate(request_json("GET", settings.weather_api_url))
            with db.connection() as conn:
                conn.execute("INSERT INTO weather_snapshots VALUES (?,?,?,?,?,?,?,?,?)",
                             (str(uuid4()), now_iso(), raw.temperature, raw.humidity, raw.rainfall_mm,
                              raw.wind_kmh, raw.rain_probability, json.dumps(raw.forecast), raw.source))
        except (ConnectionError, ValueError) as exc:
            db.audit("weather_refresh_failed", None, {"error": str(exc)})
    cached = latest(db, "weather_snapshots")
    if not cached:
        raise ValueError("No local forecast available")
    return cached
