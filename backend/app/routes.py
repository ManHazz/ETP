import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile, Form
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bin, SensorReading, CollectionLog, BinEvent, Anomaly, User
from app.fusion import compute_effective_fill
from app.schemas import (
    BinCreate, BinResponse, BinStatus, BinClaimRequest,
    SensorPayload, ReadingResponse,
    CollectionCreate, CollectionResponse,
    BinEventCreate, BinEventResponse,
    AnomalyResponse,
    LoginResponse, UserResponse, UserCreate,
    RegisterRequest, GoogleAuthRequest, AuthConfigResponse,
)
from app.auth import (
    hash_password, verify_password, create_token,
    get_current_user, require_role,
    google_configured, GOOGLE_CLIENT_ID,
    verify_google_id_token, find_or_create_google_user,
)
from app.weather import get_weather
from app import anomaly as anomaly_engine


router = APIRouter()

DEAD_MINUTES = 60
PHOTO_DIR = Path(os.getenv("PHOTO_STORAGE_DIR", "/app/photos"))
PHOTO_DIR.mkdir(parents=True, exist_ok=True)


# ═══════════════════════════════════════════════════════
#  AUTH
# ═══════════════════════════════════════════════════════

ALLOW_REGISTRATION = os.getenv("ALLOW_REGISTRATION", "true").lower() in ("1", "true", "yes")


def _login_response(user: User) -> LoginResponse:
    return LoginResponse(
        access_token=create_token(user.username, user.role),
        role=user.role,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        auth_provider=user.auth_provider,
    )


@router.get("/auth/config", response_model=AuthConfigResponse)
def auth_config():
    """Public info the login page uses to decide which options to show."""
    return AuthConfigResponse(
        google_enabled=google_configured(),
        google_client_id=GOOGLE_CLIENT_ID if google_configured() else None,
        allow_registration=ALLOW_REGISTRATION,
    )


