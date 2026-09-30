"""Validated telemetry ingestion; hardware adapters implement SensorProvider."""
from datetime import datetime, timedelta, timezone
from typing import Literal, Protocol
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator

from backend.db import Database, now_iso, parse_time
from backend.domain.repository import field, history, pump_state


class SensorReadingIn(BaseModel):
    id: str | None = Field(default=None, max_length=100)
    field_id: str = Field(min_length=1, max_length=40)
    timestamp: str = Field(default_factory=now_iso)
    soil_moisture: float = Field(ge=0, le=100)
    soil_temperature: float = Field(ge=-10, le=70)
    air_temperature: float = Field(ge=-20, le=65)
    humidity: float = Field(ge=0, le=100)
    rainfall: float = Field(ge=0, le=300)
    light_intensity: float = Field(ge=0, le=200000)
    soil_ec: float = Field(ge=0, le=20)
    soil_ph: float = Field(ge=0, le=14)
    water_level: float = Field(ge=0, le=100)
    pump_status: Literal["ON", "OFF", "FAULT"]
    battery: float = Field(ge=0, le=100)
    solar_generation: float = Field(ge=0, le=40)
    flow_rate: float = Field(ge=0, le=500)
    node_voltage: float = Field(ge=0, le=5)
    energy_harvested: float = Field(ge=0, le=100)
    source: Literal["simulated", "esp32", "lora", "bluetooth", "wifi", "http"] = "simulated"

    @field_validator("timestamp")
    @classmethod
    def valid_timestamp(cls, value: str) -> str:
        try:
            parsed = parse_time(value)
            if parsed.tzinfo is None or parsed > datetime.now(timezone.utc).replace(microsecond=0).astimezone(timezone.utc) + __import__('datetime').timedelta(minutes=10):
                raise ValueError("Timestamp requires timezone and cannot be more than 10 minutes ahead")
        except (TypeError, ValueError) as exc:
            raise ValueError("Invalid timestamp; use UTC ISO-8601") from exc
        return value


class SensorProvider(Protocol):
    """ESP32/LoRa/Bluetooth/Wi-Fi adapters can implement this interface."""
    def read(self, field_id: str) -> SensorReadingIn: ...


class DemoSensorProvider:
    def __init__(self, db: Database):
        self.db = db

    def read(self, field_id: str) -> SensorReadingIn:
        if not field(self.db, field_id):
            raise ValueError("Unknown field")
        previous = history(self.db, "sensor_readings", field_id, 1)[-1]
        pump = pump_state(self.db, field_id)
        on = pump["status"] == "ON"
        return SensorReadingIn(
            field_id=field_id, soil_moisture=round(max(21 if field_id == "FIELD_02" else 24 if field_id == "FIELD_03" else 28,
                min(100, previous["soil_moisture"] +
                (0.9 if on else -0.16 if field_id == "FIELD_02" else -0.04))), 1),
            soil_temperature=previous["soil_temperature"], air_temperature=previous["air_temperature"],
            humidity=previous["humidity"], rainfall=0, light_intensity=previous["light_intensity"],
            soil_ec=previous["soil_ec"], soil_ph=previous["soil_ph"], water_level=previous["water_level"],
            pump_status="FAULT" if pump["status"] == "FAULT" else "ON" if on else "OFF", battery=previous["battery"],
            solar_generation=previous["solar_generation"], flow_rate=pump["flow_rate"] if on else 0,
            node_voltage=previous["node_voltage"], energy_harvested=previous["energy_harvested"],
        )


def ingest(db: Database, reading: SensorReadingIn) -> dict:
    if not field(db, reading.field_id):
        raise ValueError("Unknown field")
    recent = history(db, "sensor_readings", reading.field_id, 1)
    quality = "valid"
    if recent:
        delta_minutes = abs((parse_time(reading.timestamp) - parse_time(recent[-1]["timestamp"])).total_seconds()) / 60
        if delta_minutes < 5 and abs(recent[-1]["soil_moisture"] - reading.soil_moisture) > 20:
            quality = "suspect"
    if reading.pump_status == "ON" and reading.flow_rate == 0:
        quality = "suspect"
    item = reading.model_dump()
    item["id"] = item["id"] or str(uuid4())
    item["quality"] = quality
    with db.connection() as conn:
        conn.execute("""INSERT OR IGNORE INTO sensor_readings
            (id,field_id,timestamp,soil_moisture,soil_temperature,air_temperature,humidity,rainfall,
             light_intensity,soil_ec,soil_ph,water_level,pump_status,battery,solar_generation,flow_rate,
             node_voltage,energy_harvested,source,quality)
            VALUES (:id,:field_id,:timestamp,:soil_moisture,:soil_temperature,:air_temperature,:humidity,:rainfall,
                    :light_intensity,:soil_ec,:soil_ph,:water_level,:pump_status,:battery,:solar_generation,:flow_rate,
                    :node_voltage,:energy_harvested,:source,:quality)""", item)
    db.audit("sensor_ingested", reading.field_id, {"id": item["id"], "quality": quality, "source": reading.source})
    return item
