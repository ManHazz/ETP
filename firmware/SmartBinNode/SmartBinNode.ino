// ────────────────────────────────────────────────────────────────
//  SmartBin ESP32 node — reference firmware
//
//  Publishes sensor telemetry to the SmartBin backend broker.
//
//  Matches the backend contract in:
//    - backend/app/schemas.py::MqttSensorPayload
//    - backend/mosquitto/mosquitto.conf  (TLS on 8883, auth required)
//    - backend/mosquitto/acl             (device may only write to
//                                         smartbin/<username>/telemetry)
//
//  Board       : ESP32 DevKit
//  Sensors     : HX711 + 4 load cells, HC-SR04, MQ135, optional VBAT
//  MQTT client : knolleary/PubSubClient  (works over TLS via
//                WiFiClientSecure — CA cert baked in config.h)
//  JSON        : bblanchon/ArduinoJson
//
//  Why we swapped fields:
//    weight     → weight_kg
//    fill_level → fill_percentage (+ raw distance_cm)
//    odor       → gas_adc (+ human air_quality tag)
//    (new)      → bin_id  (needed to route to a Bin row)
//    (new)      → battery_voltage (drives low-battery anomalies)
//
//  Change log vs the original howardchai0401 sketch:
//    - Topic is now smartbin/<DEVICE_ID>/telemetry (ACL requires it)
//    - Payload renamed to match backend schema
//    - TLS + auth using WiFiClientSecure + CA cert
//    - client.loop() is actually called (bug in original)
//    - Non-blocking reconnect so the sensor bus keeps reading
//    - Optional battery-voltage read
// ────────────────────────────────────────────────────────────────

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "HX711.h"

#include "config.h"

// ── MQTT identity — derived from MAC address at boot ────────────
// Same firmware runs on every ESP32. Its identity is the last 6 hex
// digits of the WiFi MAC, prefixed "ESP-", e.g. "ESP-A1B2C3". The
// backend auto-registers unknown IDs as pending bins for admins to
// claim in the UI — no per-device config or provisioning needed.
static char DEVICE_ID[16];
static char MQTT_TOPIC[48];
static char MQTT_CLIENT_ID[24];

static void derive_device_id() {
  uint64_t mac = ESP.getEfuseMac();  // stable per-chip
  // Take the low 3 bytes (6 hex chars) — collisions across a handful of
  // devices are astronomically unlikely.
  snprintf(DEVICE_ID, sizeof(DEVICE_ID), "ESP-%02X%02X%02X",
           (uint8_t)(mac >> 16), (uint8_t)(mac >> 8), (uint8_t)mac);
  snprintf(MQTT_TOPIC, sizeof(MQTT_TOPIC), "smartbin/%s/telemetry", DEVICE_ID);
  snprintf(MQTT_CLIENT_ID, sizeof(MQTT_CLIENT_ID), "esp32-%s", DEVICE_ID);
}

// ── Network + MQTT clients ──────────────────────────────────────
#if MQTT_USE_TLS
WiFiClientSecure netClient;
#else
WiFiClient netClient;
#endif
PubSubClient mqtt(netClient);

// ── Sensors ─────────────────────────────────────────────────────
HX711 scale;
float weight_kg = 0.0f;
float distance_cm = 0.0f;
float fill_percentage = 0.0f;
int   gas_adc = 0;
float battery_voltage = 0.0f;

// ── State ───────────────────────────────────────────────────────
unsigned long last_publish_ms = 0;
unsigned long last_reconnect_attempt_ms = 0;

// ────────────────────────────────────────────────────────────────
//  Wi-Fi
// ────────────────────────────────────────────────────────────────

static void wifi_begin() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("[wifi] connecting to %s", WIFI_SSID);

  // We block up to 20 s on the initial connect. After that, WiFi's
  // built-in auto-reconnect handles drops in the background.
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    delay(400);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] connected, ip=%s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("[wifi] initial connect failed — will retry in background");
  }
}

// ────────────────────────────────────────────────────────────────
//  MQTT (non-blocking reconnect)
// ────────────────────────────────────────────────────────────────

static bool mqtt_try_reconnect() {
  if (mqtt.connected()) return true;

  // Rate-limit attempts to once every 5 s so the sensor bus keeps running.
  unsigned long now = millis();
  if (now - last_reconnect_attempt_ms < 5000) return false;
  last_reconnect_attempt_ms = now;

  Serial.printf("[mqtt] connecting to %s:%d as user=%s ... ",
                MQTT_HOST, MQTT_PORT, MQTT_USER);
  bool ok = mqtt.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS);
  if (ok) {
    Serial.println("connected");
  } else {
    Serial.printf("failed (state=%d)\n", mqtt.state());
  }
  return ok;
}

// ────────────────────────────────────────────────────────────────
//  Sensors
// ────────────────────────────────────────────────────────────────

static void read_weight() {
  if (!scale.is_ready()) return;
  float w = scale.get_units(20);        // 20 samples — 20× faster than 100
  if (w < 0.02f) w = 0.0f;               // dead-band
  if (w > 60.0f)  w = 60.0f;             // sanity cap
  weight_kg = w;
}

