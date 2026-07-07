#!/usr/bin/env bash
# Provision an ESP32 device credential.
#
# Usage:
#   ./scripts/add_device.sh BIN001                 # generate random password
#   ./scripts/add_device.sh BIN001 <password>      # use given password
#
# Writes/updates the mosquitto password file and prints the credentials
# to flash onto the ESP32. Username = device_id so ACLs can enforce
# per-device topic ownership via the %u pattern.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <device_id> [password]" >&2
  exit 1
fi

DEVICE_ID="$1"
PASSWORD="${2:-$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-24)}"

PASSWD_FILE="$(cd "$(dirname "$0")/.." && pwd)/mosquitto/passwd"
mkdir -p "$(dirname "$PASSWD_FILE")"
touch "$PASSWD_FILE"

# mosquitto_passwd -b writes/updates the entry non-interactively.
# We run it inside a throwaway mosquitto container so we don't
# require the tool on the host.
docker run --rm \
  -v "$PASSWD_FILE":/tmp/passwd \
  eclipse-mosquitto:2 \
  mosquitto_passwd -b /tmp/passwd "$DEVICE_ID" "$PASSWORD" >/dev/null

echo "✓ Provisioned device"
echo "   device_id: $DEVICE_ID"
echo "   password:  $PASSWORD"
echo
echo "Flash the ESP32 with:"
echo "   MQTT_HOST=<broker-host>"
echo "   MQTT_PORT=8883"
echo "   MQTT_USER=$DEVICE_ID"
echo "   MQTT_PASS=$PASSWORD"
echo "   MQTT_TOPIC=smartbin/$DEVICE_ID/telemetry"
echo "   MQTT_CA_CERT=<contents of mosquitto/certs/ca.crt>"
