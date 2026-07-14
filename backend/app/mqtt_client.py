"""
MQTT subscriber for ESP32 telemetry.

ESP32 nodes publish JSON messages of the form:

    {
        "bin_id": "BIN001",
        "distance_cm": 18,
        "fill_percentage": 38,
        "bin_status": "LOW",
        "gas_adc": 385,
        "air_quality": "Clean",
        "weight_kg": 0.95
    }

The device_id string (e.g. "BIN001") is resolved to a Bin row via the
`device_id` column; unknown devices are dropped with a warning.
"""

import json
import logging
import os
import ssl
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
from pydantic import ValidationError
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Bin, SensorReading
from app.schemas import MqttSensorPayload

log = logging.getLogger("smartbin.mqtt")

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME") or None
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD") or None
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "smartbin/+/telemetry")
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", "smartbin-api")
MQTT_QOS = int(os.getenv("MQTT_QOS", "1"))
MQTT_RECONNECT_MIN = int(os.getenv("MQTT_RECONNECT_MIN", "1"))
MQTT_RECONNECT_MAX = int(os.getenv("MQTT_RECONNECT_MAX", "60"))
MQTT_STATUS_TOPIC = os.getenv("MQTT_STATUS_TOPIC", "smartbin/api/status")

# ── TLS ────────────────────────────────────────────────────────
def _bool_env(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")

MQTT_TLS = _bool_env("MQTT_TLS", False)
MQTT_CA_CERT = os.getenv("MQTT_CA_CERT") or None
MQTT_CLIENT_CERT = os.getenv("MQTT_CLIENT_CERT") or None
MQTT_CLIENT_KEY = os.getenv("MQTT_CLIENT_KEY") or None
MQTT_TLS_INSECURE = _bool_env("MQTT_TLS_INSECURE", False)


def _on_connect(client, userdata, flags, reason_code, properties=None):
    if reason_code == 0:
        log.info("MQTT connected to %s:%s, subscribing to %s (qos=%s)", MQTT_BROKER, MQTT_PORT, MQTT_TOPIC, MQTT_QOS)
        # Re-subscribe on every (re)connect — clean sessions drop subs otherwise.
        client.subscribe(MQTT_TOPIC, qos=MQTT_QOS)
        # Announce liveness; last-will (set in build_client) publishes "offline" on drop.
        client.publish(MQTT_STATUS_TOPIC, payload="online", qos=1, retain=True)
    else:
        log.error("MQTT connect failed (reason=%s); paho will retry", reason_code)


def _on_message(client, userdata, msg):
    try:
        raw = json.loads(msg.payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        log.warning("Bad MQTT payload on %s: %s", msg.topic, e)
        return

    try:
        payload = MqttSensorPayload(**raw)
    except ValidationError as e:
        log.warning("MQTT payload failed validation on %s: %s", msg.topic, e)
        return

    with SessionLocal() as db:
        bin = db.scalars(select(Bin).where(Bin.device_id == payload.bin_id)).first()
        if not bin:
            # Auto-register as a pending bin so admin can claim it in the UI.
            # active=False keeps it out of the main list until claimed; pending=True
            # surfaces it in the "Unclaimed devices" panel.
            log.info("Auto-registering pending device %s", payload.bin_id)
            bin = Bin(
                device_id=payload.bin_id,
                label=f"New device {payload.bin_id}",
                latitude=0.0,
                longitude=0.0,
                capacity_liters=120.0,
                category="other",
                soft_threshold_pct=40.0,
                active=False,
                pending=True,
            )
            db.add(bin); db.commit(); db.refresh(bin)

        reading = SensorReading(
            bin_id=bin.id,
            fill_level_pct=payload.fill_percentage,
            weight_kg=payload.weight_kg,
            gas_ppm=payload.gas_adc,
            battery_voltage=payload.battery_voltage if payload.battery_voltage is not None else 3.3,
            timestamp=datetime.now(timezone.utc),
        )
        db.add(reading)
        db.commit()
        # Weight near-zero after prior readings = collection just happened.
        # Close any open anomalies so operators don't stare at stale alerts.
        try:
            from app import anomaly as anomaly_engine
            anomaly_engine.auto_close_on_empty(db, bin.id, payload.weight_kg)
        except Exception as exc:
            log.debug("auto_close_on_empty failed: %s", exc)
        log.debug("Stored reading for %s (bin %s): fill=%.1f%%", payload.bin_id, bin.id, payload.fill_percentage)


def _on_disconnect(client, userdata, disconnect_flags, reason_code, properties=None):
    log.warning("MQTT disconnected (reason=%s); paho will auto-reconnect", reason_code)


def build_client() -> mqtt.Client:
    client = mqtt.Client(
        client_id=MQTT_CLIENT_ID,
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
    )
    if MQTT_USERNAME:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    if MQTT_TLS:
        # If the configured CA path doesn't exist (e.g. running on Render
        # against a public broker like HiveMQ), fall back to the system
        # trust store by passing ca_certs=None.
        ca_path = MQTT_CA_CERT if MQTT_CA_CERT and os.path.exists(MQTT_CA_CERT) else None
        if MQTT_CA_CERT and ca_path is None:
            log.warning("MQTT_CA_CERT %s not found — falling back to system CA", MQTT_CA_CERT)
        client.tls_set(
            ca_certs=ca_path,
            certfile=MQTT_CLIENT_CERT,
            keyfile=MQTT_CLIENT_KEY,
            tls_version=ssl.PROTOCOL_TLSv1_2,
        )
        if MQTT_TLS_INSECURE:
            # Only for local dev with self-signed certs and mismatched hostnames.
            log.warning("MQTT_TLS_INSECURE=true — hostname verification disabled")
            client.tls_insecure_set(True)
    # Retained "offline" gets published by the broker if we drop unexpectedly.
    client.will_set(MQTT_STATUS_TOPIC, payload="offline", qos=1, retain=True)
    # Exponential-ish backoff between reconnect attempts (paho retries forever).
    client.reconnect_delay_set(min_delay=MQTT_RECONNECT_MIN, max_delay=MQTT_RECONNECT_MAX)
    client.on_connect = _on_connect
    client.on_message = _on_message
    client.on_disconnect = _on_disconnect
    return client


def start(client: mqtt.Client) -> None:
    # connect_async + loop_start means startup never fails on broker-down;
    # paho keeps retrying in the background until the broker comes up.
    client.connect_async(MQTT_BROKER, MQTT_PORT, keepalive=60)
    client.loop_start()


def stop(client: mqtt.Client) -> None:
    try:
        client.publish(MQTT_STATUS_TOPIC, payload="offline", qos=1, retain=True)
    except Exception:
        pass
    client.loop_stop()
    try:
        client.disconnect()
    except Exception:
        pass
