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


def _slope_over(readings: list[SensorReading], bin: Bin, hours_back: float) -> tuple[float | None, int]:
    """Linear slope over the last `hours_back` hours. Returns (slope, sample_count)."""
    if not readings:
        return None, 0
    now_ref = readings[-1].timestamp
    cutoff = now_ref - timedelta(hours=hours_back)
    xs, ys = [], []
    t0 = None
    for r in readings:
        if r.timestamp < cutoff:
            continue
        eff = compute_effective_fill(r.fill_level_pct, r.weight_kg, r.gas_ppm, bin.capacity_liters)
        if eff is None:
            continue
        if t0 is None:
            t0 = r.timestamp
        xs.append((r.timestamp - t0).total_seconds() / 3600)
        ys.append(eff)
    if len(xs) < 2:
        return None, len(xs)
    return _linear_slope(xs, ys), len(xs)


def _recent_trend(readings: list[SensorReading], bin: Bin) -> RateSignal:
    """
    Uses two windows — the last hour and the last 12 hours — and returns the
    faster of the two if they diverge sharply. That way a bin that just started
    filling rapidly (or just stopped filling) reacts within one hour instead of
    being averaged out by a stale 12-hour trend.
    """
    long_slope, long_n = _slope_over(readings, bin, hours_back=TREND_LOOKBACK_HOURS)
    short_slope, short_n = _slope_over(readings, bin, hours_back=1.0)

    # Prefer the short-window slope when we have enough recent samples AND it
    # disagrees with the long window by >30%. Otherwise fall back to the
    # smoother long-window slope.
    slope = long_slope
    if short_slope is not None and short_n >= 3 and long_slope is not None:
        if abs(short_slope - long_slope) / max(abs(long_slope), 0.5) > 0.3:
            slope = short_slope

    if slope is None:
        return RateSignal(None, 0.0, "recent-trend")
    conf = min(long_n / 15, 1.0)
    return RateSignal(max(slope, 0.0), conf, "recent-trend")


def _trend_state(readings: list[SensorReading], bin: Bin, current_eff: float | None) -> str:
    """
    Classify how the fill rate is changing right now.

      accelerating — filling much faster than the 12h average
      slowing      — filling noticeably slower than the 12h average
      stalled      — barely moving (rate under ~0.3 %/h for 1h+)
      steady       — filling at roughly the same rate as the 12h average
      unknown      — not enough data
    """
    long_slope, long_n = _slope_over(readings, bin, hours_back=TREND_LOOKBACK_HOURS)
    short_slope, short_n = _slope_over(readings, bin, hours_back=1.0)
    if short_slope is None or short_n < 3:
        return "unknown"
    if short_slope < 0.3:
        return "stalled"
    if long_slope is None or long_n < 3:
        return "steady"
    ratio = short_slope / max(long_slope, 0.1)
    if ratio > 1.5: return "accelerating"
    if ratio < 0.5: return "slowing"
    return "steady"


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
    state = _trend_state(readings, bin, current_eff)

    slope, conf = _blend([trend, historical, prior])

    # If the recent behaviour disagrees strongly with the blended average,
    # shade confidence downward — the world just changed on us.
    if state in ("slowing", "accelerating"):
        conf = max(conf * 0.7, 0.15)
    elif state == "stalled":
        conf = max(conf * 0.5, 0.1)

    # Weather and event adjustments
    weather = get_weather(bin.latitude, bin.longitude)
    event_mult, event_label = _active_event_multiplier(db, bin.id, now)
    effective_slope = slope * weather.fill_multiplier * event_mult

    # Rate → time until threshold
    if current_eff is None or effective_slope <= 0.05 or state == "stalled":
        # No usable rate, OR the bin has just gone quiet. Report the situation
        # explicitly so the UI can show "not filling right now" rather than
        # silently falling back to a stale earlier estimate.
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
        # Uncertainty band: widen when confidence is low. Widen further when
        # the trend is diverging (accelerating / slowing) — the point estimate
        # is more suspect the more recent behaviour has changed.
        widen = max(0.15, 1.0 - conf)
        if state in ("slowing", "accelerating"):
            widen = min(widen * 1.5, 1.0)
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
        "trend_state": state,
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
