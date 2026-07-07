from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bin, SensorReading, CollectionLog
from app.fusion import compute_effective_fill
from app.schemas import (
    BinCreate, BinResponse, BinStatus,
    SensorPayload, ReadingResponse,
    CollectionCreate, CollectionResponse,
)

router = APIRouter()


# ══════════════════════════════════════════════════════
#  BINS — register and manage physical bins
# ══════════════════════════════════════════════════════

@router.post("/bins", response_model=BinResponse, status_code=201)
def create_bin(payload: BinCreate, db: Session = Depends(get_db)):
    """Register a new bin on the system."""
    bin = Bin(**payload.model_dump())
    db.add(bin)
    db.commit()
    db.refresh(bin)
    return bin


@router.get("/bins", response_model=list[BinResponse])
def list_bins(db: Session = Depends(get_db)):
    """List all registered bins."""
    return db.scalars(select(Bin).order_by(Bin.id)).all()


@router.get("/bins/{bin_id}", response_model=BinResponse)
def get_bin(bin_id: int, db: Session = Depends(get_db)):
    bin = db.get(Bin, bin_id)
    if not bin:
        raise HTTPException(404, "Bin not found")
    return bin


@router.delete("/bins/{bin_id}", status_code=204)
def delete_bin(bin_id: int, db: Session = Depends(get_db)):
    bin = db.get(Bin, bin_id)
    if not bin:
        raise HTTPException(404, "Bin not found")
    db.delete(bin)
    db.commit()


# ══════════════════════════════════════════════════════
#  SENSOR READINGS — ingest telemetry from nodes
# ══════════════════════════════════════════════════════

@router.post("/readings", response_model=ReadingResponse, status_code=201)
def ingest_reading(payload: SensorPayload, db: Session = Depends(get_db)):
    """
    Receive a sensor payload from an ESP32 node (or the simulator).
    This is the main data ingestion endpoint.
    """
    # Verify bin exists
    bin = db.get(Bin, payload.bin_id)
    if not bin:
        raise HTTPException(404, f"Bin {payload.bin_id} not found")

    reading = SensorReading(
        bin_id=payload.bin_id,
        fill_level_pct=payload.fill_level_pct,
        weight_kg=payload.weight_kg,
        gas_ppm=payload.gas_ppm,
        battery_voltage=payload.battery_voltage,
        timestamp=payload.timestamp or datetime.now(timezone.utc),
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return reading


@router.get("/readings/{bin_id}", response_model=list[ReadingResponse])
def get_readings(
    bin_id: int,
    limit: int = Query(default=50, le=500),
    db: Session = Depends(get_db),
):
    """Get recent readings for a specific bin, newest first."""
    stmt = (
        select(SensorReading)
        .where(SensorReading.bin_id == bin_id)
        .order_by(desc(SensorReading.timestamp))
        .limit(limit)
    )
    return db.scalars(stmt).all()


# ══════════════════════════════════════════════════════
#  STATUS — current state of all bins (dashboard feed)
# ══════════════════════════════════════════════════════

@router.get("/status", response_model=list[BinStatus])
def get_all_bin_status(db: Session = Depends(get_db)):
    """
    Returns every bin with its latest sensor reading.
    This is the main endpoint the dashboard polls.
    """
    bins = db.scalars(select(Bin).order_by(Bin.id)).all()
    result = []

    for b in bins:
        # Get latest reading
        latest = db.scalars(
            select(SensorReading)
            .where(SensorReading.bin_id == b.id)
            .order_by(desc(SensorReading.timestamp))
            .limit(1)
        ).first()

        fill = latest.fill_level_pct if latest else None
        weight = latest.weight_kg if latest else None
        gas = latest.gas_ppm if latest else None

        status = BinStatus(
            id=b.id,
            label=b.label,
            latitude=b.latitude,
            longitude=b.longitude,
            capacity_liters=b.capacity_liters,
            fill_level_pct=fill,
            weight_kg=weight,
            gas_ppm=gas,
            battery_voltage=latest.battery_voltage if latest else None,
            effective_fill=compute_effective_fill(fill, weight, gas, b.capacity_liters),
            last_reading_at=latest.timestamp if latest else None,
        )
        result.append(status)

    return result


# ══════════════════════════════════════════════════════
#  COLLECTIONS — log when a bin is emptied
# ══════════════════════════════════════════════════════

@router.post("/collections", response_model=CollectionResponse, status_code=201)
def log_collection(payload: CollectionCreate, db: Session = Depends(get_db)):
    """Record that a bin was collected/emptied."""
    bin = db.get(Bin, payload.bin_id)
    if not bin:
        raise HTTPException(404, f"Bin {payload.bin_id} not found")

    log = CollectionLog(**payload.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


# ══════════════════════════════════════════════════════
#  PREDICTIONS — when will each bin need collection?
# ══════════════════════════════════════════════════════

@router.get("/predictions")
def get_predictions(
    threshold: float = Query(default=80.0, ge=0, le=100),
    lookback_hours: float = Query(default=24.0, ge=1),
    db: Session = Depends(get_db),
):
    """
    Predict when each bin will reach the fill threshold.
    Returns bins sorted by urgency (soonest first).
    """
    from app.predictor import predict_all_bins
    return predict_all_bins(db, threshold, lookback_hours)


# ══════════════════════════════════════════════════════
#  ROUTE — optimized collection route
# ══════════════════════════════════════════════════════

@router.get("/route")
def get_optimized_route(
    threshold: float = Query(default=80.0, ge=0, le=100),
    hours_ahead: float = Query(default=8.0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Generate an optimized collection route based on predictions.

    Collects bins that:
      - Are already above the threshold, OR
      - Are predicted to exceed the threshold within `hours_ahead`
    """
    from app.predictor import predict_all_bins
    from app.optimizer import optimize_route

    predictions = predict_all_bins(db, threshold)

    # Filter: bins that need collection now or within the lookahead window
    bins_to_collect = []
    for pred in predictions:
        eff = pred["current_effective_fill"]
        hours = pred["hours_until_full"]

        needs_now = eff is not None and eff >= threshold
        needs_soon = hours is not None and hours <= hours_ahead

        if needs_now or needs_soon:
            # We need lat/lng — fetch the bin
            bin = db.get(Bin, pred["bin_id"])
            bins_to_collect.append({
                "bin_id": pred["bin_id"],
                "label": pred["label"],
                "latitude": bin.latitude,
                "longitude": bin.longitude,
                "effective_fill": pred["current_effective_fill"],
                "hours_until_full": pred["hours_until_full"],
            })

    route_result = optimize_route(bins_to_collect)
    route_result["predictions"] = predictions

    return route_result
