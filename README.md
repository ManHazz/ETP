# SmartBin — AI-powered Predictive Waste Management

Campus-scale IoT + ML system. ESP32 nodes on each bin publish sensor telemetry
over MQTT, a FastAPI backend ingests and stores it in TimescaleDB, fuses the
signals to predict overflow, and computes an OR-Tools optimized collection
route. A React dashboard polls the backend for live state, history, and route.

```
┌──────────┐   MQTT/TLS   ┌──────────┐   HTTP    ┌──────────┐
│  ESP32   │─────────────▶│ Mosquitto │──────────▶│ FastAPI  │
│  BIN001  │  8883        │  broker   │ subscribe │  :8000   │
└──────────┘              └──────────┘           └────┬─────┘
                                                      │ SQL
                                                      ▼
                                                ┌──────────┐
                                                │TimescaleDB│
                                                └────┬─────┘
                                                      │
                                                      │ /api/*  (poll)
                                                      ▼
                                                ┌──────────┐
                                                │  React   │
                                                │ dashboard│
                                                └──────────┘
```

Repo layout:

```
project/
├── backend/         FastAPI + MQTT subscriber + simulator + Mosquitto config
├── frontend/        React + Vite dashboard
└── .github/         CI/CD workflows
```

---

## HTTP endpoints

Mounted under `/api` (see `backend/app/main.py`, `backend/app/routes.py`).

| Method | Path | Purpose |
|---|---|---|
| GET    | `/health`             | Liveness probe |
| POST   | `/api/bins`           | Register a new bin (`device_id`, `label`, `latitude`, `longitude`, …) |
| GET    | `/api/bins`           | List bins |
| GET    | `/api/bins/{id}`      | One bin |
| DELETE | `/api/bins/{id}`      | Delete a bin |
| POST   | `/api/readings`       | Ingest a sensor payload over HTTP (used by simulator; ESP32s use MQTT) |
| GET    | `/api/readings/{id}`  | Recent readings for a bin, `?limit=` |
| GET    | `/api/status`         | Every bin with its latest reading + fused effective-fill score |
| POST   | `/api/collections`    | Log a bin-emptying event |
| GET    | `/api/predictions`    | Predicted time until each bin is full |
| GET    | `/api/route`          | Optimized truck route for bins near/above threshold |

Interactive Swagger UI at `/docs` when the API is running.

---

## MQTT ingestion

The subscriber lives in `backend/app/mqtt_client.py` and starts inside the
FastAPI lifespan.

**Topic pattern**

```
smartbin/{device_id}/telemetry     # e.g. smartbin/BIN001/telemetry
```

**Payload from the ESP32**

```json
{
    "bin_id":         "BIN001",
    "distance_cm":     18,
    "fill_percentage": 38,
    "bin_status":     "LOW",
    "gas_adc":         385,
    "air_quality":    "Clean",
    "weight_kg":       0.95
}
```

**Field mapping (ESP32 → DB `SensorReading`)**

| ESP32 field | Stored as | Notes |
|---|---|---|
| `bin_id` (string) | resolved to `Bin.id` via `Bin.device_id` | Unknown device_ids are dropped with a warning |
| `fill_percentage` | `fill_level_pct` | |
| `weight_kg`       | `weight_kg`      | |
| `gas_adc`         | `gas_ppm`        | Raw ADC value (fusion thresholds work on this scale) |
| `distance_cm`, `bin_status`, `air_quality` | not persisted | Derivable or duplicative |

**Delivery guarantees**

- QoS 1 (at-least-once) on subscribe
- paho reconnects forever with 1–60 s backoff
- Re-subscribes on every reconnect
- Retained Last-Will `smartbin/api/status` = `online`/`offline` for observability

---

## Security

Full details in [`backend/SECURITY.md`](backend/SECURITY.md). Summary:

- TLS 1.2 on the public 8883 listener; plaintext 1883 kept internal to the docker network.
- No anonymous access. Devices authenticate with per-device username/password (username == `device_id`).
- ACL enforces `smartbin/%u/telemetry` — a device can only publish to its own topic and cannot subscribe to anything.
- Broker limits: `max_packet_size 4096`, inflight/queue caps.
- Secrets (`passwd`, `*.key`, `.env.secrets`) are gitignored; provisioning writes with `umask 077`.

