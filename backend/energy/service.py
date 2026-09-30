"""Solar and bioelectrochemical sensing/energy node interpretation."""
from backend.db import Database
from backend.domain.repository import history
from backend.crop_models.anomaly import learn_node_associations


def get_energy(db: Database, field_id: str, stage: str = "Unknown") -> dict:
    readings = history(db, "energy_readings", field_id, 8)
    if not readings:
        raise ValueError("Energy readings unavailable")
    latest_reading = readings[-1]
    voltage_change = round(latest_reading["node_voltage"] - readings[0]["node_voltage"], 3)
    battery = latest_reading["battery_pct"]
    return {**latest_reading, "voltage_trend": voltage_change,
            "node_health": "Needs attention" if battery < 20 or latest_reading["comm_status"] != "CONNECTED"
                           else "Monitoring normally",
            "energy_status": "SUFFICIENT" if latest_reading["solar_kw"] >= .6 or battery >= 30 else "LOW",
            "history": readings,
            "node_associations": learn_node_associations(
                history(db, "sensor_readings", field_id, 24), history(db, "satellite_observations", field_id, 12), stage),
            "interpretation_note": "Node voltage is an environmental signal, not a direct measure of plant health."}
