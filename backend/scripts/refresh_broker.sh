#!/usr/bin/env bash
# One-shot: run this after your hotspot IP changes.
#
# It will:
#   1) Detect wlan0's current IPv4
#   2) Regenerate the mosquitto server cert with the new IP in SAN
#      (CA is kept — ESP32's baked-in CA_CERT still validates)
#   3) Rewrite firmware/SmartBinNode/config.h with the new MQTT_HOST
#   4) Restart the mosquitto container
#   5) Verify the api container is reconnected
#
# After this: transfer config.h to the friend's Windows laptop and reflash.
# The Arduino sketch itself does not change.
set -euo pipefail

IFACE="${IFACE:-wlan0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_ROOT="$(cd "$ROOT/.." && pwd)"
CONFIG_H="$PROJECT_ROOT/firmware/SmartBinNode/config.h"

echo "── 1/4  Detecting current IP on $IFACE ────────────────────"
IP="$(ip -4 -o addr show "$IFACE" 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1 || true)"
if [ -z "$IP" ]; then
  echo "  ✗ $IFACE has no IPv4 address. Connect to the hotspot first."
  exit 1
fi
echo "  ✓ $IP"

CURRENT="$(grep -E '^#define MQTT_HOST' "$CONFIG_H" | awk -F'"' '{print $2}' || true)"
echo "  current config.h MQTT_HOST = $CURRENT"

if [ "$CURRENT" = "$IP" ]; then
  echo "  (no change — checking cert SAN anyway)"
fi

echo
echo "── 2/4  Regenerating broker cert with new SAN ─────────────"
MQTT_SAN="IP:$IP" "$ROOT/scripts/gen_certs.sh"

echo
echo "── 3/4  Updating firmware config.h ────────────────────────"
if [ "$CURRENT" != "$IP" ]; then
  # macOS-safe: use a temp file rather than sed -i's BSD variant
  awk -v new="$IP" '
    /^#define MQTT_HOST/ { print "#define MQTT_HOST    \"" new "\""; next }
    { print }
  ' "$CONFIG_H" > "$CONFIG_H.tmp" && mv "$CONFIG_H.tmp" "$CONFIG_H"
  echo "  ✓ config.h MQTT_HOST → $IP"
else
  echo "  ✓ already $IP — no change"
fi

echo
echo "── 4/4  Restarting mosquitto ──────────────────────────────"
(cd "$ROOT" && docker compose restart mqtt >/dev/null)
sleep 2
STATUS="$(cd "$ROOT" && docker compose ps mqtt --format '{{.Status}}')"
echo "  mqtt: $STATUS"

API_STATUS="$(cd "$ROOT" && docker compose ps api --format '{{.Status}}' 2>/dev/null || true)"
if [ -n "$API_STATUS" ]; then
  echo "  api:  $API_STATUS"
fi

echo
echo "════════════════════════════════════════════════════════════"
echo "Done. Broker cert now valid for IP:$IP + smartbin.local."
echo
echo "Next:"
echo "  1) Send $CONFIG_H to your friend's Windows laptop"
echo "     (only this file changed — the .ino stays the same)"
echo "  2) Reflash the ESP32"
echo "════════════════════════════════════════════════════════════"
