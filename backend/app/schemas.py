from datetime import datetime
from pydantic import BaseModel, Field


# ── Bins ──────────────────────────────────────────────

class BinCreate(BaseModel):
    label: str = Field(examples=["Cafeteria Block A"])
    latitude: float = Field(examples=[4.5985])
    longitude: float = Field(examples=[101.0901])
    capacity_liters: float = Field(default=120.0)
    description: str | None = None
    device_id: str | None = Field(default=None, examples=["BIN001"])


class BinResponse(BinCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class BinStatus(BaseModel):
    """Current state of a bin (latest reading + metadata)."""
    id: int
    label: str
    latitude: float
    longitude: float
    capacity_liters: float
    fill_level_pct: float | None = None
    weight_kg: float | None = None
    gas_ppm: float | None = None
    battery_voltage: float | None = None
    effective_fill: float | None = None
    last_reading_at: datetime | None = None


# ── Sensor Readings ───────────────────────────────────

class SensorPayload(BaseModel):
    """What the ESP32 (or simulator) sends."""
    bin_id: int
    fill_level_pct: float = Field(ge=0, le=100)
    weight_kg: float = Field(ge=0)
    gas_ppm: float = Field(ge=0)
    battery_voltage: float = Field(default=3.3, ge=0, le=5.0)
    timestamp: datetime | None = None  # server fills if missing


class MqttSensorPayload(BaseModel):
    """Raw ESP32 payload received over MQTT."""
    bin_id: str = Field(examples=["BIN001"])
    distance_cm: float = Field(ge=0)
    fill_percentage: float = Field(ge=0, le=100)
    bin_status: str | None = None
    gas_adc: float = Field(ge=0)
    air_quality: str | None = None
    weight_kg: float = Field(ge=0)


class ReadingResponse(BaseModel):
    id: int
    bin_id: int
    timestamp: datetime
    fill_level_pct: float
    weight_kg: float
    gas_ppm: float
    battery_voltage: float

    model_config = {"from_attributes": True}


# ── Collection Logs ───────────────────────────────────

class CollectionCreate(BaseModel):
    bin_id: int
    fill_at_collection: float
    notes: str | None = None


class CollectionResponse(CollectionCreate):
    id: int
    collected_at: datetime

    model_config = {"from_attributes": True}
