"""
Rules-based anomaly detection over recent sensor history.

Runs on demand (from a route hit) and writes new anomalies to the DB with
de-duplication: if an unresolved anomaly of the same kind exists within the
last 6 hours for the same bin, we skip creating a duplicate.

Kinds:
  - dead        : no readings for > 60 minutes (dead node / offline)
  - stuck       : last N readings identical (sensor frozen)
  - spike       : sudden fill jump > 40 pct-points between consecutive readings
  - low_battery : battery voltage below 2.8 V
  - gas_hazard  : gas > 300 ppm regardless of fill (odour/decomposition)
  - tamper      : weight spike > 15 kg without fill change (someone dropped something heavy)
"""

from datetime import datetime, timedelta, timezone
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from app.models import Anomaly, Bin, SensorReading

DEAD_MINUTES = 60
STUCK_MIN_SAMPLES = 6           # how many consecutive identical readings count as stuck
STUCK_LOOKBACK_HOURS = 4
SPIKE_DELTA_PCT = 40.0
LOW_BATTERY_V = 2.8
GAS_HAZARD_PPM = 300.0
TAMPER_WEIGHT_KG = 15.0
DEDUPE_HOURS = 6


def _recent_unresolved(db: Session, bin_id: int, kind: str) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=DEDUPE_HOURS)
    stmt = (
        select(Anomaly.id)
        .where(Anomaly.bin_id == bin_id)
        .where(Anomaly.kind == kind)
        .where(Anomaly.resolved_at.is_(None))
        .where(Anomaly.detected_at >= cutoff)
        .limit(1)
    )
    return db.scalar(stmt) is not None


def _record(db: Session, bin_id: int, kind: str, severity: str, message: str) -> None:
    if _recent_unresolved(db, bin_id, kind):
        return
    db.add(Anomaly(bin_id=bin_id, kind=kind, severity=severity, message=message))


def check_bin(db: Session, bin: Bin) -> list[str]:
    """Return the list of anomaly kinds recorded for this bin during this check."""
    now = datetime.now(timezone.utc)
    recent = list(
        db.scalars(
            select(SensorReading)
            .where(SensorReading.bin_id == bin.id)
            .order_by(desc(SensorReading.timestamp))
            .limit(STUCK_MIN_SAMPLES + 2)
        ).all()
    )
    kinds: list[str] = []

    if not recent:
        return kinds

    latest = recent[0]

    # Dead node
    age = (now - latest.timestamp).total_seconds() / 60
    if age > DEAD_MINUTES:
        _record(db, bin.id, "dead", "critical", f"No readings for {age:.0f} min")
        kinds.append("dead")
        db.commit()
        return kinds  # nothing else meaningful without recent data

    # Low battery
    if latest.battery_voltage is not None and latest.battery_voltage < LOW_BATTERY_V:
        _record(db, bin.id, "low_battery", "warning",
                f"Battery {latest.battery_voltage:.2f} V (< {LOW_BATTERY_V})")
        kinds.append("low_battery")

    # Gas hazard (even at low fill)
    if latest.gas_ppm is not None and latest.gas_ppm > GAS_HAZARD_PPM:
        _record(db, bin.id, "gas_hazard", "critical",
                f"Gas {latest.gas_ppm:.0f} ppm exceeds hazard threshold")
        kinds.append("gas_hazard")

    # Stuck sensor
    if len(recent) >= STUCK_MIN_SAMPLES:
        cutoff = now - timedelta(hours=STUCK_LOOKBACK_HOURS)
        window = [r for r in recent if r.timestamp >= cutoff]
        if len(window) >= STUCK_MIN_SAMPLES:
            fills = {round(r.fill_level_pct, 1) for r in window}
            weights = {round(r.weight_kg, 2) for r in window}
            if len(fills) == 1 and len(weights) == 1 and latest.fill_level_pct not in (0.0,):
                _record(db, bin.id, "stuck", "warning",
                        f"Sensor value unchanged for {len(window)} consecutive readings")
                kinds.append("stuck")

    # Spike between the two latest
    if len(recent) >= 2:
        prev = recent[1]
        dfill = latest.fill_level_pct - prev.fill_level_pct
        dweight = latest.weight_kg - prev.weight_kg
        dt = (latest.timestamp - prev.timestamp).total_seconds() / 60
        if dt > 0 and dt < 30:  # only meaningful for close-together samples
            if dfill > SPIKE_DELTA_PCT:
                _record(db, bin.id, "spike", "warning",
                        f"Fill jumped +{dfill:.0f}% in {dt:.0f} min — possible obstruction")
                kinds.append("spike")
            if dweight > TAMPER_WEIGHT_KG and abs(dfill) < 10:
                _record(db, bin.id, "tamper", "warning",
                        f"Weight jumped +{dweight:.1f} kg without matching fill change")
                kinds.append("tamper")

    db.commit()
    return kinds


def check_all_bins(db: Session) -> int:
    """Run detection over every active bin. Returns total anomalies recorded."""
    total = 0
    bins = list(db.scalars(select(Bin).where(Bin.active.is_(True))).all())
    for b in bins:
        total += len(check_bin(db, b))
    return total


def auto_close_on_empty(db: Session, bin_id: int, weight_kg: float | None) -> None:
    """
    When weight drops to near-zero we can be confident the bin was emptied.
    Close any 'stuck' / 'spike' anomalies for it — the physical world moved.
    """
    if weight_kg is None or weight_kg > 2.0:
        return
    now = datetime.now(timezone.utc)
    open_ = list(
        db.scalars(
            select(Anomaly)
            .where(Anomaly.bin_id == bin_id)
            .where(Anomaly.kind.in_(("stuck", "spike", "tamper")))
            .where(Anomaly.resolved_at.is_(None))
        ).all()
    )
    for a in open_:
        a.resolved_at = now
    if open_:
        db.commit()
