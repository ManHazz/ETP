import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.database import engine, Base, SessionLocal
from app.migrate import run_migrations
from app.auth import bootstrap_admin
from app.mqtt_client import build_client, start, stop
from app.routes import router
from app import anomaly as anomaly_engine


log = logging.getLogger("smartbin")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

PHOTO_DIR = Path(os.getenv("PHOTO_STORAGE_DIR", "/app/photos"))
ANOMALY_SCAN_INTERVAL = int(os.getenv("ANOMALY_SCAN_SECONDS", "300"))  # 5 min default


async def _anomaly_loop(stop_event: asyncio.Event) -> None:
    """Background loop that scans anomalies every N seconds."""
    while not stop_event.is_set():
        try:
            with SessionLocal() as db:
                count = anomaly_engine.check_all_bins(db)
                if count:
                    log.info("Anomaly scan wrote %d new records", count)
        except Exception as exc:
            log.warning("Anomaly scan errored: %s", exc)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=ANOMALY_SCAN_INTERVAL)
        except asyncio.TimeoutError:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    try:
        run_migrations()
    except Exception as exc:
        log.warning("Migrations skipped/failed: %s", exc)
    bootstrap_admin()
    log.info("✓ DB ready, admin bootstrapped")

    mqtt_client = build_client()
    start(mqtt_client)

    stop_event = asyncio.Event()
    scan_task = asyncio.create_task(_anomaly_loop(stop_event))

    try:
        yield
    finally:
        stop_event.set()
        try:
            await asyncio.wait_for(scan_task, timeout=3)
        except asyncio.TimeoutError:
            scan_task.cancel()
        stop(mqtt_client)
        log.info("✓ Clean shutdown")


app = FastAPI(
    title="SmartBin API",
    description="AI-powered predictive waste management — self-hosted, open-source stack",
    version="0.3.0",
    lifespan=lifespan,
)

app.include_router(router, prefix="/api")

PHOTO_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/photos", StaticFiles(directory=str(PHOTO_DIR)), name="photos")


@app.get("/health")
def health_check():
    return {"status": "ok"}
