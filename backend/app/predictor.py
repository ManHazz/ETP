"""
Fill Rate Predictor
===================
Predicts when each bin will reach a fill threshold based on
historical sensor readings. Uses simple linear regression on
the effective fill time-series per bin.

No ML framework needed — just numpy-level math with stdlib.
"""

from datetime import datetime, timezone, timedelta
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from app.models import Bin, SensorReading
from app.fusion import compute_effective_fill


def _linear_regression(xs: list[float], ys: list[float]) -> tuple[float, float]:
    """
    Simple least-squares linear regression.
    Returns (slope, intercept).
    slope = rate of fill change per hour.
    """
    n = len(xs)
    if n < 2:
        return 0.0, ys[0] if ys else 0.0

    sum_x = sum(xs)
    sum_y = sum(ys)
    sum_xy = sum(x * y for x, y in zip(xs, ys))
    sum_x2 = sum(x * x for x in xs)

    denom = n * sum_x2 - sum_x * sum_x
    if abs(denom) < 1e-10:
        return 0.0, sum_y / n

    slope = (n * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - slope * sum_x) / n
    return slope, intercept


def predict_bin_fill(
    db: Session,
    bin: Bin,
    threshold: float = 80.0,
    lookback_hours: float = 24.0,
) -> dict:
    """
    Predict when a bin will reach the fill threshold.

    Returns:
        {
            "bin_id": int,
            "label": str,
            "current_effective_fill": float,
            "fill_rate_per_hour": float,      # % per hour
            "predicted_full_at": datetime,     # when it hits threshold
            "hours_until_full": float,         # hours from now
            "confidence": str,                 # "high", "medium", "low"
            "needs_collection_within": float,  # hours (convenience)
        }
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=lookback_hours)

    # Fetch recent readings
    stmt = (
        select(SensorReading)
        .where(SensorReading.bin_id == bin.id)
        .where(SensorReading.timestamp >= cutoff)
        .order_by(SensorReading.timestamp)
    )
    readings = list(db.scalars(stmt).all())

    if len(readings) < 2:
        # Not enough data — use current reading if available
        latest = readings[-1] if readings else None
        current = None
        if latest:
            current = compute_effective_fill(
                latest.fill_level_pct, latest.weight_kg,
                latest.gas_ppm, bin.capacity_liters,
            )
        return {
            "bin_id": bin.id,
            "label": bin.label,
            "current_effective_fill": current,
            "fill_rate_per_hour": None,
            "predicted_full_at": None,
            "hours_until_full": None,
            "confidence": "low",
            "needs_collection_within": None,
        }

    # Build time-series: x = hours since first reading, y = effective fill
    t0 = readings[0].timestamp
    xs = []
    ys = []
    for r in readings:
        hours = (r.timestamp - t0).total_seconds() / 3600
        eff = compute_effective_fill(
            r.fill_level_pct, r.weight_kg,
            r.gas_ppm, bin.capacity_liters,
        )
        if eff is not None:
            xs.append(hours)
            ys.append(eff)

    if len(xs) < 2:
        return {
            "bin_id": bin.id,
            "label": bin.label,
            "current_effective_fill": ys[-1] if ys else None,
            "fill_rate_per_hour": None,
            "predicted_full_at": None,
            "hours_until_full": None,
            "confidence": "low",
            "needs_collection_within": None,
        }

    slope, intercept = _linear_regression(xs, ys)

    # Current effective fill (from regression line at latest time)
    current_hours = (now - t0).total_seconds() / 3600
    current_fill = slope * current_hours + intercept
    current_fill = max(0, min(100, current_fill))

    # Use actual latest reading for display
    actual_current = ys[-1]

    # Predict when threshold is reached
    if slope <= 0.01:
        # Flat or decreasing — bin won't fill up
        hours_until = None
        predicted_at = None
    else:
        # threshold = slope * t + intercept  =>  t = (threshold - intercept) / slope
        t_full = (threshold - intercept) / slope
        hours_until = t_full - current_hours

        if hours_until < 0:
            # Already past threshold
            hours_until = 0
            predicted_at = now
        else:
            predicted_at = now + timedelta(hours=hours_until)

    # Confidence based on data quantity and fit
    if len(xs) >= 20:
        confidence = "high"
    elif len(xs) >= 8:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "bin_id": bin.id,
        "label": bin.label,
        "current_effective_fill": round(actual_current, 1),
        "fill_rate_per_hour": round(slope, 2) if slope > 0.01 else 0.0,
        "predicted_full_at": predicted_at.isoformat() if predicted_at else None,
        "hours_until_full": round(hours_until, 1) if hours_until is not None else None,
        "confidence": confidence,
        "needs_collection_within": round(hours_until, 1) if hours_until is not None else None,
    }


def predict_all_bins(
    db: Session,
    threshold: float = 80.0,
    lookback_hours: float = 24.0,
) -> list[dict]:
    """Predict fill times for all bins, sorted by urgency."""
    bins = list(db.scalars(select(Bin).order_by(Bin.id)).all())
    predictions = []

    for b in bins:
        pred = predict_bin_fill(db, b, threshold, lookback_hours)
        predictions.append(pred)

    # Sort: bins needing collection soonest first, nulls last
    predictions.sort(
        key=lambda p: p["hours_until_full"] if p["hours_until_full"] is not None else float("inf")
    )

    return predictions
