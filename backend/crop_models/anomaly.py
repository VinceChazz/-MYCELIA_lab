"""Explainable, field-local associations. These are NOT plant-health measurements.

Correlations use only paired sensor timestamps, never compare unaligned satellite pixels
with electrical readings. A model can replace this boundary when real labelled cycles exist.
"""
import math
from backend.satellite.provider import vegetation_trend


def _correlation(a: list[float], b: list[float]) -> float | None:
    if len(a) < 8 or len(a) != len(b):
        return None
    avg_a, avg_b = sum(a)/len(a), sum(b)/len(b)
    numerator = sum((x-avg_a)*(y-avg_b) for x,y in zip(a,b))
    product = sum((x-avg_a)**2 for x in a) * sum((y-avg_b)**2 for y in b)
    return round(numerator/math.sqrt(product), 2) if product > 1e-8 else None


def learn_node_associations(sensors: list[dict], satellites: list[dict], stage: str) -> dict:
    recent = [s for s in sensors[-24:] if s.get("quality") == "valid"]
    trend = vegetation_trend(satellites)
    if not recent:
        return {"sample_count": 0, "anomaly": False, "correlations": {},
                "context": [], "note": "Insufficient valid paired sensor history."}
    voltage = [s["node_voltage"] for s in recent]
    correlations = {key: _correlation(voltage, [s[key] for s in recent])
                    for key in ("soil_moisture", "air_temperature", "humidity")}
    first, last = recent[0], recent[-1]
    falling_voltage = first["node_voltage"] - last["node_voltage"] > .018
    falling_moisture = first["soil_moisture"] - last["soil_moisture"] >= 2
    warming = last["air_temperature"] - first["air_temperature"] >= .6
    drying_air = first["humidity"] - last["humidity"] >= 1.5
    decline = trend["consecutive_declines"] >= 2
    anomaly = bool(len(recent) >= 8 and falling_voltage and falling_moisture and
                   (warming or drying_air) and decline)
    context = [f"{stage} stage", f"{trend['consecutive_declines']} NDVI declines"]
    if falling_moisture:
        context.append("soil moisture falling")
    if warming:
        context.append("air temperature rising")
    if drying_air:
        context.append("humidity falling")
    return {"sample_count": len(recent), "anomaly": anomaly, "correlations": correlations,
            "context": context, "voltage_change_v": round(last["node_voltage"]-first["node_voltage"], 3),
            "note": "Local exploratory associations from paired sensor history; no causal or plant-health claim. "
                    "Satellite trend and crop stage provide separate context, not an electrical diagnosis."}
