"""Server-side demo telemetry keeps seed data fresh even before a browser is opened."""
from datetime import datetime, timezone
from uuid import uuid4

from backend.db import Database, parse_time
from backend.domain.repository import latest
from backend.irrigation.controller import SimulatedPumpController
from backend.sensors.service import DemoSensorProvider, ingest


def simulate_demo_tick(db: Database) -> None:
    controller = SimulatedPumpController(db)
    provider = DemoSensorProvider(db)
    for i in range(1, 6):
        field_id = f"FIELD_{i:02d}"
        last = latest(db, "sensor_readings", field_id)
        if not last:
            continue
        if (datetime.now(timezone.utc) - parse_time(last["timestamp"])).total_seconds() < 18:
            continue
        # Enforce the controller's duration and no-flow safeguards even if no UI is open.
        try:
            controller.get_status(field_id)
            reading = ingest(db, provider.read(field_id))
            prior = latest(db, "energy_readings", field_id)
            if prior:
                same_day = parse_time(prior["timestamp"]).date() == parse_time(reading["timestamp"]).date()
                solar_kwh = (prior["generation_kwh"] if same_day else 0) + reading["solar_generation"] * 20/3600
                pump_kwh = (prior["pump_energy_kwh"] if same_day else 0) + (.85*20/3600 if reading["pump_status"] == "ON" else 0)
                with db.connection() as conn:
                    conn.execute("INSERT INTO energy_readings VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                                 (str(uuid4()), field_id, reading["timestamp"], reading["solar_generation"],
                                  round(solar_kwh, 2), round(pump_kwh, 2), reading["battery"],
                                  reading["node_voltage"], round(prior["node_energy_mwh"]+.001, 3),
                                  "CONNECTED", "simulated"))
        except ValueError as exc:
            db.audit("demo_sensor_error", field_id, {"error": str(exc)[:180]})