Bootstrap on any target host:

```bash
cd backend
./scripts/bootstrap.sh        # certs + api user + BIN001..BIN008 credentials
docker compose up -d
python -m simulator.sim --seed
```

Add a new real device later:

```bash
./scripts/add_device.sh BIN042
docker compose restart mqtt
# flash the ESP32 with the printed credentials + backend/mosquitto/certs/ca.crt
```

---

## Local development

Requires: Docker (Compose v2), Python 3.12, Node 20.

```bash
# 1. Provision certs + broker credentials
cd backend
cp .env.example .env
./scripts/bootstrap.sh

# 2. Start the stack
docker compose up -d          # TimescaleDB + Mosquitto (TLS) + FastAPI

# 3. Seed campus bins in the DB (device_ids BIN001..BIN008)
python -m simulator.sim --seed

# 4. Run the dashboard
cd ../frontend
npm install
npm run dev                   # http://localhost:5173
```

Simulate ESP32 telemetry (HTTP):

```bash
python -m simulator.sim --run
```

Publish a real MQTT test message (TLS):

```bash
mosquitto_pub -h localhost -p 8883 \
  --cafile backend/mosquitto/certs/ca.crt \
  -u BIN001 -P <password-from-bootstrap> \
  -t smartbin/BIN001/telemetry \
  -m '{"bin_id":"BIN001","distance_cm":18,"fill_percentage":38,"bin_status":"LOW","gas_adc":385,"air_quality":"Clean","weight_kg":0.95}'
```

---

## Git branches

Three long-lived branches:

| Branch    | Purpose                | Deploys to  | Merged from |
|-----------|------------------------|-------------|-------------|
| `dev`     | Active development     | Local only  | Feature branches / direct commits |
| `staging` | Pre-prod verification  | Staging env | PR from `dev` |
| `main`    | Production             | Prod env    | PR from `staging` |

Flow:

```
feature/xyz ──► dev ──► staging ──► main
                              │        │
                              │        └── image pushed to ghcr.io + prod deploy
                              └── verified against real-ish data
```

Rules of thumb:
- **Never commit directly to `main` or `staging`.** Open a PR.
- Bug hotfixes: branch from `main`, PR back into `main`, then merge `main` down into `staging` and `dev` to keep them aligned.
- Delete feature branches after merge.

Suggested branch protection (configure in GitHub → Settings → Branches):
- `main`: require PR, require CI to pass, require 1 review, no force-push.
- `staging`: require PR, require CI to pass.
- `dev`: allow direct pushes; CI must pass on push.

---

## CI/CD pipeline

Defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml). Runs on
every push and PR against `dev`/`staging`/`main`.

| Job              | Runs on                        | What it does |
|------------------|--------------------------------|--------------|
| `backend`        | every push / PR                | `pip install` + `compileall` + import smoke test on `app.*` |
| `frontend`       | every push / PR                | `npm ci` + `npm run build`; uploads `dist/` as an artefact |
| `compose-validate` | every push / PR              | `docker compose config` validates the compose file |
| `publish-image`  | push to `main` only            | Builds `backend/` and pushes `ghcr.io/<owner>/<repo>/api:{latest,sha}` |

Concurrency is gated per-ref so an in-flight run is cancelled when a newer
commit lands on the same branch.

### GHCR image

After the first successful `main` build, the backend image lives at:

```
ghcr.io/<owner>/<repo>/api:latest
ghcr.io/<owner>/<repo>/api:<sha>
```

By default GHCR packages are private. In GitHub → Packages → your image →
Package settings, set visibility to Public if you want ESP32s (or you) to pull
without a token, or generate a PAT with `read:packages` for the puller.

## Public deployment — Vercel + Render + Neon + HiveMQ (all free tiers)

This is the recommended path: zero-server, git-driven, and free.