@router.post("/auth/login", response_model=LoginResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Allow login by either username OR email (whichever the user typed)
    ident = form.username.strip()
    user = db.scalar(
        select(User).where((User.username == ident) | (User.email == ident.lower()))
    )
    if not user or not user.active or not verify_password(form.password, user.password_hash):
        raise HTTPException(401, "invalid credentials")
    return _login_response(user)


@router.post("/auth/register", response_model=LoginResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    if not ALLOW_REGISTRATION:
        raise HTTPException(403, "self-registration is disabled")
    email = payload.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(400, "email already registered")

    # Derive a unique username from the email local-part
    base = email.split("@", 1)[0]
    base = "".join(c for c in base if c.isalnum() or c in "._-")[:48] or "user"
    username, i = base, 1
    while db.scalar(select(User.id).where(User.username == username)):
        i += 1
        username = f"{base}{i}"

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role="viewer",
        auth_provider="local",
    )
    db.add(user); db.commit(); db.refresh(user)
    return _login_response(user)


@router.post("/auth/google", response_model=LoginResponse)
def google_login(body: GoogleAuthRequest, db: Session = Depends(get_db)):
    payload = verify_google_id_token(body.credential)
    user = find_or_create_google_user(db, payload)
    if not user.active:
        raise HTTPException(403, "your account is disabled")
    return _login_response(user)


@router.get("/auth/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/users", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    return db.scalars(select(User).order_by(User.id)).all()


@router.post("/users", response_model=UserResponse, status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(400, "username already exists")
    if payload.role not in ("admin", "driver", "viewer"):
        raise HTTPException(400, "role must be admin, driver or viewer")
    u = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=payload.role,
        full_name=payload.full_name,
    )
    db.add(u); db.commit(); db.refresh(u)
    return u


# ═══════════════════════════════════════════════════════
#  BINS
# ═══════════════════════════════════════════════════════

@router.post("/bins", response_model=BinResponse, status_code=201)
def create_bin(payload: BinCreate, db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    bin = Bin(**payload.model_dump())
    db.add(bin); db.commit(); db.refresh(bin)
    return bin


@router.get("/bins", response_model=list[BinResponse])
def list_bins(db: Session = Depends(get_db)):
    return db.scalars(select(Bin).where(Bin.active.is_(True), Bin.pending.is_(False)).order_by(Bin.id)).all()


@router.get("/bins/pending", response_model=list[BinResponse])
def list_pending_bins(db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    """Devices that auto-registered themselves via MQTT but haven't been named/located yet."""
    return db.scalars(select(Bin).where(Bin.pending.is_(True)).order_by(Bin.created_at)).all()


@router.post("/bins/{bin_id}/claim", response_model=BinResponse)
def claim_bin(bin_id: int, payload: BinClaimRequest, db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    bin = db.get(Bin, bin_id)
    if not bin:
        raise HTTPException(404, "Bin not found")
    if not bin.pending:
        raise HTTPException(400, "Bin is not pending")
    bin.label = payload.label
    bin.latitude = payload.latitude
    bin.longitude = payload.longitude
    bin.capacity_liters = payload.capacity_liters
    bin.category = payload.category
    bin.soft_threshold_pct = payload.soft_threshold_pct
    bin.description = payload.description
    bin.pending = False
    bin.active = True
    db.commit(); db.refresh(bin)
    return bin


@router.get("/bins/{bin_id}", response_model=BinResponse)
def get_bin(bin_id: int, db: Session = Depends(get_db)):
    bin = db.get(Bin, bin_id)
    if not bin:
        raise HTTPException(404, "Bin not found")
    return bin


@router.delete("/bins/{bin_id}", status_code=204)
def delete_bin(bin_id: int, db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    bin = db.get(Bin, bin_id)
    if not bin:
        raise HTTPException(404, "Bin not found")
    # Soft delete — preserves history & FK integrity. Also clear pending
    # so deleting an unclaimed bin actually removes it from the Unclaimed
    # panel (otherwise pending stays true and the row keeps appearing).
    bin.active = False
    bin.pending = False
    db.commit()


# ═══════════════════════════════════════════════════════
#  SENSOR READINGS
# ═══════════════════════════════════════════════════════

@router.post("/readings", response_model=ReadingResponse, status_code=201)
def ingest_reading(payload: SensorPayload, db: Session = Depends(get_db)):
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
    db.add(reading); db.commit(); db.refresh(reading)

    # Auto-calibrate: near-zero weight => any open anomalies resolved.
    anomaly_engine.auto_close_on_empty(db, bin.id, payload.weight_kg)
    return reading


@router.get("/readings/{bin_id}", response_model=list[ReadingResponse])
def get_readings(bin_id: int, limit: int = Query(default=50, le=500), db: Session = Depends(get_db)):
    stmt = (
        select(SensorReading)
        .where(SensorReading.bin_id == bin_id)
        .order_by(desc(SensorReading.timestamp))
        .limit(limit)
    )
    return db.scalars(stmt).all()


# ═══════════════════════════════════════════════════════
#  STATUS FEED
# ═══════════════════════════════════════════════════════

@router.get("/status", response_model=list[BinStatus])
def status_feed(db: Session = Depends(get_db)):
    bins = db.scalars(select(Bin).where(Bin.active.is_(True)).order_by(Bin.id)).all()
    now = datetime.now(timezone.utc)
    result: list[BinStatus] = []
    for b in bins:
        latest = db.scalars(
            select(SensorReading)
            .where(SensorReading.bin_id == b.id)
            .order_by(desc(SensorReading.timestamp))
            .limit(1)
        ).first()
        fill = latest.fill_level_pct if latest else None
        weight = latest.weight_kg if latest else None
        gas = latest.gas_ppm if latest else None
        is_dead = latest is None or (now - latest.timestamp) > timedelta(minutes=DEAD_MINUTES)
        result.append(BinStatus(
            id=b.id, label=b.label,
            latitude=b.latitude, longitude=b.longitude,
            capacity_liters=b.capacity_liters,
            category=b.category, soft_threshold_pct=b.soft_threshold_pct,
            fill_level_pct=fill, weight_kg=weight, gas_ppm=gas,
            battery_voltage=latest.battery_voltage if latest else None,
            effective_fill=compute_effective_fill(fill, weight, gas, b.capacity_liters),
            last_reading_at=latest.timestamp if latest else None,
            is_dead=is_dead,
        ))
    return result


# ═══════════════════════════════════════════════════════
#  COLLECTIONS
# ═══════════════════════════════════════════════════════

@router.post("/collections", response_model=CollectionResponse, status_code=201)
def log_collection(payload: CollectionCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    bin = db.get(Bin, payload.bin_id)
    if not bin:
        raise HTTPException(404, f"Bin {payload.bin_id} not found")
    data = payload.model_dump()
    if not data.get("collected_by"):
        data["collected_by"] = user.username
    log = CollectionLog(**data)
    db.add(log); db.commit(); db.refresh(log)
    return log


@router.get("/collections", response_model=list[CollectionResponse])
def list_collections(
    limit: int = Query(default=50, le=500),
    bin_id: int | None = None,
    since_hours: float | None = Query(default=None, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(CollectionLog).order_by(desc(CollectionLog.collected_at)).limit(limit)
    if bin_id is not None:
        stmt = stmt.where(CollectionLog.bin_id == bin_id)
    if since_hours is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=since_hours)
        stmt = stmt.where(CollectionLog.collected_at >= cutoff)
    return db.scalars(stmt).all()


@router.post("/collections/photo", status_code=201)
async def upload_photo(
    file: UploadFile = File(...),
    bin_id: int = Form(...),
    _: User = Depends(get_current_user),
):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(400, "unsupported image type")
    ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[file.content_type]
    name = f"{bin_id}-{uuid.uuid4().hex}{ext}"
    path = PHOTO_DIR / name
    with path.open("wb") as f:
        content = await file.read()
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(400, "image too large (max 5 MB)")
        f.write(content)
    return {"photo_path": f"/photos/{name}"}


# ═══════════════════════════════════════════════════════
#  PREDICTIONS + DISPATCH
# ═══════════════════════════════════════════════════════

@router.get("/predictions")
def get_predictions(
    threshold: float = Query(default=80.0, ge=0, le=100),
    db: Session = Depends(get_db),
):
    from app.predictor import predict_all_bins
    return predict_all_bins(db, threshold)


@router.get("/dispatch-decision")
def dispatch_decision(
    hard_threshold: float = Query(default=80.0, ge=0, le=100),
    soft_threshold: float = Query(default=40.0, ge=0, le=100),
    min_bins: int = Query(default=3, ge=1, le=50),
    topup_radius_km: float = Query(default=0.8, ge=0, le=50),
    grace_hours: float = Query(default=6.0, ge=0, le=72),
    cost_per_km: float = Query(default=1.20, ge=0),
    cost_per_stop: float = Query(default=8.00, ge=0),
    db: Session = Depends(get_db),
):
    """
    The main dispatch endpoint. Combines predictions with a batching policy
    and hazard checks so operators don't roll a truck for a single bin.
    """
    from app.predictor import predict_all_bins
    from app.optimizer import decide_dispatch, DispatchPolicy

    predictions = predict_all_bins(db, hard_threshold)

    # Build bin lookup with latest sensor values (needed for gas hazard check)
    bins_by_id: dict[int, dict] = {}
    for b in db.scalars(select(Bin).where(Bin.active.is_(True))).all():
        latest = db.scalar(
            select(SensorReading)
            .where(SensorReading.bin_id == b.id)
            .order_by(desc(SensorReading.timestamp))
            .limit(1)
        )
        bins_by_id[b.id] = {
            "bin_id": b.id, "label": b.label,
            "latitude": b.latitude, "longitude": b.longitude,
            "floor": getattr(b, "floor", 0) or 0,
            "soft_threshold_pct": b.soft_threshold_pct,
            "gas_ppm": latest.gas_ppm if latest else None,
        }

    policy = DispatchPolicy(
        hard_threshold=hard_threshold, soft_threshold=soft_threshold,
        min_bins_for_dispatch=min_bins, topup_radius_km=topup_radius_km,
        grace_hours=grace_hours, cost_per_km=cost_per_km, cost_per_stop=cost_per_stop,
    )
    return decide_dispatch(predictions, bins_by_id, policy)


@router.get("/route")
def get_optimized_route(
    threshold: float = Query(default=80.0, ge=0, le=100),
    hours_ahead: float = Query(default=8.0, ge=0),
    min_bins: int = Query(default=3, ge=1, le=50),
    respect_policy: bool = Query(default=True, description="If true, only builds route when dispatch decision agrees."),
    db: Session = Depends(get_db),
):
    """
    Backwards-compatible endpoint that also gates on dispatch policy. Set
    ?respect_policy=false to force a route regardless.
    """
    from app.predictor import predict_all_bins
    from app.optimizer import optimize_route, decide_dispatch, DispatchPolicy

    predictions = predict_all_bins(db, threshold)

    # Build lookup
    bins_by_id: dict[int, dict] = {}
    for b in db.scalars(select(Bin).where(Bin.active.is_(True))).all():
        latest = db.scalar(
            select(SensorReading).where(SensorReading.bin_id == b.id)
            .order_by(desc(SensorReading.timestamp)).limit(1)
        )
        bins_by_id[b.id] = {
            "bin_id": b.id, "label": b.label,
            "latitude": b.latitude, "longitude": b.longitude,
            "floor": getattr(b, "floor", 0) or 0,
            "soft_threshold_pct": b.soft_threshold_pct,
            "gas_ppm": latest.gas_ppm if latest else None,
        }

    policy = DispatchPolicy(hard_threshold=threshold, grace_hours=hours_ahead, min_bins_for_dispatch=min_bins)
    decision = decide_dispatch(predictions, bins_by_id, policy)

    if respect_policy and not decision["should_dispatch"]:
        return {
            "status": "deferred",
            "decision": decision,
            "route": [],
            "predictions": predictions,
            "total_stops": 0,
            "total_distance_km": 0,
            "estimated_time_minutes": 0,
        }

    picks = decision["picks"] if decision["picks"] else [
        {**bins_by_id[p["bin_id"]], "effective_fill": p["current_effective_fill"], "reason": "predicted full"}
        for p in predictions
        if p.get("hours_until_full") is not None and p["hours_until_full"] <= hours_ahead
    ]

    if not picks:
        return {
            "status": "no_bins",
            "decision": decision,
            "route": [],
            "predictions": predictions,
            "total_stops": 0,
            "total_distance_km": 0,
            "estimated_time_minutes": 0,
        }

    route_result = optimize_route(picks)
    route_result["decision"] = decision
    route_result["predictions"] = predictions
    return route_result


# ═══════════════════════════════════════════════════════
#  BIN EVENTS
# ═══════════════════════════════════════════════════════

@router.post("/bin-events", response_model=BinEventResponse, status_code=201)
def create_event(payload: BinEventCreate, db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(400, "ends_at must be after starts_at")
    ev = BinEvent(**payload.model_dump())
    db.add(ev); db.commit(); db.refresh(ev)
    return ev


@router.get("/bin-events", response_model=list[BinEventResponse])
def list_events(
    upcoming_only: bool = True,
    db: Session = Depends(get_db),
):
    stmt = select(BinEvent).order_by(BinEvent.starts_at)
    if upcoming_only:
        stmt = stmt.where(BinEvent.ends_at >= datetime.now(timezone.utc))
    return db.scalars(stmt).all()


@router.delete("/bin-events/{event_id}", status_code=204)
def delete_event(event_id: int, db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    ev = db.get(BinEvent, event_id)
    if not ev:
        raise HTTPException(404, "Event not found")
    db.delete(ev); db.commit()


# ═══════════════════════════════════════════════════════
#  ANOMALIES
# ═══════════════════════════════════════════════════════

@router.get("/anomalies", response_model=list[AnomalyResponse])
def list_anomalies(
    open_only: bool = True,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
):
    stmt = select(Anomaly).order_by(desc(Anomaly.detected_at)).limit(limit)
    if open_only:
        stmt = stmt.where(Anomaly.resolved_at.is_(None))
    return db.scalars(stmt).all()


@router.post("/anomalies/scan")
def scan_anomalies(db: Session = Depends(get_db), _: User = Depends(require_role("admin", "driver"))):
    count = anomaly_engine.check_all_bins(db)
    return {"anomalies_recorded": count}


@router.post("/anomalies/{anomaly_id}/resolve", response_model=AnomalyResponse)
def resolve_anomaly(anomaly_id: int, db: Session = Depends(get_db), _: User = Depends(require_role("admin", "driver"))):
    a = db.get(Anomaly, anomaly_id)
    if not a:
        raise HTTPException(404, "not found")
    a.resolved_at = datetime.now(timezone.utc)
    db.commit(); db.refresh(a)
    return a


# ═══════════════════════════════════════════════════════
#  WEATHER
# ═══════════════════════════════════════════════════════

@router.get("/weather")
def get_weather_now(lat: float = Query(...), lng: float = Query(...)):
    return get_weather(lat, lng).to_dict()
