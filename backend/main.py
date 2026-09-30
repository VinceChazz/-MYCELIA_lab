"""Run with: python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000"""
from contextlib import asynccontextmanager
import asyncio
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.api.routes import router
from backend.config import settings
from backend.db import Database
from backend.demo import seed_demo
from backend.demo_stream import simulate_demo_tick


def create_app(db_path: str | None = None) -> FastAPI:
    db = Database(db_path)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db.initialize()
        stream_task = None
        if settings.demo_mode:
            seed_demo(db)
            simulate_demo_tick(db)  # refresh old demo data after a server restart

            async def stream():
                while True:
                    await asyncio.sleep(20)
                    try:
                        await asyncio.to_thread(simulate_demo_tick, db)
                    except Exception as exc:  # an interrupted demo stream must not kill the API
                        db.audit("demo_stream_error", None, {"error": type(exc).__name__})

            stream_task = asyncio.create_task(stream())
        try:
            yield
        finally:
            if stream_task:
                stream_task.cancel()
                try:
                    await stream_task
                except asyncio.CancelledError:
                    pass

    app = FastAPI(title="Root to Power", version="0.1.0", description="Offline-first farm intelligence; demo pump is simulated.",
                  lifespan=lifespan)
    app.state.db = db
    app.include_router(router)
    # A built frontend can be served by the same process in deployments without Vite.
    built = Path(__file__).resolve().parents[1] / "frontend" / "dist"
    if built.exists():
        app.mount("/assets", StaticFiles(directory=built / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            requested = (built / path).resolve()
            if requested.is_relative_to(built.resolve()) and requested.is_file():
                return FileResponse(requested)
            return FileResponse(built / "index.html")
    return app


app = create_app()
