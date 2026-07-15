from datetime import datetime, timezone
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


# Bin categories inform cold-start fill-rate priors when a bin has no history yet.
BIN_CATEGORIES = ("cafeteria", "office", "hostel", "park", "residential", "sports", "library", "other")


class Bin(Base):
    __tablename__ = "bins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True, index=True)
    label: Mapped[str] = mapped_column(String(100))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    # Floor number for bins inside a multi-storey building. 0 = ground.
    # Bins outside (parks, streets) leave this at 0 and it's a no-op — the
    # optimizer only splits routes when it sees mixed floor values.
    floor: Mapped[int] = mapped_column(Integer, default=0)
    capacity_liters: Mapped[float] = mapped_column(Float, default=120.0)
    category: Mapped[str] = mapped_column(String(24), default="other")
    soft_threshold_pct: Mapped[float] = mapped_column(Float, default=40.0)  # opportunistic pickup floor
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # pending=True → device auto-registered itself but admin hasn't given it a name/location yet.
    pending: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    readings: Mapped[list["SensorReading"]] = relationship(back_populates="bin")


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bin_id: Mapped[int] = mapped_column(Integer, ForeignKey("bins.id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    fill_level_pct: Mapped[float] = mapped_column(Float)
    weight_kg: Mapped[float] = mapped_column(Float)
    gas_ppm: Mapped[float] = mapped_column(Float)
    battery_voltage: Mapped[float] = mapped_column(Float, default=3.3)

    bin: Mapped["Bin"] = relationship(back_populates="readings")


class CollectionLog(Base):
    __tablename__ = "collection_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bin_id: Mapped[int] = mapped_column(Integer, ForeignKey("bins.id"), index=True)
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    fill_at_collection: Mapped[float] = mapped_column(Float)
    weight_at_collection: Mapped[float | None] = mapped_column(Float, nullable=True)
    collected_by: Mapped[str | None] = mapped_column(String(80), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    photo_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class BinEvent(Base):
    """Admin-scheduled load events (exam week, concert) that multiply expected fill rate during the window."""
    __tablename__ = "bin_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bin_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("bins.id"), nullable=True)  # null = fleet-wide
    label: Mapped[str] = mapped_column(String(100))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    fill_rate_multiplier: Mapped[float] = mapped_column(Float, default=1.5)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class Anomaly(Base):
    """Detected anomalies: stuck sensor, sudden spike, dead node, low battery, tampering, gas hazard."""
    __tablename__ = "anomalies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bin_id: Mapped[int] = mapped_column(Integer, ForeignKey("bins.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    severity: Mapped[str] = mapped_column(String(16), default="warning")
    message: Mapped[str] = mapped_column(String(255))
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)  # null for OAuth-only users
    role: Mapped[str] = mapped_column(String(16), default="viewer")  # admin, driver, viewer
    full_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    auth_provider: Mapped[str] = mapped_column(String(16), default="local")  # local | google
    google_sub: Mapped[str | None] = mapped_column(String(128), unique=True, index=True, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
