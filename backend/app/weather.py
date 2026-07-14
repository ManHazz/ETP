"""
Weather adjustment via Open-Meteo (open source, no API key, free).
https://open-meteo.com/en/docs

Behaviour is deliberately best-effort: if the API is unreachable, the caller
gets a neutral multiplier of 1.0 and predictions still work.
"""

import logging
import time
from dataclasses import dataclass

import httpx

log = logging.getLogger("smartbin.weather")

_URL = "https://api.open-meteo.com/v1/forecast"
_CACHE_TTL_SEC = 900  # 15 min — weather doesn't move that fast

# Very simple in-process cache keyed by rounded lat/lng.
_cache: dict[tuple[float, float], tuple[float, "WeatherSnapshot"]] = {}


@dataclass
class WeatherSnapshot:
    temp_c: float | None
    precipitation_mm: float | None
    weather_code: int | None
    fill_multiplier: float           # multiply expected fill rate
    gas_multiplier: float            # multiply expected gas readings
    summary: str

    def to_dict(self) -> dict:
        return {
            "temp_c": self.temp_c,
            "precipitation_mm": self.precipitation_mm,
            "weather_code": self.weather_code,
            "fill_multiplier": self.fill_multiplier,
            "gas_multiplier": self.gas_multiplier,
            "summary": self.summary,
        }


def _round(v: float, ndigits: int = 2) -> float:
    return round(float(v), ndigits)


def get_weather(lat: float, lng: float) -> WeatherSnapshot:
    key = (_round(lat), _round(lng))
    now = time.time()
    cached = _cache.get(key)
    if cached and now - cached[0] < _CACHE_TTL_SEC:
        return cached[1]

    snap = _fetch(key[0], key[1])
    _cache[key] = (now, snap)
    return snap


def _fetch(lat: float, lng: float) -> WeatherSnapshot:
    try:
        r = httpx.get(
            _URL,
            params={
                "latitude": lat,
                "longitude": lng,
                "current": "temperature_2m,precipitation,weather_code",
                "timezone": "auto",
            },
            timeout=4.0,
        )
        r.raise_for_status()
        j = r.json().get("current", {})
        temp = j.get("temperature_2m")
        precip = j.get("precipitation")
        code = j.get("weather_code")
    except Exception as exc:
        log.info("Open-Meteo lookup failed for %s,%s: %s", lat, lng, exc)
        return WeatherSnapshot(None, None, None, 1.0, 1.0, "weather unavailable")

    fill_mult = 1.0
    gas_mult = 1.0
    summary_parts: list[str] = []

    # Rain reduces outdoor foot-traffic → outdoor bins fill slower.
    if precip is not None:
        if precip >= 2.0:   fill_mult *= 0.65; summary_parts.append("heavy rain")
        elif precip >= 0.3: fill_mult *= 0.85; summary_parts.append("light rain")

    # Heat accelerates decomposition → more gas even at moderate fill.
    if temp is not None:
        if temp >= 35:      gas_mult *= 1.35; summary_parts.append("very hot")
        elif temp >= 30:    gas_mult *= 1.15; summary_parts.append("hot")
        elif temp <= 5:     gas_mult *= 0.85; summary_parts.append("cold")

    if not summary_parts:
        summary_parts.append("normal conditions")

    return WeatherSnapshot(
        temp_c=temp,
        precipitation_mm=precip,
        weather_code=code,
        fill_multiplier=round(fill_mult, 3),
        gas_multiplier=round(gas_mult, 3),
        summary=", ".join(summary_parts),
    )
