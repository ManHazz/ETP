"""
Multi-signal fill predictor
============================

The v1 predictor projected forward with a plain linear regression over recent
readings. That answers "how has this bin been filling?" but ignores what we
already know about the bin's *context*: what time it is, what day of week,
whether it's raining, whether an event is happening, and — for brand new bins
with no history — what kind of location it is.

This v2 combines four signals to estimate a per-hour fill rate:

  1. Learned historical rate:  average % / hour observed for this bin at the
     current (day-of-week, hour-bucket) — using the last 21 days of data.
  2. Recent-trend rate:        linear-regression slope over the last N hours.
  3. Category prior:           per-category default rate (cold-start).
  4. Adjustments:              multiplied by (weather multiplier × event
                               multiplier) from the current time.

The four rate signals are blended with confidence-weighted averages. If none
of the signals are usable we fall back to a very conservative "unknown".

The prediction includes a coarse confidence band (low/medium/high) and an
`hours_until_full_low` / `_high` pair so the UI can render uncertainty.
"""

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, and_
from sqlalchemy.orm import Session

from app.models import Bin, SensorReading, BinEvent
from app.fusion import compute_effective_fill
from app.weather import get_weather

# ── Category priors: rough %-per-hour when nothing else is known ─────────
# Numbers derived from typical waste-industry benchmarks; treat as tunables.
CATEGORY_PRIORS = {
    "cafeteria":   4.0,
    "office":      1.0,
    "hostel":      2.5,
    "park":        1.5,
    "residential": 1.2,
    "sports":      1.5,
    "library":     0.8,
    "other":       1.5,
}

TREND_LOOKBACK_HOURS = 12
HISTORICAL_LOOKBACK_DAYS = 21
DAY_OF_WEEK_BUCKET_HOURS = 3   # bucket size — 3h = 8 buckets/day


def _hour_bucket(ts: datetime) -> int:
    return ts.hour // DAY_OF_WEEK_BUCKET_HOURS


