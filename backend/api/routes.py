"""Small, typed HTTP surface. Browser never receives server environment secrets."""
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from backend.config import settings
from backend.db import Database
from backend.domain import repository as repo
from backend.domain.snapshot import field_view, snapshot
from backend.ai.ai_service import AIService, LANGUAGES
from backend.irrigation.controller import SimulatedPumpController
from backend.market.service import get_markets
from backend.memory.memory_manager import MemoryManager
from backend.sensors.service import DemoSensorProvider, SensorReadingIn, ingest
from backend.synchronization.engine import SyncBatch, apply_batch, sync_status, sync_upstream
from backend.weather.service import get_weather

router = APIRouter(prefix="/api")


def get_db(request: Request) -> Database:
    return request.app.state.db


def bad_request(exc: Exception) -> HTTPException:
    return HTTPException(status_code=403 if isinstance(exc, PermissionError) else 400, detail=str(exc))


@router.get("/health")
def health(db: Database = Depends(get_db)):
    return {"status": "ok", "storage": "local SQLite", "demo_mode": settings.demo_mode,
            "ai_configured": bool(settings.ai_api_key and settings.ai_model), "sync": sync_status(db)}


@router.get("/bootstrap")
def bootstrap(db: Database = Depends(get_db)):
    return snapshot(db)


