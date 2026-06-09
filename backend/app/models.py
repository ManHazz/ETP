from datetime import datetime, timezone
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Bin(Base):
    """A physical smart bin deployed on campus."""

    __tablename__ = "bins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(String(100))  # e.g. "Cafeteria Block A"
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    capacity_liters: Mapped[float] = mapped_column(Float, default=120.0)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    readings: Mapped[list["SensorReading"]] = relationship(back_populates="bin")


class SensorReading(Base):
    """A single telemetry payload from a bin's sensor node."""

    __tablename__ = "sensor_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bin_id: Mapped[int] = mapped_column(Integer, ForeignKey("bins.id"))
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Sensor values
    fill_level_pct: Mapped[float] = mapped_column(Float)    # 0-100%, from ultrasonic
    weight_kg: Mapped[float] = mapped_column(Float)          # from HX711 load cells
    gas_ppm: Mapped[float] = mapped_column(Float)            # from MQ-135
    battery_voltage: Mapped[float] = mapped_column(Float, default=3.3)

    bin: Mapped["Bin"] = relationship(back_populates="readings")


class CollectionLog(Base):
    """Records when a bin was actually collected/emptied."""

    __tablename__ = "collection_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bin_id: Mapped[int] = mapped_column(Integer, ForeignKey("bins.id"))
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    fill_at_collection: Mapped[float] = mapped_column(Float)  # snapshot of fill %
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
