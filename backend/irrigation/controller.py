"""Pump contract and demo-only controller. No hardware actuator is enabled by this module."""
from datetime import datetime, timezone
from typing import Protocol
from uuid import uuid4

from backend.config import settings
from backend.db import Database, now_iso, parse_time
from backend.domain.repository import field, history, latest, pump_state
from backend.irrigation.engine import MAX_DURATION_MIN, SIMULATED_FLOW_L_MIN, safety_check


class IrrigationController(Protocol):
    def get_status(self, field_id: str) -> dict: ...
    def set_duration(self, field_id: str, minutes: int) -> dict: ...
    def start_irrigation(self, field_id: str, minutes: int, confirmation: str, operator_key: str = "") -> dict: ...
    def stop_irrigation(self, field_id: str, simulated_elapsed_min: float | None = None) -> dict: ...
    def emergency_stop(self, field_id: str) -> dict: ...


class SimulatedPumpController:
    def __init__(self, db: Database):
        self.db = db

    def get_status(self, field_id: str) -> dict:
        state = pump_state(self.db, field_id)
        if state["status"] == "ON":
            elapsed = (datetime.now(timezone.utc) - parse_time(state["started_at"])).total_seconds() / 60
            if elapsed >= state["duration_min"]:
                return self.stop_irrigation(field_id)
            if state["flow_rate"] <= 0:
                self.emergency_stop(field_id)
                raise ValueError("No flow detected; emergency stop activated")
        return state

    def set_duration(self, field_id: str, minutes: int) -> dict:
        if not isinstance(minutes, int) or not 1 <= minutes <= MAX_DURATION_MIN:
            raise ValueError("Duration must be between 1 and 45 minutes")
        if not field(self.db, field_id):
            raise ValueError("Unknown field")
        with self.db.connection() as conn:
            conn.execute("UPDATE pump_states SET duration_min=? WHERE field_id=?", (minutes, field_id))
        return self.get_status(field_id)

    def start_irrigation(self, field_id: str, minutes: int, confirmation: str, operator_key: str = "") -> dict:
        farm_field = field(self.db, field_id)
        if not farm_field:
            raise ValueError("Unknown field")
        if confirmation.strip() != farm_field["name"]:
            raise ValueError("Type the exact field name to confirm this action")
        if not settings.demo_mode:
            # No physical adapter is installed; fail closed regardless of key.
            if not settings.pump_operator_key or operator_key != settings.pump_operator_key:
                raise PermissionError("Operator authorization required")
            raise PermissionError("Physical pump control is disabled until an audited adapter is installed")
        sensor = latest(self.db, "sensor_readings", field_id)
        energy = latest(self.db, "energy_readings", field_id)
        state = self.get_status(field_id)
        if not sensor or not energy:
            raise ValueError("Missing sensor or energy data — manual verification required")
        safety = safety_check(sensor, state, energy, minutes)
        if not safety["allowed"]:
            self.db.audit("irrigation_denied", field_id, {"reasons": safety["reasons"]})
            raise ValueError("; ".join(safety["reasons"]))
        # Unexpected watering or a longer-than-advised cycle fails closed; no AI override.
        from backend.domain.snapshot import field_view
        plan = field_view(self.db, field_id)["irrigation"]
        if not plan["needed"] or minutes > plan["duration_min"]:
            self.db.audit("irrigation_denied", field_id, {"reason": "outside deterministic plan", "minutes": minutes})
            raise ValueError("Cycle is outside the local crop/water plan; inspect the field before any manual override")
        stamp = now_iso()
        event_id = str(uuid4())
        with self.db.connection() as conn:
            changed = conn.execute("UPDATE pump_states SET status='ON',flow_rate=?,duration_min=?,started_at=? "
                                   "WHERE field_id=? AND status='OFF' AND emergency_latched=0",
                                   (SIMULATED_FLOW_L_MIN, minutes, stamp, field_id))
            if changed.rowcount != 1:
                raise ValueError("Pump state changed; start was safely cancelled")
            conn.execute("INSERT INTO irrigation_events VALUES (?,?,?,?,?,?,?,?,?,?)",
                         (event_id, field_id, stamp, None, minutes, 0, 0, "simulated", "running", confirmation))
            conn.execute("INSERT INTO audit_events (timestamp,kind,field_id,detail_json) VALUES (?,?,?,?)",
                         (stamp, "irrigation_started", field_id,
                          __import__('json').dumps({"event_id": event_id, "duration_min": minutes,
                                                   "farmer_confirmed": True, "physical_hardware": False})))
        return {**self.get_status(field_id), "event_id": event_id}

    def stop_irrigation(self, field_id: str, simulated_elapsed_min: float | None = None) -> dict:
        state = self.get_status_no_auto(field_id)
        if state["status"] != "ON":
            return state
        elapsed = max(0, (datetime.now(timezone.utc) - parse_time(state["started_at"])).total_seconds() / 60)
        if settings.demo_mode and simulated_elapsed_min is not None:
            elapsed = max(elapsed, simulated_elapsed_min)
        minutes = round(min(elapsed, state["duration_min"]), 2)
        water = round(minutes * state["flow_rate"], 1)
        with self.db.connection() as conn:
            conn.execute("UPDATE pump_states SET status='OFF',flow_rate=0,started_at=NULL, "
                         "today_water_liters=today_water_liters+? WHERE field_id=?", (water, field_id))
            conn.execute("UPDATE irrigation_events SET ended_at=?,duration_min=?,water_liters=?,energy_kwh=?, "
                         "status='completed' WHERE id=(SELECT id FROM irrigation_events WHERE field_id=? AND "
                         "status='running' ORDER BY started_at DESC LIMIT 1)",
                         (now_iso(), minutes, water, round(minutes/60*.85, 3), field_id))
            conn.execute("UPDATE fields SET last_irrigated_at=? WHERE id=?", (now_iso(), field_id))
        self.db.audit("irrigation_stopped", field_id, {"water_liters": water, "duration_min": minutes})
        return self.get_status_no_auto(field_id)

    def get_status_no_auto(self, field_id: str) -> dict:
        if not field(self.db, field_id):
            raise ValueError("Unknown field")
        return pump_state(self.db, field_id)

    def emergency_stop(self, field_id: str) -> dict:
        self.stop_irrigation(field_id)
        with self.db.connection() as conn:
            conn.execute("UPDATE pump_states SET status='FAULT',flow_rate=0,emergency_latched=1 WHERE field_id=?",
                         (field_id,))
        self.db.audit("emergency_stop", field_id, {"reason": "operator or no-flow safeguard"})
        return self.get_status_no_auto(field_id)

    def reset_emergency(self, field_id: str, confirmation: str) -> dict:
        farm_field = field(self.db, field_id)
        if not farm_field or confirmation != farm_field["name"]:
            raise ValueError("Field confirmation required to reset")
        with self.db.connection() as conn:
            conn.execute("UPDATE pump_states SET status='OFF',emergency_latched=0 WHERE field_id=?", (field_id,))
        self.db.audit("emergency_reset", field_id, {"confirmed": True})
        return self.get_status_no_auto(field_id)
