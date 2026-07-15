from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import BIN_CATEGORIES


# ── Bins ──────────────────────────────────────────────

class BinCreate(BaseModel):
    label: str = Field(examples=["Cafeteria Block A"])
    latitude: float = Field(examples=[4.5985])
    longitude: float = Field(examples=[101.0901])
    # 0 = ground floor, 1/2/3 etc for upper floors. Only matters for indoor
    # deployments; outdoor bins can leave it at 0.
    floor: int = Field(default=0)
    capacity_liters: float = Field(default=120.0)
    category: str = Field(default="other")
    soft_threshold_pct: float = Field(default=40.0, ge=0, le=100)
    description: str | None = None
    device_id: str | None = Field(default=None, examples=["BIN001"])

    @field_validator("category")
    @classmethod
    def _cat(cls, v):
        if v not in BIN_CATEGORIES:
            raise ValueError(f"category must be one of {BIN_CATEGORIES}")
        return v


class BinResponse(BinCreate):
    id: int
    active: bool = True
    pending: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class BinClaimRequest(BaseModel):
    """Turn a pending device into a real bin: give it a name + location."""
    label: str = Field(min_length=1, max_length=100)
    latitude: float
    longitude: float
    floor: int = Field(default=0)
    capacity_liters: float = Field(default=120.0)
    category: str = Field(default="other")
    soft_threshold_pct: float = Field(default=40.0, ge=0, le=100)
    description: str | None = None

    @field_validator("category")
    @classmethod
    def _cat(cls, v):
        if v not in BIN_CATEGORIES:
            raise ValueError(f"category must be one of {BIN_CATEGORIES}")
        return v


class BinStatus(BaseModel):
    id: int
    label: str
    latitude: float
    longitude: float
    floor: int = 0
    capacity_liters: float
    category: str = "other"
    soft_threshold_pct: float = 40.0
    fill_level_pct: float | None = None
    weight_kg: float | None = None
    gas_ppm: float | None = None
    battery_voltage: float | None = None
    effective_fill: float | None = None
    last_reading_at: datetime | None = None
    is_dead: bool = False


# ── Sensor Readings ───────────────────────────────────

class SensorPayload(BaseModel):
    bin_id: int
    fill_level_pct: float = Field(ge=0, le=100)
    weight_kg: float = Field(ge=0)
    gas_ppm: float = Field(ge=0)
    battery_voltage: float = Field(default=3.3, ge=0, le=5.0)
    timestamp: datetime | None = None


class MqttSensorPayload(BaseModel):
    bin_id: str = Field(examples=["BIN001"])
    distance_cm: float = Field(ge=0)
    fill_percentage: float = Field(ge=0, le=100)
    bin_status: str | None = None
    gas_adc: float = Field(ge=0)
    air_quality: str | None = None
    weight_kg: float = Field(ge=0)
    battery_voltage: float | None = Field(default=None, ge=0, le=5.0)


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
    weight_at_collection: float | None = None
    collected_by: str | None = None
    lat: float | None = None
    lng: float | None = None
    photo_path: str | None = None
    notes: str | None = None


class CollectionResponse(CollectionCreate):
    id: int
    collected_at: datetime

    model_config = {"from_attributes": True}


# ── Bin Events ────────────────────────────────────────

class BinEventCreate(BaseModel):
    bin_id: int | None = None  # null = applies to all
    label: str
    starts_at: datetime
    ends_at: datetime
    fill_rate_multiplier: float = Field(default=1.5, gt=0)
    notes: str | None = None


class BinEventResponse(BinEventCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Anomalies ─────────────────────────────────────────

class AnomalyResponse(BaseModel):
    id: int
    bin_id: int
    kind: str
    severity: str
    message: str
    detected_at: datetime
    resolved_at: datetime | None = None

    model_config = {"from_attributes": True}


# ── Auth ──────────────────────────────────────────────

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    email: str | None = None
    full_name: str | None = None
    avatar_url: str | None = None
    auth_provider: str = "local"


class UserResponse(BaseModel):
    id: int
    username: str
    email: str | None = None
    role: str
    full_name: str | None = None
    avatar_url: str | None = None
    auth_provider: str = "local"
    active: bool

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "viewer"
    full_name: str | None = None
    email: EmailStr | None = None


class RegisterRequest(BaseModel):
    """Self-service signup (creates a viewer account)."""
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=120)


class GoogleAuthRequest(BaseModel):
    credential: str = Field(description="Google ID token from Google Identity Services")


class AuthConfigResponse(BaseModel):
    """Public bits the login page needs to render the right options."""
    google_enabled: bool
    google_client_id: str | None = None
    allow_registration: bool = True
