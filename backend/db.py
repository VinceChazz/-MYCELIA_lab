"""SQLite is the durable system of record. No network is required to read or write it."""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
from typing import Iterator

from backend.config import settings


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class Database:
    def __init__(self, path: str | None = None):
        self.path = path or settings.db_path
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=10000")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def initialize(self) -> None:
        with self.connection() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)

    def audit(self, kind: str, field_id: str | None, detail: dict) -> None:
        with self.connection() as conn:
            conn.execute(
                "INSERT INTO audit_events (timestamp,kind,field_id,detail_json) VALUES (?,?,?,?)",
                (now_iso(), kind, field_id, json.dumps(detail, ensure_ascii=False)),
            )


SCHEMA = """
CREATE TABLE IF NOT EXISTS farms (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, village TEXT NOT NULL,
    district TEXT NOT NULL, state TEXT NOT NULL, latitude REAL, longitude REAL
);
CREATE TABLE IF NOT EXISTS fields (
    id TEXT PRIMARY KEY, farm_id TEXT NOT NULL REFERENCES farms(id), name TEXT NOT NULL,
    crop TEXT NOT NULL, variety TEXT NOT NULL, sown_at TEXT NOT NULL,
    area_acres REAL NOT NULL CHECK(area_acres>0), soil_type TEXT NOT NULL,
    irrigation_method TEXT NOT NULL, boundary_json TEXT NOT NULL,
    last_irrigated_at TEXT
);
CREATE TABLE IF NOT EXISTS crop_cycles (
    id TEXT PRIMARY KEY, field_id TEXT NOT NULL REFERENCES fields(id), crop TEXT NOT NULL,
    variety TEXT NOT NULL, sown_at TEXT NOT NULL, harvested_at TEXT NOT NULL,
    yield_kg REAL, notes TEXT NOT NULL, source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS crop_cycles_field_time ON crop_cycles(field_id,harvested_at DESC);
CREATE TABLE IF NOT EXISTS sensor_readings (
    id TEXT PRIMARY KEY, field_id TEXT NOT NULL REFERENCES fields(id), timestamp TEXT NOT NULL,
    soil_moisture REAL NOT NULL, soil_temperature REAL NOT NULL, air_temperature REAL NOT NULL,
    humidity REAL NOT NULL, rainfall REAL NOT NULL, light_intensity REAL NOT NULL,
    soil_ec REAL NOT NULL, soil_ph REAL NOT NULL, water_level REAL NOT NULL,
    pump_status TEXT NOT NULL, battery REAL NOT NULL, solar_generation REAL NOT NULL,
    flow_rate REAL NOT NULL, node_voltage REAL NOT NULL, energy_harvested REAL NOT NULL,
    source TEXT NOT NULL, quality TEXT NOT NULL DEFAULT 'valid'
);
CREATE INDEX IF NOT EXISTS sensor_field_time ON sensor_readings(field_id,timestamp DESC);
CREATE TABLE IF NOT EXISTS satellite_observations (
    id TEXT PRIMARY KEY, field_id TEXT NOT NULL REFERENCES fields(id), timestamp TEXT NOT NULL,
    ndvi REAL NOT NULL, ndre REAL NOT NULL, evi REAL NOT NULL, ndwi REAL NOT NULL,
    cloud_cover REAL NOT NULL, zones_json TEXT NOT NULL, source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS satellite_field_time ON satellite_observations(field_id,timestamp DESC);
CREATE TABLE IF NOT EXISTS weather_snapshots (
    id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, temperature REAL NOT NULL, humidity REAL NOT NULL,
    rainfall_mm REAL NOT NULL, wind_kmh REAL NOT NULL, rain_probability REAL NOT NULL,
    forecast_json TEXT NOT NULL, source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS market_quotes (
    id TEXT PRIMARY KEY, crop TEXT NOT NULL, market TEXT NOT NULL,
    price_per_kg REAL NOT NULL, previous_price REAL NOT NULL, as_of TEXT NOT NULL,
    source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS market_crop_time ON market_quotes(crop,as_of DESC);
CREATE TABLE IF NOT EXISTS energy_readings (
    id TEXT PRIMARY KEY, field_id TEXT NOT NULL REFERENCES fields(id), timestamp TEXT NOT NULL,
    solar_kw REAL NOT NULL, generation_kwh REAL NOT NULL, pump_energy_kwh REAL NOT NULL,
    battery_pct REAL NOT NULL, node_voltage REAL NOT NULL, node_energy_mwh REAL NOT NULL,
    comm_status TEXT NOT NULL, source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS energy_field_time ON energy_readings(field_id,timestamp DESC);
CREATE TABLE IF NOT EXISTS pump_states (
    field_id TEXT PRIMARY KEY REFERENCES fields(id), status TEXT NOT NULL DEFAULT 'OFF',
    flow_rate REAL NOT NULL DEFAULT 0, duration_min INTEGER NOT NULL DEFAULT 0,
    started_at TEXT, emergency_latched INTEGER NOT NULL DEFAULT 0,
    today_water_liters REAL NOT NULL DEFAULT 0, water_saved_pct REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS irrigation_events (
    id TEXT PRIMARY KEY, field_id TEXT NOT NULL REFERENCES fields(id), started_at TEXT NOT NULL,
    ended_at TEXT, duration_min REAL NOT NULL, water_liters REAL NOT NULL,
    energy_kwh REAL NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL,
    confirmed_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS irrigation_field_time ON irrigation_events(field_id,started_at DESC);
CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY, field_id TEXT REFERENCES fields(id), category TEXT NOT NULL,
    content TEXT NOT NULL, metadata_json TEXT NOT NULL, embedding_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
    origin TEXT NOT NULL DEFAULT 'local'
);
CREATE INDEX IF NOT EXISTS memories_field ON memories(field_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS sync_receipts (
    op_id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
    received_at TEXT NOT NULL, result TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_outbox (
    op_id TEXT PRIMARY KEY, entity TEXT NOT NULL, payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, synced_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, kind TEXT NOT NULL,
    field_id TEXT, detail_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_time ON audit_events(timestamp DESC);
"""