```
             ┌────────────┐        ┌──────────────┐        ┌──────────┐
Browser ───▶ │  Vercel    │──/api──▶│  Render      │──────▶│  Neon    │
             │ (React SPA)│ rewrite│ (FastAPI :10000)│      │ Postgres │
             └────────────┘        └───────┬──────┘        └──────────┘
                                           │ MQTT/TLS 8883
                                           ▼
                                    ┌──────────────┐
ESP32s ────────── MQTT/TLS ─────────▶│  HiveMQ Cloud│
                                    │  Serverless  │
                                    └──────────────┘
```

Nothing you own runs 24/7. Vercel serves the SPA and rewrites `/api/*` to
Render so the frontend stays same-origin (no CORS). Render runs the API +
MQTT subscriber. Neon holds Postgres. HiveMQ is the always-on broker every
ESP32 connects to.

### One-time setup (about 20 minutes)

**1. Create a Neon Postgres project** at [neon.tech](https://neon.tech) →
new project → copy the connection string (looks like
`postgresql://user:pass@ep-xxxx.aws.neon.tech/neondb?sslmode=require`).

**2. Create a HiveMQ Cloud Serverless cluster** at
[hivemq.com/cloud](https://www.hivemq.com/cloud/) (free tier). Note the
broker host (e.g. `abc123.s1.eu.hivemq.cloud`) and port `8883`. In the
cluster's Access Management page:

- Create the `api` user (a random password) → this is what Render uses to subscribe.
- For each ESP32, create a user named `BIN001`, `BIN002`, … each with a random password.
- Add a permission for the api user: **subscribe** to `smartbin/+/telemetry`.
- Add a permission template for devices: **publish** to `smartbin/{{clientId}}/telemetry` — or hardcode one per device. Same effect as the ACL we run locally.

**3. Deploy the backend on Render** — push the repo to GitHub, then in
Render click **New → Blueprint → connect repo**. Render finds
`render.yaml`, prompts for the four "sync: false" secrets:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL`   | Neon connection string with `?sslmode=require` |
| `MQTT_BROKER`    | HiveMQ cluster hostname (no `mqtts://`, no port) |
| `MQTT_USERNAME`  | `api` |
| `MQTT_PASSWORD`  | password for the `api` user in HiveMQ |

Click Apply. Render builds `backend/Dockerfile` and starts the API. First
build takes a few minutes; subsequent deploys are auto-triggered on push.

**4. Seed the campus bins in the DB.** From your laptop, with the same
`DATABASE_URL`:

```bash
export DATABASE_URL='<neon connection string>'
cd backend
python -m simulator.sim --seed
```

**5. Deploy the frontend on Vercel** — click **Add New → Project → import
the repo → set Root Directory to `frontend`**. Vercel picks up
`vercel.json` automatically.

Before the first deploy, open `frontend/vercel.json` and replace
`smartbin-api.onrender.com` with the URL Render gave you. Commit + push, and
Vercel rebuilds.

**6. Keep Render awake.** Register the Render URL at
[uptimerobot.com](https://uptimerobot.com) (free) as an HTTP monitor on
`/health` with a 5-minute interval. This prevents the free-tier spin-down so
the MQTT subscriber stays connected.

**7. Flash each ESP32** with:

- Broker: `<hivemq-host>`, port `8883`, TLS on
- Username = its device ID (`BIN001`, `BIN002`, …), password from step 2
- Publish topic: `smartbin/<DEVICE_ID>/telemetry`
- No custom CA needed — HiveMQ uses a public Let's Encrypt cert, the
  ESP32's default root store trusts it. (On Arduino, `WiFiClientSecure` +
  `setCACert(letsencrypt_r3_pem)` or `setInsecure()` for a first test.)

Site is now live at your Vercel URL. ESP32s publish → HiveMQ → Render →
Neon → dashboard.

### Free-tier limits to be aware of

| Service | Free ceiling | What happens at the ceiling |
|---|---|---|
| Vercel        | 100 GB bandwidth / month | Slower or paid upgrade |
| Render        | 750 instance-hours / month, spins down after 15 min idle | UptimeRobot keeps it warm |
| Neon          | 3 GB storage, 191 compute-hours / month | Neon auto-suspends compute; wakes on query |
| HiveMQ Cloud  | 100 concurrent connections, 10 GB traffic / month | Refuses new device connections above 100 |
| UptimeRobot   | 50 monitors, 5-min interval | Fine forever for this |

### Security posture on this stack

| Concern | Control |
|---|---|
| Transport encryption | TLS 1.2 everywhere (Vercel → Render, HiveMQ → clients). No plaintext hops. |
| Device authentication | HiveMQ per-user password (same model as our local `mosquitto_passwd`). |
| Device authorization  | HiveMQ topic ACL: each device can only publish to `smartbin/<its-id>/telemetry`. |
| API authentication    | The API doesn't accept unsigned writes from the internet — the only ingest path is MQTT via HiveMQ, and HiveMQ authenticates every publisher. |
| Frontend headers      | Vercel injects HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, Referrer-Policy, Permissions-Policy. |
| Secrets in git        | `.env.secrets`, `mosquitto/passwd`, `*.key` gitignored. Cloud secrets live in Render/Vercel dashboards, never in the repo. |
| Reduced attack surface | No SSH, no host firewall, no cert renewal — the three providers own that. |

### Later releases

Push to `main` → Render + Vercel auto-deploy on their own webhooks. No SSH,
no GitHub deploy action needed for this path. The `.github/workflows/deploy.yml`
workflow only applies to the alternative VPS path below.

---

## Alternative: self-hosted VPS + auto-HTTPS

For anyone who wants full control (a real Raspberry Pi in the corner of the
lab, or a €4/mo Hetzner box), the repo also ships a self-hosted stack:
`backend/docker-compose.prod.yml` puts [Caddy](https://caddyserver.com) at
the edge with Let's Encrypt, serves the React SPA, reverse-proxies `/api/*`
to FastAPI, and runs a local Mosquitto broker with our per-device ACL.

**Architecture in production**

```
Internet ─┬─► :80  ─► Caddy ──► HTTP→HTTPS redirect
          ├─► :443 ─► Caddy ─┬─► /api/*  →  api:8000 (FastAPI)
          │                   └─► /*       →  static dist (React)
          └─► :8883 ─► Mosquitto (TLS, per-device auth + ACL)

Not exposed to the internet:
   :5432  Postgres  (docker internal only)
   :1883  MQTT plaintext  (docker internal only)
```

**One-time setup on the VPS**

```bash
# 1. Provision a small VPS (any provider). Point an A record at it,
#    e.g.  smartbin.example.com → 203.0.113.5

# 2. On the VPS
sudo apt install docker.io docker-compose-v2 git openssl -y
git clone https://github.com/ManHazz/ETP.git /opt/smartbin
cd /opt/smartbin/backend

# 3. Configure
cp .env.example .env
$EDITOR .env                 # set DOMAIN and POSTGRES_PASSWORD

# 4. Generate certs + credentials (writes .env.secrets, mosquitto/passwd)
./scripts/bootstrap.sh

# 5. Open firewall
sudo ufw allow 80,443,8883/tcp

# 6. Pull images and start the stack
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 7. Register the campus bins in the DB
python -m simulator.sim --seed
```

Site is now live at `https://<DOMAIN>` with a real Let's Encrypt cert. ESP32s
publish to `mqtts://<DOMAIN>:8883` using the CA at `mosquitto/certs/ca.crt`
plus the per-device credentials printed by `bootstrap.sh` and `add_device.sh`.

**Later releases (automatic via GitHub Actions)**

Configure the secrets in the GitHub repo (Settings → Secrets → Actions):

| Secret | Value |
|---|---|
| `SSH_HOST`    | VPS hostname or IP |
| `SSH_USER`    | login user (e.g. `deploy` or `root`) |
| `SSH_KEY`     | contents of the private key that user accepts |
| `DEPLOY_PATH` | absolute path where the repo is cloned (e.g. `/opt/smartbin`) |

Then trigger **Actions → Deploy → Run workflow** for a rolling release, or
uncomment the `workflow_run` block at the top of `.github/workflows/deploy.yml`
to auto-deploy after every green CI on `main`. The workflow fetches the
newest images from GHCR and restarts services in place.

**ESP32 client-side notes**

- Broker host: your `DOMAIN`, TLS on port `8883`.
- Trust anchor: contents of `backend/mosquitto/certs/ca.crt` (bake into
  the firmware as a PEM string).
- Username: the device ID (`BIN001`), password: from `add_device.sh` output.
- Topic: `smartbin/<DEVICE_ID>/telemetry`, payload as documented above.
- Publish with QoS 1 for at-least-once delivery; the API subscriber also
  uses QoS 1 so a brief restart doesn't drop the message.

### Firewall / security posture

| Port | Protocol | Exposed? | Notes |
|---|---|---|---|
| 80  | TCP | ✔ | Caddy — HTTP→HTTPS redirect + ACME HTTP-01 challenge |
| 443 | TCP+UDP | ✔ | Caddy — dashboard + `/api/*`, HTTP/2 + HTTP/3 |
| 8883 | TCP | ✔ | Mosquitto TLS 1.2, no anonymous, per-device ACL |
| 8000 | TCP | ✘ | FastAPI — only reachable via Caddy inside the docker network |
| 5432 | TCP | ✘ | Postgres — docker network only |
| 1883 | TCP | ✘ | Plaintext MQTT — docker network only |
| 22   | TCP | (up to you) | SSH — recommended to lock down to key-auth and known IPs |

Additional hardening baked in:
- Caddy sets HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff,
  Referrer-Policy strict-origin-when-cross-origin, a Permissions-Policy that
  denies mic/camera/geolocation, and a Content-Security-Policy scoped to
  self + the CARTO map tile CDN.
- Postgres password comes from `POSTGRES_PASSWORD` in `.env`, not defaulted.
- All broker + API secrets live in `.env.secrets` (mode 600, gitignored).

### Not GitHub?

The pipeline is a plain declarative graph — the equivalent GitLab CI file is
a straight translation (same jobs, `image:` per job, `docker login` against
`$CI_REGISTRY`). Ask if you want that.

---

## Project structure

```
project/
├── backend/
│   ├── app/
│   │   ├── main.py             FastAPI app + lifespan (starts MQTT client)
│   │   ├── routes.py           HTTP API
│   │   ├── models.py           SQLAlchemy models (Bin, SensorReading, CollectionLog)
│   │   ├── schemas.py          Pydantic request/response + MqttSensorPayload
│   │   ├── database.py         Engine + session
│   │   ├── fusion.py           Effective-fill scoring
│   │   ├── predictor.py        Time-until-full regression
│   │   ├── optimizer.py        OR-Tools VRP route
│   │   └── mqtt_client.py      paho subscriber (TLS + auth + reconnect)
│   ├── simulator/sim.py        Fake ESP32 for HTTP ingest
│   ├── mosquitto/
│   │   ├── mosquitto.conf      Broker config (no anon, ACL, TLS)
│   │   ├── acl                 Per-device topic ownership
│   │   ├── passwd              (gitignored) written by scripts/bootstrap.sh
│   │   └── certs/              (gitignored) CA + server cert
│   ├── scripts/
│   │   ├── gen_certs.sh
│   │   ├── add_device.sh
│   │   └── bootstrap.sh
│   ├── docker-compose.yml       (dev)
│   ├── docker-compose.prod.yml  (public / VPS)
│   ├── Caddyfile                (edge proxy + auto-HTTPS)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env.example
│   ├── SECURITY.md
│   └── README.md               (backend-specific notes)
├── frontend/
│   ├── src/                     React app
│   ├── Dockerfile               node build + Caddy image (self-hosted path)
│   ├── vercel.json              Vercel deploy config (cloud path)
│   ├── package.json
│   └── vite.config.js
├── .github/workflows/
│   ├── ci.yml                   backend + frontend build, publishes images
│   └── deploy.yml               manual/auto deploy to the VPS (alt path)
├── render.yaml                  Render Blueprint (cloud path)
├── .gitignore
└── README.md                    (this file)
```
