# SmartBin — AI-powered Predictive Waste Management

Campus-scale IoT system that turns dumb bins into a dispatch-aware fleet. ESP32
nodes publish sensor telemetry over MQTT, a FastAPI backend fuses the signals,
learns per-bin fill patterns, adjusts for weather + scheduled events, and — the
critical part — decides whether a truck should actually roll based on a
batching + hazard policy so you never dispatch for a single bin. A React PWA
dashboard drives it all.

**100% open-source, self-hostable stack** — no proprietary cloud services
required. Runs on a single VPS via `docker compose`.

| Layer     | Tech                                    | License      |
|-----------|-----------------------------------------|--------------|
| Web       | React 18 + Vite + Leaflet + service worker | MIT / BSD |
| API       | FastAPI + SQLAlchemy + Pydantic         | MIT / Apache |
| Predictor | Native Python (history + weather + events) | —         |
| Optimizer | Google OR-Tools (VRP)                   | Apache-2.0   |
| DB        | Postgres 16 + TimescaleDB               | PostgreSQL / Apache-2.0 |
| MQTT      | Eclipse Mosquitto                       | EPL/EDL      |
| Weather   | Open-Meteo (keyless, open-source)       | AGPL         |
| Map tiles | CARTO Voyager / OSM (free tier — self-host for full independence) | ODbL |
| Edge      | Caddy 2 with automatic Let's Encrypt   | Apache-2.0   |

## What's new in v0.3

- **Dispatch Decision Engine** — combines hard hazards (gas, overflow),
  batching threshold, and opportunistic top-up so a single 82% bin no longer
  triggers a truck run for one pickup.
- **Multi-signal predictor** — blends learned per-bin day-of-week × hour-of-day
  rates, category priors (cold-start), weather (Open-Meteo), and admin-defined
  events (exam week, festival). Returns confidence bands, not point estimates.
- **Anomaly engine** — background loop flags stuck sensors, sudden fill spikes,
  tamper events, gas hazards, low battery, and dead nodes. Auto-resolves when
  weight drops to zero (confirming a pickup happened).
- **JWT auth** — admin / driver / viewer roles gate destructive endpoints.
- **Collection proof** — collection logs support GPS + photo attachment; served
  through Caddy from a docker volume.
- **Fully open-source path** — same repo also has Vercel/Render/Neon/HiveMQ
  free-tier files (see `render.yaml`, `frontend/vercel.json`) for a fast test
  deploy, but the canonical production path is `docker compose -f
  docker-compose.prod.yml up`.

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
| POST   | `/api/collections`    | Log a bin-emptying event (auth) |
| GET    | `/api/collections`    | Collection history (`?bin_id=` and `?since_hours=` filters) |
| POST   | `/api/collections/photo` | Upload proof-of-collection photo (auth, multipart) |
| GET    | `/api/predictions`    | Weather + event + history adjusted fill predictions with confidence bands |
| GET    | `/api/dispatch-decision` | The real answer: **should a truck roll right now?** With reasoning + cost/pickup |
| GET    | `/api/route`          | Optimized truck route (gated by dispatch policy — `?respect_policy=false` to force) |
| GET    | `/api/anomalies`      | Open anomalies (stuck sensor, spike, tamper, dead node, gas hazard, low battery) |
| POST   | `/api/anomalies/scan` | Force a fresh scan (auth) |
| POST   | `/api/anomalies/{id}/resolve` | Mark an anomaly resolved (auth) |
| POST   | `/api/bin-events`     | Schedule a load event (fill-rate multiplier over a time window, auth: admin) |
| GET    | `/api/bin-events`     | List scheduled events |
| GET    | `/api/weather?lat=&lng=` | Open-Meteo snapshot + derived fill/gas multipliers |
| POST   | `/api/auth/login`     | OAuth2 password grant → JWT |
| GET    | `/api/auth/me`        | Current user profile |
| POST   | `/api/users`          | Create user (auth: admin) — roles: `admin`/`driver`/`viewer` |

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

## Self-hosted production deploy (all open source)

```bash
# 1) One-time on a fresh VPS with a public IP + DNS pointing at it
cd backend
./scripts/bootstrap.sh                       # certs + mqtt creds

# 2) Set required env
cat > .env <<EOF
DOMAIN=smartbin.example.com
POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$(openssl rand -base64 24)    # write it down — you'll need it to sign in
EOF

# 3) Bring it up
docker compose -f docker-compose.prod.yml up -d
```

Now visit `https://smartbin.example.com` and sign in with the credentials from
`.env`. Caddy handles TLS automatically (Let's Encrypt via ACME HTTP-01).

**Nothing else is required.** No third-party account. No API keys. No credit
card. Open-Meteo is called server-side and needs no auth; all other services
run in the compose network.

### Optional: enable Google Sign-In

Google Sign-In is off by default. To turn it on:

1. Create OAuth credentials at <https://console.cloud.google.com/apis/credentials>.
   - Application type: **Web application**.
   - Authorized JavaScript origins: `https://smartbin.example.com`.
   - No redirect URI needed — SmartBin uses Google Identity Services (frontend
     receives the ID token client-side and posts it to `/api/auth/google`).
2. Add to `.env`:

   ```env
   GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   # Optional: restrict to a Google Workspace domain (comma-separated).
   GOOGLE_ALLOWED_DOMAINS=yourcompany.com
   ```
3. `docker compose -f docker-compose.prod.yml up -d`.
4. Reload the login page — a **Continue with Google** button appears.

Notes:
- The backend verifies every ID token against Google's public keys — a stolen
  or forged token cannot log in.
- The first Google user is created as `viewer`. An admin can promote them
  from Admin → Users.
- If you'd rather stay 100% open-source, swap this integration for **Authentik**,
  **Keycloak**, or **Zitadel** — all self-hostable and all support Google as
  an upstream. The `/api/auth/google` endpoint's contract (ID token in →
  session out) makes the swap straightforward.

## Solving the "one bin, one truck" problem

The dispatch decision engine (`backend/app/optimizer.py::decide_dispatch`) is
the answer. Every ~5 s the dashboard hits `/api/dispatch-decision` which:

1. Classifies each bin as **hazard**, **hard** (over threshold), **imminent**
   (predicted full within grace window), or **soft** (candidate for top-up).
2. Always dispatches on hazards (gas > 300 ppm, overflow).
3. Requires `min_bins` (default 3) on the recommended route before rolling.
4. **Opportunistically adds soft bins** within `topup_radius_km` of the hard
   bins — the driver picks them up on the way.
5. **Defers dispatch** if only 1–2 bins are ready but more are predicted to
   fill within `grace_hours`, and tells the operator when to check back.

Every threshold is a knob on the "Adjust dispatch policy" section of the
dashboard, so operators can tune the tradeoff.

## Predicting fill without knowing what's happening on-site

The predictor (`backend/app/predictor.py::predict_bin_fill`) blends four
signals, each with its own confidence:

- **Historical rate** — average % / hour for this bin at the current
  (day-of-week, hour-of-day) bucket, learned from the last 21 days.
- **Recent trend** — linear regression over the last 12 hours.
- **Category prior** — per-`cafeteria/office/hostel/park/…` baseline used as
  cold-start for brand-new bins with no history.
- **Weather** — Open-Meteo gives temperature + precipitation, converted into
  fill and gas multipliers (rain reduces outdoor traffic; heat boosts gas).
- **Events** — admin schedules "exam week", "concert", etc. from the dashboard
  with a fill-rate multiplier applied during the time window.

Predictions come back with `hours_until_full_low` / `_high` bounds so the UI
can render uncertainty rather than false precision.

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
