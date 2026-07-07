# SmartBin — MQTT Security

## Threat model

Untrusted ESP32 nodes over an untrusted network. The broker sits between them
and the API. Attackers can sniff, replay, and impersonate on the wire and can
compromise a single device.

## Controls in place

| Concern | Control |
|---|---|
| Sniffing / MITM | TLS 1.2 on the public 8883 listener (`mosquitto/certs/`). |
| Anonymous access | `allow_anonymous false` in `mosquitto.conf`. |
| Credential storage | `mosquitto/passwd` (bcrypt via `mosquitto_passwd`). |
| Device impersonation | ACL: `pattern write smartbin/%u/telemetry` — a device can only publish to a topic matching its own username. |
| Lateral movement from a device | ACL denies `read` on all telemetry to devices; only the `api` user subscribes. |
| Broker downtime → data loss | Paho retries forever with 1–60 s backoff; QoS 1 gives at-least-once. |
| API downtime → stale dashboard | Last-will publishes `offline` to `smartbin/api/status` (retained). |
| Runaway / hostile payloads | `max_packet_size 4096`, `max_inflight_messages 40`, `max_queued_messages 1000`. |
| Secret leakage in git | `.gitignore` covers `passwd`, `*.key`, `.env.secrets`. |
| Server auth for devices | Devices trust `ca.crt`; hostname must match the broker cert SAN. |

## Deploying to a real environment (checklist)

- [ ] Run `./scripts/bootstrap.sh` on the target host (generates certs, seeds credentials).
- [ ] Replace `mosquitto/certs/*` with certs from your PKI (Let's Encrypt via a domain, or corporate CA). Only `ca.crt` is distributed to ESP32s.
- [ ] Re-run `./scripts/add_device.sh <BIN_ID>` for every real device and record the credentials into your device provisioning system (not a spreadsheet).
- [ ] Ensure `.env.secrets` mode is `600` (bootstrap sets it via `umask 077`).
- [ ] Remove the plaintext `listener 1883` block from `mosquitto.conf` if any device connects from outside the docker network. Inside compose it stays private, so it's fine as-is.
- [ ] Firewall: expose only 8883 (broker) and 8000/443 (API). Do NOT expose 1883 or 5432 to the internet.
- [ ] Enable `MQTT_TLS_INSECURE=false` (default) — never enable this in production.
- [ ] For high-value deployments, uncomment `require_certificate true` + `use_identity_as_username true` in `mosquitto.conf` and provision per-device client certs instead of passwords (mutual TLS).
- [ ] Set up a log shipper on `smartbin_mqtt_log` and alert on `Client <id> disconnected due to malformed packet` and `AUTH failed` lines.

## Rotating a device credential

```bash
./scripts/add_device.sh BIN001                 # generates a new random password
docker compose restart mqtt                    # reload passwd file
```

## Revoking a device

Edit `mosquitto/passwd` and delete the line for that device, then
`docker compose restart mqtt`. The device's TLS connection will still succeed
(same CA) but auth will fail.
