"""Materialize one field-centred view; all screens consume the same data contract."""
from backend.db import Database, now_iso
from backend.config import settings
from backend.domain import repository as repo
from backend.crop_models.growth import model_growth
from backend.crop_models.health import assess_health
from backend.energy.service import get_energy
from backend.irrigation.engine import recommend
from backend.market.service import get_markets
from backend.satellite.provider import vegetation_trend
from backend.synchronization.engine import sync_status
from backend.weather.service import get_weather


def field_view(db: Database, field_id: str, weather: dict | None = None) -> dict:
    f = repo.field(db, field_id)
    if not f:
        raise ValueError("Unknown field")
    weather = weather or get_weather(db)
    sensors = repo.history(db, "sensor_readings", field_id, 24)
    satellites = repo.history(db, "satellite_observations", field_id, 12)
    if not sensors:
        raise ValueError("No sensor reading for this field")
    sensor = sensors[-1]
    growth = model_growth(f, sensor, weather)
    energy = get_energy(db, field_id, growth["stage"])
    pump = repo.pump_state(db, field_id)
    health = assess_health(f, sensors, satellites, weather, growth)
    irrigation = recommend(f, sensor, weather, growth, pump, energy)
    return {k: v for k, v in f.items() if k != "boundary_json"} | {
        "sensor": sensor, "sensor_history": sensors, "satellite": satellites[-1] if satellites else None,
        "satellite_history": satellites, "satellite_trend": vegetation_trend(satellites),
        "growth": growth, "health": health, "irrigation": irrigation,
        "energy": energy, "pump": pump, "irrigation_history": repo.history(db, "irrigation_events", field_id, 10),
        "crop_cycles": repo.history(db, "crop_cycles", field_id, 5),
    }


def build_alerts(field_views: list[dict], weather: dict) -> list[dict]:
    alerts = []
    for f in field_views:
        if f["sensor"]["quality"] != "valid":
            alerts.append({"id": f"quality-{f['id']}", "field_id": f["id"], "severity": "CRITICAL",
                           "type": "SENSOR DATA UNRELIABLE", "message": "Verify sensor data before any irrigation.",
                           "source": "validation rule"})
        if f["sensor"]["soil_moisture"] < f["irrigation"]["threshold"]:
            alerts.append({"id": f"dry-{f['id']}", "field_id": f["id"], "severity": "WARNING",
                           "type": "LOW SOIL MOISTURE", "message": f"{f['name']} is below its crop-stage threshold. Inspect the soil.",
                           "source": "sensor + crop rule"})
        if f["satellite_trend"]["consecutive_declines"] >= 3:
            alerts.append({"id": f"stress-{f['id']}", "field_id": f["id"], "severity": "WARNING",
                           "type": "VEGETATION DECLINE", "message": f"{f['name']} index declined in recent simulated observations. Cause unconfirmed.",
                           "source": "simulated satellite"})
        if f["energy"]["battery_pct"] < 20:
            alerts.append({"id": f"energy-{f['id']}", "field_id": f["id"], "severity": "CRITICAL",
                           "type": "LOW NODE ENERGY", "message": f"Check {f['name']} sensor-node storage.",
                           "source": "energy sensor"})
    if weather["rain_probability"] >= 65:
        alerts.append({"id": "rain", "field_id": None, "severity": "INFO", "type": "RAIN EXPECTED",
                       "message": "Irrigation may be delayed where soil moisture is adequate.", "source": weather["source"]})
    if any(f["irrigation"]["needed"] and f["energy"]["energy_status"] == "SUFFICIENT" for f in field_views):
        alerts.append({"id": "solar", "field_id": None, "severity": "INFO", "type": "ENERGY AVAILABLE",
                       "message": "Solar power is available for a planned irrigation cycle.", "source": "energy rule"})
    severity = {"CRITICAL": 0, "WARNING": 1, "INFO": 2}
    return sorted(alerts, key=lambda a: (severity[a["severity"]], a["id"]))


def snapshot(db: Database) -> dict:
    weather = get_weather(db)
    views = [field_view(db, f["id"], weather) for f in repo.fields(db)]
    return {"farm": repo.farm(db), "fields": views, "weather": weather,
            "markets": get_markets(db), "alerts": build_alerts(views, weather),
            "sync": sync_status(db), "generated_at": now_iso(), "demo_mode": settings.demo_mode,
            "ai_configured": bool(settings.ai_api_key and settings.ai_model),
            "data_notice": "All seeded sensors, satellite indices, weather, energy and prices are simulated demo data."}