@router.get("/fields/{field_id}")
def get_field(field_id: str, db: Database = Depends(get_db)):
    try:
        return field_view(db, field_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/sensors/ingest")
def ingest_sensor(reading: SensorReadingIn, x_node_key: str = Header(default=""), db: Database = Depends(get_db)):
    if not settings.demo_mode or reading.source != "simulated":
        if not settings.sensor_ingest_key or x_node_key != settings.sensor_ingest_key:
            raise HTTPException(status_code=403, detail="Authorized sensor gateway required")
    try:
        return ingest(db, reading)
    except ValueError as exc:
        raise bad_request(exc) from exc


@router.post("/sensors/simulate/{field_id}")
def simulate_sensor(field_id: str, db: Database = Depends(get_db)):
    if not settings.demo_mode:
        raise HTTPException(status_code=403, detail="Sensor simulator is disabled")
    try:
        return ingest(db, DemoSensorProvider(db).read(field_id))
    except ValueError as exc:
        raise bad_request(exc) from exc


@router.get("/irrigation/recommendation/{field_id}")
def get_recommendation(field_id: str, db: Database = Depends(get_db)):
    try:
        view = field_view(db, field_id)
        return {"field_id": field_id, "health": view["health"], "irrigation": view["irrigation"]}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/irrigation/status/{field_id}")
def get_pump(field_id: str, db: Database = Depends(get_db)):
    try:
        return SimulatedPumpController(db).get_status(field_id)
    except ValueError as exc:
        raise bad_request(exc) from exc


class PumpCommand(BaseModel):
    field_id: str
    confirmation: str = ""
    confirmed: bool = False
    duration_min: int = Field(default=18, ge=1, le=45)
    simulated_elapsed_min: float | None = Field(default=None, ge=0, le=45)


@router.post("/irrigation/start")
def start_pump(command: PumpCommand, x_operator_key: str = Header(default=""), db: Database = Depends(get_db)):
    if not command.confirmed:
        raise HTTPException(status_code=403, detail="Explicit farmer confirmation is required")
    try:
        return SimulatedPumpController(db).start_irrigation(command.field_id, command.duration_min,
                                                             command.confirmation, x_operator_key)
    except (ValueError, PermissionError) as exc:
        raise bad_request(exc) from exc


@router.post("/irrigation/stop")
def stop_pump(command: PumpCommand, db: Database = Depends(get_db)):
    farm_field = repo.field(db, command.field_id)
    if not farm_field or not command.confirmed or command.confirmation != farm_field["name"]:
        raise HTTPException(status_code=403, detail="Field confirmation required to stop")
    controller = SimulatedPumpController(db)
    return controller.stop_irrigation(command.field_id, command.simulated_elapsed_min)


@router.post("/irrigation/emergency-stop/{field_id}")
def emergency_stop(field_id: str, db: Database = Depends(get_db)):
    if not repo.field(db, field_id):
        raise HTTPException(status_code=404, detail="Unknown field")
    return SimulatedPumpController(db).emergency_stop(field_id)


@router.post("/irrigation/reset")
def reset_pump(command: PumpCommand, db: Database = Depends(get_db)):
    if not command.confirmed:
        raise HTTPException(status_code=403, detail="Explicit confirmation required")
    try:
        return SimulatedPumpController(db).reset_emergency(command.field_id, command.confirmation)
    except ValueError as exc:
        raise bad_request(exc) from exc


@router.get("/weather")
def weather(refresh: bool = False, db: Database = Depends(get_db)):
    return get_weather(db, refresh)


@router.get("/markets")
def markets(refresh: bool = False, db: Database = Depends(get_db)):
    return get_markets(db, refresh)


class Question(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    field_id: str
    language: str = "en"
    message_id: str | None = None
    allow_remote: bool = True


@router.post("/assistant/ask")
def ask(question: Question, db: Database = Depends(get_db)):
    if question.language not in LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported language")
    try:
        selected = repo.field(db, question.field_id)
        if not selected:
            raise ValueError("Unknown field")
        named = next((f for f in repo.fields(db) if f["name"].casefold() in question.question.casefold() or
                      f["crop"].casefold() in question.question.casefold()), None)
        target_id = named["id"] if named else question.field_id
        return AIService(db).answer(question.question, field_view(db, target_id), get_weather(db),
                                    get_markets(db), question.language, question.allow_remote, question.message_id)
    except ValueError as exc:
        raise bad_request(exc) from exc


class MemoryIn(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    category: str = "note"
    field_id: str | None = None
    metadata: dict = Field(default_factory=dict)


@router.post("/memory")
def create_memory(item: MemoryIn, db: Database = Depends(get_db)):
    try:
        return MemoryManager(db).store_memory(item.content, item.category, item.field_id, item.metadata)
    except ValueError as exc:
        raise bad_request(exc) from exc


@router.get("/memory/search")
def search_memory(q: str, field_id: str | None = None, db: Database = Depends(get_db)):
    return MemoryManager(db).search_memory(q, field_id)


@router.get("/memory/{memory_id}")
def get_memory(memory_id: str, db: Database = Depends(get_db)):
    item = MemoryManager(db).retrieve_memory(memory_id)
    if not item or item["deleted"]:
        raise HTTPException(status_code=404, detail="Memory not found")
    return item


@router.put("/memory/{memory_id}")
def update_memory(memory_id: str, item: MemoryIn, db: Database = Depends(get_db)):
    try:
        return MemoryManager(db).update_memory(memory_id, item.content, item.metadata)
    except ValueError as exc:
        raise bad_request(exc) from exc


@router.delete("/memory/{memory_id}")
def delete_memory(memory_id: str, db: Database = Depends(get_db)):
    try:
        return MemoryManager(db).delete_memory(memory_id)
    except ValueError as exc:
        raise bad_request(exc) from exc


@router.post("/sync/batch")
def sync_batch(batch: SyncBatch, x_node_key: str = Header(default=""), db: Database = Depends(get_db)):
    return apply_batch(db, batch.operations, x_node_key)


@router.get("/sync/status")
def get_sync_status(db: Database = Depends(get_db)):
    return sync_status(db)


@router.post("/sync/upstream")
def upload_upstream(db: Database = Depends(get_db)):
    return sync_upstream(db)


class DemoReset(BaseModel):
    confirmation: str


@router.post("/demo/reset")
def reset_demo(command: DemoReset, db: Database = Depends(get_db)):
    if not settings.demo_mode or command.confirmation != "RESET DEMO":
        raise HTTPException(status_code=403, detail="Demo reset requires explicit confirmation")
    from backend.demo import seed_demo
    with db.connection() as conn:
        for table in ("sync_receipts", "sync_outbox", "audit_events", "memories", "irrigation_events",
                      "pump_states", "energy_readings", "market_quotes", "weather_snapshots",
                      "satellite_observations", "sensor_readings", "crop_cycles", "fields", "farms"):
            conn.execute(f"DELETE FROM {table}")
    seed_demo(db)
    return {"status": "reset", "fields": 5, "notice": "Demo records were reset; no physical equipment was affected"}


@router.get("/events")
def events(limit: int = 25, db: Database = Depends(get_db)):
    with db.connection() as conn:
        rows = conn.execute("SELECT * FROM audit_events ORDER BY id DESC LIMIT ?", (max(1, min(limit, 100)),)).fetchall()
    import json
    return [{**dict(r), "detail": json.loads(r["detail_json"])} for r in rows]