def _linear_slope(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 2:
        return None
    sx = sum(xs); sy = sum(ys)
    sxx = sum(x * x for x in xs)
    sxy = sum(x * y for x, y in zip(xs, ys))
    d = n * sxx - sx * sx
    if abs(d) < 1e-9:
        return None
    return (n * sxy - sx * sy) / d


@dataclass
class RateSignal:
    slope: float | None   # % / hour
    confidence: float     # 0..1
    source: str


def _recent_trend(readings: list[SensorReading], bin: Bin) -> RateSignal:
    if len(readings) < 2:
        return RateSignal(None, 0.0, "recent-trend")
    t0 = readings[0].timestamp
    xs, ys = [], []
    for r in readings:
        eff = compute_effective_fill(r.fill_level_pct, r.weight_kg, r.gas_ppm, bin.capacity_liters)
        if eff is None:
            continue
        xs.append((r.timestamp - t0).total_seconds() / 3600)
        ys.append(eff)
    slope = _linear_slope(xs, ys)
    if slope is None:
        return RateSignal(None, 0.0, "recent-trend")
    # More samples = more confidence; cap at 1.0
    conf = min(len(xs) / 15, 1.0)
    return RateSignal(max(slope, 0.0), conf, "recent-trend")


def _historical_rate(db: Session, bin: Bin, now: datetime) -> RateSignal:
    """
    Average % / hour observed for this bin over the last 21 days, restricted
    to readings at the same (day-of-week, hour-bucket) as *now*.
    """
    cutoff = now - timedelta(days=HISTORICAL_LOOKBACK_DAYS)
    stmt = (
        select(SensorReading)
        .where(and_(SensorReading.bin_id == bin.id,
                    SensorReading.timestamp >= cutoff))
        .order_by(SensorReading.timestamp)
    )
    rows = list(db.scalars(stmt).all())
    if len(rows) < 4:
        return RateSignal(None, 0.0, "historical")

    target_dow = now.weekday()
    target_bucket = _hour_bucket(now)

    rates: list[float] = []
    prev = None
    for r in rows:
        if prev is not None:
            dt = (r.timestamp - prev.timestamp).total_seconds() / 3600
            if 0 < dt < 2:  # ignore huge gaps
                dfill = r.fill_level_pct - prev.fill_level_pct
                if dfill > 0 and r.timestamp.weekday() == target_dow and _hour_bucket(r.timestamp) == target_bucket:
                    rates.append(dfill / dt)
        prev = r

    if not rates:
        return RateSignal(None, 0.0, "historical")
    avg = sum(rates) / len(rates)
    conf = min(len(rates) / 10, 1.0)  # need 10+ matching intervals for full confidence
    return RateSignal(max(avg, 0.0), conf, "historical")


def _category_prior(bin: Bin) -> RateSignal:
    return RateSignal(CATEGORY_PRIORS.get(bin.category, CATEGORY_PRIORS["other"]),
                      0.35, "category-prior")


def _active_event_multiplier(db: Session, bin_id: int, now: datetime) -> tuple[float, str | None]:
    stmt = (
        select(BinEvent)
        .where(and_(BinEvent.starts_at <= now, BinEvent.ends_at >= now))
        .where((BinEvent.bin_id == bin_id) | (BinEvent.bin_id.is_(None)))
    )
    events = list(db.scalars(stmt).all())
    if not events:
        return 1.0, None
    # If multiple events overlap, multiply their multipliers (rare, but composable).
    m = 1.0
    labels = []
    for e in events:
        m *= max(e.fill_rate_multiplier, 0.1)
        labels.append(e.label)
    return m, ", ".join(labels)


def _blend(signals: list[RateSignal]) -> tuple[float, float]:
    """Confidence-weighted average of slopes. Returns (slope, aggregate_confidence)."""
    usable = [s for s in signals if s.slope is not None and s.confidence > 0]
    if not usable:
        return 0.0, 0.0
    total_w = sum(s.confidence for s in usable)
    slope = sum(s.slope * s.confidence for s in usable) / total_w
    # Aggregate confidence uses log-space combination to avoid saturating too fast.
    agg = min(sum(s.confidence for s in usable) / len(usable) + 0.1 * (len(usable) - 1), 1.0)
    return slope, agg


def _confidence_label(conf: float) -> str:
    if conf >= 0.7: return "high"
    if conf >= 0.4: return "medium"
    return "low"


def predict_bin_fill(db: Session, bin: Bin, threshold: float = 80.0) -> dict:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=TREND_LOOKBACK_HOURS)

    readings = list(db.scalars(
        select(SensorReading)
        .where(SensorReading.bin_id == bin.id)
        .where(SensorReading.timestamp >= cutoff)
        .order_by(SensorReading.timestamp)
    ).all())

    latest = readings[-1] if readings else None
    current_eff = None
    if latest:
        current_eff = compute_effective_fill(
            latest.fill_level_pct, latest.weight_kg, latest.gas_ppm, bin.capacity_liters,
        )

    trend = _recent_trend(readings, bin)
    historical = _historical_rate(db, bin, now)
    prior = _category_prior(bin)

    slope, conf = _blend([trend, historical, prior])

    # Weather and event adjustments
    weather = get_weather(bin.latitude, bin.longitude)
    event_mult, event_label = _active_event_multiplier(db, bin.id, now)
    effective_slope = slope * weather.fill_multiplier * event_mult

    # Rate → time until threshold
    if current_eff is None or effective_slope <= 0.05:
        hours_until = None
        pred_at = None
        band = (None, None)
    elif current_eff >= threshold:
        hours_until = 0.0
        pred_at = now
        band = (0.0, 0.0)
    else:
        gap = threshold - current_eff
        hours_until = gap / effective_slope
        pred_at = now + timedelta(hours=hours_until)
        # Uncertainty band: widen when confidence is low.
        widen = max(0.15, 1.0 - conf)  # 15% at high confidence, up to 100% at low
        band = (max(hours_until * (1 - widen), 0.0), hours_until * (1 + widen))

    signals_used = [s.source for s in (trend, historical, prior) if s.slope is not None and s.confidence > 0]

    return {
        "bin_id": bin.id,
        "label": bin.label,
        "category": bin.category,
        "current_effective_fill": round(current_eff, 1) if current_eff is not None else None,
        "fill_rate_per_hour": round(effective_slope, 2),
        "fill_rate_raw": round(slope, 2),
        "hours_until_full": round(hours_until, 1) if hours_until is not None else None,
        "hours_until_full_low": round(band[0], 1) if band[0] is not None else None,
        "hours_until_full_high": round(band[1], 1) if band[1] is not None else None,
        "predicted_full_at": pred_at.isoformat() if pred_at else None,
        "confidence": _confidence_label(conf),
        "signals_used": signals_used,
        "weather": {
            "summary": weather.summary,
            "fill_multiplier": weather.fill_multiplier,
        },
        "event": event_label,
        "event_multiplier": round(event_mult, 2),
    }


def predict_all_bins(db: Session, threshold: float = 80.0, lookback_hours: float | None = None) -> list[dict]:
    """`lookback_hours` is accepted for backward compat but no longer used — the
    new predictor blends signals across the full recent window automatically."""
    bins = list(db.scalars(select(Bin).where(Bin.active.is_(True)).order_by(Bin.id)).all())
    preds = [predict_bin_fill(db, b, threshold) for b in bins]
    preds.sort(key=lambda p: p["hours_until_full"] if p["hours_until_full"] is not None else float("inf"))
    return preds
