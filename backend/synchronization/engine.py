"""Idempotent device-to-local-server sync and optional bounded upstream replay.

Irrigation sync is HISTORY ONLY: queued operations can never turn a physical pump on.
"""
import json
from uuid import uuid4
from pydantic import BaseModel, Field

from backend.config import settings
from backend.db import Database, now_iso
from backend.domain.repository import field
from backend.memory.memory_manager import MemoryManager
from backend.network import request_json
from backend.sensors.service import SensorReadingIn, ingest


class SyncOperation(BaseModel):
    op_id: str = Field(min_length=1, max_length=120)
    entity: str = Field(min_length=1, max_length=40)
    entity_id: str = Field(min_length=1, max_length=120)
    operation: str = "upsert"
    payload: dict
    created_at: str


class SyncBatch(BaseModel):
    operations: list[SyncOperation] = Field(max_length=100)


def apply_batch(db: Database, operations: list[SyncOperation], sensor_key: str = "") -> dict:
    accepted, rejected = [], []
    memory = MemoryManager(db)
    for op in operations:
        with db.connection() as conn:
            receipt = conn.execute("SELECT result FROM sync_receipts WHERE op_id=?", (op.op_id,)).fetchone()
        if receipt:
            accepted.append(op.op_id)
            continue
        try:
            if op.entity == "sensor":
                validated = SensorReadingIn.model_validate({**op.payload, "id": op.entity_id})
                if not settings.demo_mode or validated.source != "simulated":
                    if not settings.sensor_ingest_key or sensor_key != settings.sensor_ingest_key:
                        raise ValueError("Authorized sensor gateway required")
                ingest(db, validated)
            elif op.entity in ("conversation", "memory", "preference"):
                if op.entity == "memory":
                    data = {**op.payload, "id": op.entity_id}
                    merged = memory.sync_memory([data])
                    if merged["conflicts"]:
                        raise ValueError(merged["conflicts"][0]["reason"])
                else:
                    text = ("Q: " + str(op.payload.get("question", "")) + "\nA: " +
                            str(op.payload.get("answer", ""))) if op.entity == "conversation" else str(op.payload.get("content", ""))
                    memory.store_memory(text, "farmer_question" if op.entity == "conversation" else "preference",
                                        op.payload.get("field_id"),
                                        {"language": op.payload.get("language", "en"), "created_at": op.created_at},
                                        memory_id=op.entity_id)
            elif op.entity == "irrigation_event":
                # Offline simulation events are a journal, NEVER a delayed pump command.
                p = op.payload
                if not field(db, p.get("field_id", "")) or p.get("source") != "simulated":
                    raise ValueError("Only simulated historical events may be synchronized")
                duration = float(p.get("duration_min", 0))
                water = float(p.get("water_liters", 0))
                if not 0 <= duration <= 45 or not 0 <= water <= 1000:
                    raise ValueError("Irrigation event out of range")
                with db.connection() as conn:
                    conn.execute("INSERT OR IGNORE INTO irrigation_events VALUES (?,?,?,?,?,?,?,?,?,?)",
                                 (op.entity_id, p["field_id"], p.get("started_at", op.created_at),
                                  p.get("ended_at"), duration, water, float(p.get("energy_kwh", 0)),
                                  "simulated", p.get("status", "completed"), "offline farmer confirmation"))
                db.audit("offline_irrigation_recorded", p["field_id"], {"event_id": op.entity_id})
            else:
                raise ValueError("Unsupported sync entity")
            with db.connection() as conn:
                conn.execute("INSERT OR IGNORE INTO sync_receipts VALUES (?,?,?,?,?)",
                             (op.op_id, op.entity, op.entity_id, now_iso(), "accepted"))
                if settings.sync_target_url:
                    conn.execute("INSERT OR IGNORE INTO sync_outbox (op_id,entity,payload_json,created_at) VALUES (?,?,?,?)",
                                 (op.op_id, op.entity, json.dumps(op.model_dump(), ensure_ascii=False), now_iso()))
            accepted.append(op.op_id)
            db.audit("sync_accepted", op.payload.get("field_id"), {"op_id": op.op_id, "entity": op.entity})
        except (ValueError, TypeError, KeyError) as exc:
            rejected.append({"op_id": op.op_id, "error": str(exc)[:220]})
            db.audit("sync_rejected", op.payload.get("field_id"), {"op_id": op.op_id, "error": str(exc)[:220]})
    return {"accepted": accepted, "rejected": rejected, "server_confirmed_at": now_iso(),
            "upstream_configured": bool(settings.sync_target_url)}


def sync_status(db: Database) -> dict:
    with db.connection() as conn:
        cloud_pending = conn.execute("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL").fetchone()[0]
        received = conn.execute("SELECT COUNT(*) FROM sync_receipts").fetchone()[0]
    return {"device_records_received": received, "upstream_pending": cloud_pending if settings.sync_target_url else 0,
            "upstream_configured": bool(settings.sync_target_url), "local_database": "SQLite"}


def sync_upstream(db: Database) -> dict:
    if not settings.sync_target_url:
        return {"status": "local_only", "message": "No cloud target configured; records are safe in local SQLite"}
    with db.connection() as conn:
        rows = conn.execute("SELECT * FROM sync_outbox WHERE synced_at IS NULL ORDER BY created_at LIMIT 100").fetchall()
    if not rows:
        return {"status": "complete", "uploaded": 0}
    payload = [{"op_id": r["op_id"], "entity": r["entity"], "payload": json.loads(r["payload_json"])} for r in rows]
    try:
        response = request_json("POST", settings.sync_target_url,
                                headers={"Authorization": f"Bearer {settings.sync_api_key}"} if settings.sync_api_key else {},
                                payload={"operations": payload})
        accepted = set(response.get("accepted", []))
        with db.connection() as conn:
            for op_id in accepted:
                conn.execute("UPDATE sync_outbox SET synced_at=? WHERE op_id=?", (now_iso(), op_id))
            for row in rows:
                if row["op_id"] not in accepted:
                    conn.execute("UPDATE sync_outbox SET attempts=attempts+1 WHERE op_id=?", (row["op_id"],))
        db.audit("upstream_sync", None, {"uploaded": len(accepted), "pending": len(rows)-len(accepted)})
        return {"status": "complete" if len(accepted) == len(rows) else "conflicts", "uploaded": len(accepted),
                "pending": len(rows)-len(accepted)}
    except (ConnectionError, ValueError) as exc:
        db.audit("upstream_sync_failed", None, {"error": str(exc)})
        return {"status": "failed", "message": "Upstream unavailable; local records retained"}
