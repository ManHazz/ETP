# SmartBin ESP32 firmware

Reference firmware for the SmartBin waste-monitoring node. Publishes
telemetry over MQTT (TLS) to the backend broker in
`backend/mosquitto/`.

The sketch is a corrected fork of the upstream
`howardchai0401/Smart-Waste-Bin` project — same hardware, different
network contract so it lines up with our broker ACL and Pydantic
schema.

---

## Hardware

| Part | Notes |
|---|---|
| ESP32 DevKit (WROOM-32) | Any board with 12-bit ADC and WPA2 Wi-Fi |
| HX711 amplifier + 4 × 50 kg load cells | Weight sensing under the bin plate |
| HC-SR04 ultrasonic | Fill level from lid to top of waste |
| MQ135 gas sensor | Analog output on `MQ135_PIN` (default GPIO 34) |
| 100 kΩ / 100 kΩ voltage divider (optional) | Battery voltage on GPIO 35 |

Default GPIO map (change in `config.h` if your wiring differs):

```
HX711 DT   → GPIO 4
HX711 SCK  → GPIO 2
HC-SR04 TRIG → GPIO 5
HC-SR04 ECHO → GPIO 18
MQ135 AOUT → GPIO 34
VBAT/2     → GPIO 35
```

---

## Arduino library dependencies

Install these from the Arduino Library Manager (Tools → Manage
Libraries) or `arduino-cli lib install`:

| Library | Author | Tested version |
|---|---|---|
| `WiFi` | Espressif (bundled with ESP32 core) | — |
| `WiFiClientSecure` | Espressif (bundled with ESP32 core) | — |
| `PubSubClient` | knolleary | 2.8 |
| `ArduinoJson` | bblanchon | 7.1.0 |
| `HX711` | bogde | 0.7.5 |

Board support: install the **esp32 by Espressif Systems** package via
the Boards Manager (URL: `https://espressif.github.io/arduino-esp32/package_esp32_index.json`).

---

## Provisioning workflow

Every device needs its own MQTT username + password because the broker
ACL restricts each user to a topic derived from its username:

```
pattern write smartbin/%u/telemetry
```

### 1. Register the device with the broker

From the `backend/` directory on the host that runs Mosquitto:

```bash
./scripts/add_device.sh BIN001
```

The script prints something like:

```
✓ Provisioned device
   device_id: BIN001
   password:  A2n4-… (24 chars)

Flash the ESP32 with:
   MQTT_HOST=<broker-host>
   MQTT_PORT=8883
   MQTT_USER=BIN001
   MQTT_PASS=A2n4-…
   MQTT_TOPIC=smartbin/BIN001/telemetry
   MQTT_CA_CERT=<contents of mosquitto/certs/ca.crt>
```

Restart Mosquitto (or send `SIGHUP`) so the new credential is loaded:

```bash
docker compose restart mosquitto
```

### 2. Create the matching `Bin` row in the app

Open the admin console → **Bins → New**, and set:

- **Label** — human-friendly name (`Cafeteria Block A`).
- **Device ID** — must equal the string you just provisioned (`BIN001`).
- **Category**, **Capacity**, **Lat/Lng** — fill in as appropriate.

The backend refuses telemetry from any `bin_id` string it doesn't
recognise, so this step matters.

### 3. Configure the sketch

Copy `config.h` and edit the TODO lines:

```c
#define DEVICE_ID    "BIN001"
#define WIFI_SSID    "MyNetwork"
#define WIFI_PASS    "correct-horse-battery-staple"
#define MQTT_HOST    "smartbin.example.com"
#define MQTT_PORT    8883
#define MQTT_USE_TLS 1
#define MQTT_PASS    "A2n4-…"
```

Paste the full contents of `backend/mosquitto/certs/ca.crt` between
the raw-string delimiters at the bottom of `config.h`:

```c
static const char CA_CERT[] PROGMEM = R"CERT(
-----BEGIN CERTIFICATE-----
MIID… (many lines) …==
-----END CERTIFICATE-----
)CERT";
```

Include the `BEGIN` / `END` lines. Leave the outer `R"CERT( … )CERT"`
wrapper in place — it's a C++ raw-string literal so newlines in the PEM
are fine.

### 4. Flash

Open `SmartBinNode.ino` in the Arduino IDE:

- Board: **ESP32 Dev Module** (or your specific board)
- Flash Size: **4MB**, Partition Scheme: **Default**
- Upload Speed: **921600**

