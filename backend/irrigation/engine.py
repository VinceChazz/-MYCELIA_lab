"""Deterministic recommendation and safety gate. The AI cannot override this gate."""
from datetime import datetime, timezone

from backend.db import parse_time

MAX_DURATION_MIN = 45
SIMULATED_FLOW_L_MIN = 16


def safety_check(sensor: dict, pump: dict, energy: dict, duration_min: int) -> dict:
    reasons = []
    age_min = (datetime.now(timezone.utc) - parse_time(sensor["timestamp"])).total_seconds() / 60
    if age_min > 90 or age_min < -10 or sensor.get("quality") != "valid":
        reasons.append("SENSOR DATA UNRELIABLE — MANUAL VERIFICATION REQUIRED")
    if sensor["soil_moisture"] < 2 or sensor["soil_moisture"] > 90:
        reasons.append("Soil moisture is outside a reliable operating range")
    if not 1 <= duration_min <= MAX_DURATION_MIN:
        reasons.append("Duration must be between 1 and 45 minutes")
    if sensor["water_level"] < 15:
        reasons.append("Water tank level is too low")
    if energy["battery_pct"] < 20 and energy["solar_kw"] < .6:
        reasons.append("Not enough battery or solar power")
    if pump["status"] != "OFF":
        reasons.append("Pump is already running or in a fault state")
    if pump["emergency_latched"]:
        reasons.append("Emergency stop is latched; manual reset required")
    if sensor["pump_status"] == "FAULT":
        reasons.append("Pump reported a hardware fault")
    # Flow is monitored AFTER starting: expecting flow while OFF would be incorrect.
    return {"allowed": not reasons, "reasons": reasons, "max_duration_min": MAX_DURATION_MIN,
            "requires_confirmation": True, "automation_enabled": False}


def recommend(field: dict, sensor: dict, weather: dict, growth: dict, pump: dict, energy: dict) -> dict:
    thresholds = {"Rice": 29, "Tomato": 29, "Chilli": 28, "Cotton": 27, "Groundnut": 27}
    threshold = thresholds.get(field["crop"], 28) + (1 if growth["stage"] == "Flowering" and field["crop"] != "Tomato" else 0)
    deficit = round(threshold - sensor["soil_moisture"], 1)
    rain_expected = weather["rain_probability"] >= 65
    needed = deficit > 0 and not (rain_expected and deficit < 6)
    duration = min(MAX_DURATION_MIN, max(8, round(14 + max(0, deficit) * .75))) if needed else 0
    safety = safety_check(sensor, pump, energy, duration or 1)
    priority = "HIGH" if deficit > 4 and not rain_expected else "MEDIUM" if needed else "LOW"
    if pump["status"] == "ON":
        recommendation = "Irrigation in progress"
    elif not safety["allowed"]:
        recommendation = "Manual verification required" if needed else "Monitor"
    elif needed:
        recommendation = "Irrigate after checking the field"
    elif rain_expected and deficit > 0:
        recommendation = "Consider delaying; rain is likely"
    else:
        recommendation = "No irrigation needed now"
    why = [
        {"label": "Soil moisture", "value": f"{sensor['soil_moisture']:.1f}%", "kind": "observed"},
        {"label": "Crop stage", "value": growth["stage"], "kind": "model estimate"},
        {"label": "Rain probability", "value": f"{weather['rain_probability']:.0f}%", "kind": "cached / simulated"},
        {"label": "Air temperature", "value": f"{sensor['air_temperature']:.1f}°C", "kind": "observed"},
        {"label": "Last irrigation", "value": field["last_irrigated_at"] or "No record", "kind": "recorded"},
        {"label": "Available solar", "value": f"{energy['solar_kw']:.1f} kW", "kind": "observed / simulated"},
    ]
    return {"recommendation": recommendation, "needed": needed, "duration_min": duration,
            "priority": priority, "threshold": threshold, "water_liters_est": duration * SIMULATED_FLOW_L_MIN,
            "energy_kwh_est": round(duration / 60 * .85, 2), "safety": safety, "why": why,
            "basis": "local deterministic crop / soil / rain rules", "requires_farmer_confirmation": True,
            "automation_enabled": False}
