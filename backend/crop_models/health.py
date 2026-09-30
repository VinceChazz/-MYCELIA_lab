"""Locally computed evidence-first health estimate. Voltage alone never diagnoses a crop."""
from datetime import datetime, timezone

from backend.db import parse_time
from backend.satellite.provider import vegetation_trend
from backend.crop_models.anomaly import learn_node_associations


def assess_health(field: dict, sensors: list[dict], satellites: list[dict], weather: dict, growth: dict) -> dict:
    sensor = sensors[-1]
    sat = satellites[-1] if satellites else None
    trend = vegetation_trend(satellites)
    moisture = sensor["soil_moisture"]
    ndvi = sat["ndvi"] if sat else None
    score = 94
    score -= max(0, 30 - moisture) * 2.0
    if ndvi is not None:
        score -= max(0, .70 - ndvi) * 55
    score -= min(12, trend["consecutive_declines"] * 2.5)
    score -= max(0, weather["temperature"] - 33) * 1.2
    score = max(0, min(100, round(score)))
    severity = "Healthy" if score >= 78 else "Moderate stress" if score >= 52 else "Severe stress"
    node_context = learn_node_associations(sensors, satellites, growth["stage"])
    combined_node_anomaly = node_context["anomaly"]
    possible = []
    if moisture < 28 and trend["consecutive_declines"] >= 2:
        possible.append("Water stress is possible: drying soil and declining vegetation index occur together")
    elif moisture < 28:
        possible.append("Low soil moisture may be limiting growth")
    if weather["temperature"] > 34:
        possible.append("Heat may be adding to crop stress")
    if combined_node_anomaly:
        possible.append("A bioelectric signal change coincides with other changes; inspect the node and field")
    if not possible:
        possible.append("No clear stress pattern in the available observations")
    sensor_age = (datetime.now(timezone.utc) - parse_time(sensor["timestamp"])).total_seconds() / 3600
    sat_age = (datetime.now(timezone.utc) - parse_time(sat["timestamp"])).total_seconds() / 86400 if sat else 99
    confidence = max(.25, min(.86, .82 - (.20 if sensor_age > 2 else 0) -
                              (.17 if sat_age > 12 else 0) - (.12 if sensor["quality"] != "valid" else 0) -
                              (.07 if sat and "simulated" in sat["source"] else 0)))
    signal = ("Declining NDVI + low soil moisture" if trend["consecutive_declines"] >= 2 and moisture < 28
              else "Low soil moisture" if moisture < 28 else "Vegetation index is steady")
    action = (f"Inspect {field['name']} for possible irrigation stress before watering." if score < 78
              else "Continue routine monitoring; no urgent action indicated.")
    return {
        "score": score, "status": severity, "stress_level": severity,
        "growth_trend": trend["direction"], "primary_signal": signal,
        "confidence": round(confidence, 2), "possible_causes": possible,
        "recommended_action": action, "node_anomaly": combined_node_anomaly,
        "observed": [
            {"label": "Soil moisture", "value": f"{moisture:.1f}%", "source": sensor["source"], "timestamp": sensor["timestamp"]},
            {"label": "NDVI", "value": f"{ndvi:.2f}" if ndvi is not None else "Unavailable",
             "source": sat["source"] if sat else "none", "timestamp": sat["timestamp"] if sat else None},
            {"label": "Air temperature", "value": f"{sensor['air_temperature']:.1f}°C",
             "source": sensor["source"], "timestamp": sensor["timestamp"]},
        ],
        "inference": f"{trend['consecutive_declines']} consecutive NDVI declines; {growth['stage'].lower()} stage. "
                     + "; ".join(possible),
        "advice": action, "model": "local multi-signal rule model",
        "node_context": node_context,
    }
