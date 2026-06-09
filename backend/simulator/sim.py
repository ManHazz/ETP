"""
SmartBin Sensor Simulator
=========================
Generates realistic fake sensor payloads and POSTs them to the API,
mimicking what the ESP32 nodes would send over LoRaWAN.

Usage:
    # First, seed the bins (run once)
    python -m simulator.sim --seed

    # Then run the simulator (sends readings every INTERVAL seconds)
    python -m simulator.sim --run

    # Or do both
    python -m simulator.sim --seed --run
"""

import argparse
import math
import random
import time
from datetime import datetime, timezone

import requests

API_BASE = "http://localhost:8000/api"
INTERVAL_SECONDS = 10  # time between readings (set low for testing, use 900 for realistic 15-min intervals)

# ── Campus bin locations (UTP approximate coords) ─────

CAMPUS_BINS = [
    {"label": "Cafeteria Block A",       "latitude": 4.3856, "longitude": 103.9634, "capacity_liters": 120},
    {"label": "Library Entrance",        "latitude": 4.3849, "longitude": 103.9641, "capacity_liters": 80},
    {"label": "Hostel V5 Lobby",         "latitude": 4.3873, "longitude": 103.9618, "capacity_liters": 120},
    {"label": "Engineering Block 17",    "latitude": 4.3862, "longitude": 103.9657, "capacity_liters": 100},
    {"label": "Chancellor Hall",         "latitude": 4.3841, "longitude": 103.9628, "capacity_liters": 150},
    {"label": "Pocket D Convenience",    "latitude": 4.3869, "longitude": 103.9645, "capacity_liters": 80},
    {"label": "Sport Complex",           "latitude": 4.3832, "longitude": 103.9612, "capacity_liters": 120},
    {"label": "New Village Food Court",  "latitude": 4.3878, "longitude": 103.9652, "capacity_liters": 150},
]


# ── Bin state tracker (simulates fill accumulation) ───

class BinState:
    """Tracks a single bin's simulated sensor values over time."""

    def __init__(self, bin_id: int, label: str, capacity: float):
        self.bin_id = bin_id
        self.label = label
        self.capacity = capacity

        # Start at a random fill level
        self.fill_pct = random.uniform(5, 40)
        self.battery = random.uniform(3.0, 3.3)

        # Fill rate varies per bin (cafeteria fills faster)
        base_rate = 2.0  # % per interval
        if "Cafeteria" in label or "Food" in label:
            base_rate = 4.5
        elif "Hostel" in label:
            base_rate = 3.0
        elif "Library" in label:
            base_rate = 1.0
        self.base_fill_rate = base_rate

    def tick(self) -> dict:
        """Advance one time step and return a sensor payload."""
        now = datetime.now(timezone.utc)
        hour = now.hour

        # Day-of-time multiplier (busier during lunch/dinner)
        if 11 <= hour <= 14:
            time_mult = 1.8
        elif 17 <= hour <= 20:
            time_mult = 1.5
        elif 0 <= hour <= 6:
            time_mult = 0.2
        else:
            time_mult = 1.0

        # Random noise
        noise = random.gauss(0, 0.5)

        # Accumulate fill
        delta = self.base_fill_rate * time_mult + noise
        self.fill_pct = min(100.0, max(0.0, self.fill_pct + delta))

        # Weight correlates with fill (roughly 0.5 kg per % for a 120L bin)
        weight = (self.fill_pct / 100) * self.capacity * 0.004
        weight += random.gauss(0, 0.1)
        weight = max(0, weight)

        # Gas spikes when fill is high
        base_gas = 20 + (self.fill_pct * 2.5)
        if self.fill_pct > 80:
            base_gas += random.uniform(30, 80)
        gas = base_gas + random.gauss(0, 5)
        gas = max(0, gas)

        # Battery slowly drains
        self.battery -= random.uniform(0.0005, 0.002)
        self.battery = max(2.5, self.battery)

        return {
            "bin_id": self.bin_id,
            "fill_level_pct": round(self.fill_pct, 2),
            "weight_kg": round(weight, 2),
            "gas_ppm": round(gas, 2),
            "battery_voltage": round(self.battery, 3),
        }

    def collect(self):
        """Simulate the bin being emptied."""
        self.fill_pct = random.uniform(0, 3)


# ── API helpers ───────────────────────────────────────

def seed_bins():
    """Register all campus bins via the API."""
    print("Seeding bins...")
    for b in CAMPUS_BINS:
        resp = requests.post(f"{API_BASE}/bins", json=b)
        if resp.status_code == 201:
            data = resp.json()
            print(f"  ✓ Created bin #{data['id']}: {data['label']}")
        else:
            print(f"  ✗ Failed to create {b['label']}: {resp.text}")
    print()


def run_simulator():
    """Main simulation loop."""
    # Fetch existing bins from API
    resp = requests.get(f"{API_BASE}/bins")
    bins = resp.json()
    if not bins:
        print("No bins found! Run with --seed first.")
        return

    # Initialize bin states
    states = {
        b["id"]: BinState(b["id"], b["label"], b.get("capacity_liters", 120))
        for b in bins
    }

    print(f"Simulating {len(states)} bins, interval={INTERVAL_SECONDS}s")
    print("Press Ctrl+C to stop\n")

    cycle = 0
    while True:
        cycle += 1
        print(f"── Cycle {cycle} ({datetime.now().strftime('%H:%M:%S')}) ──")

        for bin_id, state in states.items():
            payload = state.tick()
            resp = requests.post(f"{API_BASE}/readings", json=payload)

            fill = payload["fill_level_pct"]
            status = "🔴" if fill > 80 else "🟡" if fill > 50 else "🟢"
            print(f"  {status} {state.label:30s}  fill={fill:5.1f}%  wt={payload['weight_kg']:.1f}kg  gas={payload['gas_ppm']:.0f}ppm")

            # Auto-collect if full (simulates truck pickup)
            if fill >= 95:
                state.collect()
                requests.post(f"{API_BASE}/collections", json={
                    "bin_id": bin_id,
                    "fill_at_collection": fill,
                    "notes": "auto-collected by simulator",
                })
                print(f"       ↳ 🚛 Collected! Reset to {state.fill_pct:.1f}%")

        print()
        time.sleep(INTERVAL_SECONDS)


# ── CLI ───────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SmartBin sensor simulator")
    parser.add_argument("--seed", action="store_true", help="Register campus bins")
    parser.add_argument("--run", action="store_true", help="Start simulation loop")
    args = parser.parse_args()

    if not args.seed and not args.run:
        parser.print_help()
    else:
        if args.seed:
            seed_bins()
        if args.run:
            run_simulator()