static void read_ultrasonic() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(5);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) {
    Serial.println("[ultrasonic] timeout");
    return;
  }
  distance_cm = duration * 0.0343f / 2.0f;

  // Map ToF distance to a 0–100 fill percentage.
  float f = ((EMPTY_DISTANCE_CM - distance_cm) /
             (EMPTY_DISTANCE_CM - FULL_DISTANCE_CM)) * 100.0f;
  if (f < 0.0f)   f = 0.0f;
  if (f > 100.0f) f = 100.0f;
  fill_percentage = f;
}

static void read_gas() {
  gas_adc = analogRead(MQ135_PIN);
}

static void read_battery() {
#if BATTERY_ENABLED
  // Multi-sample average to smooth ADC noise.
  const int N = 16;
  uint32_t acc = 0;
  for (int i = 0; i < N; i++) acc += analogRead(BAT_PIN);
  float raw = (float)acc / N;
  battery_voltage = (raw / BAT_ADC_MAX) * BAT_ADC_REF_V * BAT_DIVIDER_RATIO;
#else
  battery_voltage = 3.3f;   // sensible default; backend treats as "OK"
#endif
}

// ────────────────────────────────────────────────────────────────
//  Human-readable tags matching the backend's optional fields
// ────────────────────────────────────────────────────────────────

static const char* bin_status_from_fill(float f) {
  if (f >= 80.0f) return "CRITICAL";
  if (f >= 50.0f) return "MEDIUM";
  return "LOW";
}

static const char* air_quality_from_gas(int adc) {
  // MQ135 raw ADC. Same thresholds the backend fusion engine uses.
  if (adc > 300) return "Hazard";
  if (adc > 200) return "Poor";
  if (adc > 150) return "Fair";
  return "Clean";
}

// ────────────────────────────────────────────────────────────────
//  Publish
// ────────────────────────────────────────────────────────────────

static void publish_payload() {
  // Build the JSON that backend/app/schemas.py::MqttSensorPayload expects.
  StaticJsonDocument<256> doc;
  doc["bin_id"]          = DEVICE_ID;
  doc["distance_cm"]     = round(distance_cm * 10) / 10.0;
  doc["fill_percentage"] = round(fill_percentage * 10) / 10.0;
  doc["bin_status"]      = bin_status_from_fill(fill_percentage);
  doc["gas_adc"]         = gas_adc;
  doc["air_quality"]     = air_quality_from_gas(gas_adc);
  doc["weight_kg"]       = round(weight_kg * 1000) / 1000.0;
  doc["battery_voltage"] = round(battery_voltage * 100) / 100.0;

  char buf[256];
  size_t n = serializeJson(doc, buf, sizeof(buf));

  Serial.print("[mqtt] publish ");
  Serial.print(MQTT_TOPIC);
  Serial.print(' ');
  Serial.println(buf);

  // PubSubClient only supports QoS 0 publish. That's fine at a 10 s
  // cadence; if you need QoS 1 later, swap in 256dpi/arduino-mqtt.
  if (!mqtt.publish(MQTT_TOPIC, (const uint8_t*)buf, n, /*retained=*/false)) {
    Serial.printf("[mqtt] publish failed (state=%d)\n", mqtt.state());
  }
}

// ────────────────────────────────────────────────────────────────
//  Setup / loop
// ────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println("── SmartBin node booting ──");
  derive_device_id();
  Serial.printf("device_id=%s topic=%s\n", DEVICE_ID, MQTT_TOPIC);

  // HX711
  scale.begin(HX_DT, HX_SCK);
  delay(1500);                       // let the amp settle
  scale.set_scale(HX_CALIBRATION);
  scale.tare(20);

  // Ultrasonic
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // MQ135 — needs several minutes of warm-up before readings are meaningful.
  pinMode(MQ135_PIN, INPUT);

#if BATTERY_ENABLED
  analogReadResolution(12);
  analogSetPinAttenuation(BAT_PIN, ADC_11db);
#endif

  wifi_begin();

#if MQTT_USE_TLS
  netClient.setCACert(CA_CERT);
  // Uncomment during first-boot troubleshooting only:
  // netClient.setInsecure();
#endif

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(384);           // room for our JSON payload
  mqtt.setKeepAlive(45);
  // Non-blocking: we call mqtt_try_reconnect() from loop() below.

  Serial.println("[boot] ready");
}

void loop() {
  // Keep MQTT alive; retry connection in the background if dropped.
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqtt.connected()) {
      mqtt_try_reconnect();
    }
    mqtt.loop();
  }

  // Sensors run every iteration — no blocking on network state.
  read_weight();
  read_ultrasonic();
  read_gas();
  read_battery();

  unsigned long now = millis();
  if (now - last_publish_ms >= PUBLISH_INTERVAL_MS) {
    last_publish_ms = now;
    if (mqtt.connected()) {
      publish_payload();
    } else {
      // Print locally so operators can debug during commissioning.
      Serial.printf(
        "[local] fill=%.1f%% raw=%.1fcm w=%.2fkg gas=%d bat=%.2fV\n",
        fill_percentage, distance_cm, weight_kg, gas_adc, battery_voltage);
    }
  }

  delay(50);
}
