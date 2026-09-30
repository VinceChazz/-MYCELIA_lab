"""One farm/field data contract shared by every domain service."""
import json
from backend.db import Database


def record(row):
    return dict(row) if row else None


def farm(db: Database) -> dict:
    with db.connection() as conn:
        return record(conn.execute("SELECT * FROM farms LIMIT 1").fetchone())


def fields(db: Database) -> list[dict]:
    with db.connection() as conn:
        rows = conn.execute("SELECT * FROM fields ORDER BY id").fetchall()
    return [{**dict(r), "boundary": json.loads(r["boundary_json"])} for r in rows]


def field(db: Database, field_id: str) -> dict | None:
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM fields WHERE id=?", (field_id,)).fetchone()
    return {**dict(row), "boundary": json.loads(row["boundary_json"])} if row else None


def history(db: Database, table: str, field_id: str, limit: int = 12) -> list[dict]:
    order_columns = {"sensor_readings": "timestamp", "satellite_observations": "timestamp",
                     "energy_readings": "timestamp", "irrigation_events": "started_at",
                     "crop_cycles": "harvested_at"}
    if table not in order_columns:
        raise ValueError("Unknown history table")
    with db.connection() as conn:
        rows = conn.execute(f"SELECT * FROM {table} WHERE field_id=? ORDER BY "
                            f"{order_columns[table]} DESC LIMIT ?",
                            (field_id, min(limit, 100))).fetchall()
    results = [dict(row) for row in reversed(rows)]
    for item in results:
        if "zones_json" in item:
            item["zones"] = json.loads(item.pop("zones_json"))
    return results


def latest(db: Database, table: str, field_id: str | None = None) -> dict | None:
    if table not in ("sensor_readings", "satellite_observations", "energy_readings", "weather_snapshots"):
        raise ValueError("Unknown data table")
    where = "WHERE field_id=?" if field_id else ""
    with db.connection() as conn:
        row = conn.execute(f"SELECT * FROM {table} {where} ORDER BY timestamp DESC LIMIT 1",
                           (field_id,) if field_id else ()).fetchone()
    item = record(row)
    if item and "forecast_json" in item:
        item["forecast"] = json.loads(item.pop("forecast_json"))
    if item and "zones_json" in item:
        item["zones"] = json.loads(item.pop("zones_json"))
    return item


def markets(db: Database) -> list[dict]:
    with db.connection() as conn:
        rows = conn.execute("SELECT * FROM market_quotes ORDER BY crop, as_of DESC").fetchall()
    seen = set()
    result = []
    for row in rows:
        if row["crop"] not in seen:
            seen.add(row["crop"])
            result.append(dict(row))
    return result


def pump_state(db: Database, field_id: str) -> dict:
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM pump_states WHERE field_id=?", (field_id,)).fetchone()
    return record(row) or {"field_id": field_id, "status": "OFF", "flow_rate": 0,
                           "duration_min": 0, "started_at": None, "emergency_latched": 0,
                           "today_water_liters": 0, "water_saved_pct": 0}
