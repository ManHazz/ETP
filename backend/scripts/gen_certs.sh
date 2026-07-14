#!/usr/bin/env bash
# Generate a self-signed CA and broker cert for the MQTT listener.
#
# For production: replace certs/ca.crt + certs/server.{crt,key} with
# certificates issued by your PKI (Let's Encrypt, corporate CA, etc.).
# Only ca.crt needs to be distributed to ESP32 devices.
set -euo pipefail

CERT_DIR="$(cd "$(dirname "$0")/.." && pwd)/mosquitto/certs"
mkdir -p "$CERT_DIR"
cd "$CERT_DIR"

CN="${MQTT_CN:-smartbin.local}"
SAN_EXTRA="${MQTT_SAN:-}"  # e.g. "DNS:bins.example.com,IP:203.0.113.5"

if [[ ! -f ca.key ]]; then
  echo "→ Generating CA (10 year)…"
  openssl req -new -x509 -days 3650 -extensions v3_ca \
    -keyout ca.key -out ca.crt \
    -subj "/CN=SmartBin Root CA" -nodes >/dev/null 2>&1
  chmod 600 ca.key
  echo "  ✓ ca.crt / ca.key"
else
  echo "→ CA already exists, keeping it."
fi

echo "→ Generating broker cert for CN=$CN (825 day)…"
openssl genrsa -out server.key 2048 >/dev/null 2>&1
openssl req -new -key server.key -out server.csr \
  -subj "/CN=$CN" >/dev/null 2>&1

SAN="DNS:$CN,DNS:localhost,DNS:mqtt,IP:127.0.0.1"
if [[ -n "$SAN_EXTRA" ]]; then
  SAN="$SAN,$SAN_EXTRA"
fi
cat > server.ext <<EOF
subjectAltName = $SAN
extendedKeyUsage = serverAuth
EOF

openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 825 -extfile server.ext >/dev/null 2>&1
rm -f server.csr server.ext ca.srl

# Mosquitto in the container runs as uid 1883, not your host uid, so a
# `chmod 600` server.key locks the container out and the TLS listener
# fails with "Permission denied". 644 is acceptable for a dev cert on a
# repo-local bind mount; in production, either chown the key to 1883
# or use a named docker volume with the correct ownership.
chmod 644 ca.crt server.crt server.key

echo
echo "✓ Certs written to $CERT_DIR"
echo "   CA (distribute to every ESP32):  $CERT_DIR/ca.crt"
echo "   Broker cert:                     $CERT_DIR/server.crt"
echo "   Broker key (KEEP SECRET):        $CERT_DIR/server.key"