Click **Upload**. Watch the serial monitor at **115200 baud** —
you should see:

```
── SmartBin node booting ──
device_id=BIN001 topic=smartbin/BIN001/telemetry
[wifi] connecting to MyNetwork.....
[wifi] connected, ip=192.168.1.42
[mqtt] connecting to smartbin.example.com:8883 as user=BIN001 ... connected
[mqtt] publish smartbin/BIN001/telemetry {"bin_id":"BIN001","distance_cm":18.4,"fill_percentage":34.3,...}
```

Refresh the admin dashboard — the bin card should turn from grey ("no
data") to a live fill percentage within one publish interval.

---

## Calibration

### Ultrasonic (fill level)

Measure with the bin **empty** and record the reading printed on the
serial monitor as `raw`. Put a full/heavy load in the bin and record
that too. Set:

```c
#define EMPTY_DISTANCE_CM  28.0f   // reading when empty
#define FULL_DISTANCE_CM    2.0f   // reading when full
```

Fill percentage is then linearly interpolated between those two anchors
and clamped to 0–100.

### HX711 (weight)

The scale factor depends on the load cells + amplifier gain. From the
serial monitor, put a known weight (say a 5 kg dumbbell) on the plate
and read `w=`. Then:

```
new HX_CALIBRATION = current HX_CALIBRATION × (5.0 / w)
```

Flash, recheck, iterate. Once a known weight reads correctly, leave it.

### MQ135 (gas)

MQ135 needs **10–15 minutes of continuous power to warm up** before its
readings stabilise. Nothing to calibrate in code — the backend
compares raw ADC values to fixed thresholds (150 / 200 / 300) that
correspond to Clean / Fair / Poor / Hazard.

### Battery divider (optional)

If you use a divider ratio other than 2:1, update:

```c
#define BAT_DIVIDER_RATIO 2.0f
```

Set `BATTERY_ENABLED 0` if you're USB-powering during dev — otherwise
you'll get spurious low-battery anomalies.

---

## Field-mapping table

What the upstream `howardchai0401` sketch sent vs what our backend
expects (fixed in this fork):

| Upstream field | Our field | Change |
|---|---|---|
| `weight`             | `weight_kg`       | Renamed to match `MqttSensorPayload` |
| `fill_level`         | `fill_percentage` | Renamed |
| _(none)_             | `distance_cm`     | Added raw ToF — anomaly engine needs it |
| `odor`               | `gas_adc`         | Renamed; `air_quality` tag also sent |
| _(none)_             | `bin_id`          | Backend can't route a reading without it |
| _(none)_             | `battery_voltage` | Drives low-battery anomalies |
| topic: `smartbin/data` | `smartbin/<device_id>/telemetry` | Broker ACL requires per-device topic |
| plaintext MQTT 1883 | TLS MQTT 8883 | Broker rejects `allow_anonymous false` on plaintext |

---

## Troubleshooting

**`[mqtt] failed (state=-2)`** — TCP connect refused. Broker host/port
wrong, or firewall dropping 8883.

**`[mqtt] failed (state=5)`** — auth failure. Username / password
mismatch. Re-run `add_device.sh` and update `config.h`.

**`[mqtt] failed (state=4)`** — bad client id or protocol error. Almost
always means TLS handshake succeeded but the CA cert is stale — the
broker's server cert has been regenerated. Paste the current
`ca.crt` again.

**Publish succeeds, backend never sees it** — you're not writing to the
right topic. The topic **must** match the username (`BIN001` → `smartbin/BIN001/telemetry`). If they don't match, the broker
silently drops the publish because ACL denies it.

**Backend logs `unknown device_id`** — you provisioned the broker
credential but never created a matching `Bin` row with
`device_id=BIN001`. Fix in the admin UI.

**Everything connects but dashboard shows "no data"** — check that the
`Bin` row is `active=true` and that the sensor readings are actually
arriving (`/api/readings?bin_id=1&limit=5`).

---

## What the firmware does *not* do

- Subscribe to any downlink topics (no remote firmware updates, no
  commands from the backend). Add a subscribe callback if you need
  that.
- Deep sleep between publishes. Add `esp_deep_sleep()` in `loop()`
  if you're battery-powered and can tolerate publish gaps.
- Retry failed publishes. PubSubClient's QoS 0 is fire-and-forget;
  swap in `256dpi/arduino-mqtt` for QoS 1 if you need durability.
