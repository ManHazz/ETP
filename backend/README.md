# SmartBin — Phase 3: Backend & Data Pipeline

AI-powered predictive waste management backend. This phase handles sensor data ingestion, storage, and status monitoring.

## Architecture

```
ESP32 nodes (or simulator)
        │
        │  POST /api/readings
        ▼
   ┌─────────┐      ┌──────────────┐
   │ FastAPI  │─────▶│ TimescaleDB  │
   │  :8000   │      │   (Postgres) │
   └─────────┘      └──────────────┘
        │
        │  GET /api/status
        ▼
   Dashboard (Phase 4)
```

## Quick Start

### Option A: Docker (recommended)

```bash
docker compose up -d
```

API runs at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### Option B: Local dev

1. Start a Postgres/TimescaleDB instance on port 5432
2. Install deps:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the API:
   ```bash
   uvicorn app.main:app --reload
   ```

## Simulator

Seed the campus bins, then run the fake sensor loop:

```bash
# Register 8 campus bins
python -m simulator.sim --seed

# Start generating sensor data (every 10s for testing)
python -m simulator.sim --run

# Or both at once
python -m simulator.sim --seed --run
```

Edit `INTERVAL_SECONDS` in `simulator/sim.py` to control pacing (10s for testing, 900 for realistic 15-min intervals).

## API Endpoints

| Method | Endpoint              | Description                         |
|--------|-----------------------|-------------------------------------|
| GET    | `/health`             | Health check                        |
| POST   | `/api/bins`           | Register a new bin                  |
| GET    | `/api/bins`           | List all bins                       |
| GET    | `/api/bins/{id}`      | Get a specific bin                  |
| DELETE | `/api/bins/{id}`      | Remove a bin                        |
| POST   | `/api/readings`       | Ingest a sensor payload             |
| GET    | `/api/readings/{id}`  | Get recent readings for a bin       |
| GET    | `/api/status`         | Current state of all bins (for dashboard) |
| POST   | `/api/collections`    | Log a bin collection event          |

Full interactive docs available at `/docs` (Swagger UI) when the server is running.

## Project Structure

```
smartbin/
├── app/
│   ├── __init__.py
│   ├── database.py     # SQLAlchemy engine & session
│   ├── main.py         # FastAPI app entry point
│   ├── models.py       # DB models: Bin, SensorReading, CollectionLog
│   ├── routes.py       # All API endpoints
│   └── schemas.py      # Pydantic request/response models
├── simulator/
│   ├── __init__.py
│   └── sim.py          # Fake sensor data generator
├── .env                # Local env vars
├── docker-compose.yml  # TimescaleDB + API
├── Dockerfile
├── requirements.txt
└── README.md
```

## Next Phases

- **Phase 4**: Route optimization (Google OR-Tools VRP solver)
- **Phase 5**: Predictive fill-rate estimation (scikit-learn)
- **Phase 6**: React dashboard + driver app
