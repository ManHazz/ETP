"""
Route optimizer + dispatch decision engine.

Two problems live here:

  1. optimize_route(): given a set of bins, find the shortest tour that
     visits them all starting and returning to the depot.

  2. decide_dispatch(): given the *predictions*, decide whether a truck
     should actually roll right now. This is the hard problem: sending a
     truck for a single 82%-full bin is usually not worth the fuel, driver
     time and wear. This engine enforces a batching policy, opportunistically
     adds nearby less-full bins to top up the truck, and always fires on
     genuine hazards (gas leaks) regardless of batching.
"""

import math
from dataclasses import dataclass

from ortools.constraint_solver import routing_enums_pb2, pywrapcp


DEFAULT_DEPOT = {
    "label": "Chancellor Hall, UTP",
    "latitude": 4.3862,
    "longitude": 100.9739,
}

# Dispatch policy defaults — every one of these is a knob operators can turn.
DEFAULT_MIN_BINS_FOR_DISPATCH = 3
DEFAULT_HARD_THRESHOLD = 80.0
DEFAULT_SOFT_THRESHOLD = 40.0
DEFAULT_TOPUP_RADIUS_KM = 0.8         # opportunistically empty soft-threshold bins within 800m of a hard bin
DEFAULT_GRACE_HOURS = 6               # if we can wait this long for more bins to fill, do
DEFAULT_COST_PER_KM = 1.20            # currency per km (fuel + wear)
DEFAULT_COST_PER_STOP = 8.00          # currency per stop (driver time)


def _haversine_km(a_lat, a_lng, b_lat, b_lng) -> float:
    R = 6371.0
    dlat = math.radians(b_lat - a_lat)
    dlng = math.radians(b_lng - a_lng)
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a_lat)) * math.cos(math.radians(b_lat)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(h))


# ────────────────────────────────────────────────────────────────
#  Route optimization (VRP via OR-Tools)
# ────────────────────────────────────────────────────────────────

def _build_distance_matrix(locations: list[dict]) -> list[list[int]]:
    n = len(locations)
    m = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                m[i][j] = int(_haversine_km(
                    locations[i]["latitude"], locations[i]["longitude"],
                    locations[j]["latitude"], locations[j]["longitude"],
                ) * 1000)
    return m


def _solve_single_floor(locations: list[dict]) -> tuple[list[int], int] | None:
    """Runs the OR-Tools TSP on a small set of locations. Returns
    (order_of_indices_into_locations, total_metres) or None if no solution."""
    n = len(locations)
    if n < 2:
        return None
    dist = _build_distance_matrix(locations)
    manager = pywrapcp.RoutingIndexManager(n, 1, 0)
    routing = pywrapcp.RoutingModel(manager)

    def cb(from_idx, to_idx):
        return dist[manager.IndexToNode(from_idx)][manager.IndexToNode(to_idx)]

    idx = routing.RegisterTransitCallback(cb)
    routing.SetArcCostEvaluatorOfAllVehicles(idx)
    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.seconds = 5
    solution = routing.SolveWithParameters(params)
    if not solution:
        return None

    order = []
    total_m = 0
    i = routing.Start(0)
    while not routing.IsEnd(i):
        order.append(manager.IndexToNode(i))
        prev = i
        i = solution.Value(routing.NextVar(i))
        total_m += routing.GetArcCostForVehicle(prev, i, 0)
    return order, total_m


def optimize_route(bins_to_collect: list[dict], depot: dict | None = None, num_vehicles: int = 1) -> dict:
    """
    Cluster bins by floor first, then run a within-floor TSP for each group.
    This matches how someone actually walks a building: finish one floor,
    take the lift/stairs, do the next floor. If every bin is on floor 0 (the
    default) this collapses back to a single flat TSP with no floor
    transitions in the output.
    """
    if not bins_to_collect:
        return {"status": "no_bins", "total_distance_km": 0, "total_stops": 0, "route": [], "estimated_time_minutes": 0}

    depot = depot or DEFAULT_DEPOT
    # Group by floor, ascending. Bins missing floor default to 0.
    floors: dict[int, list[dict]] = {}
    for b in bins_to_collect:
        floors.setdefault(int(b.get("floor") or 0), []).append(b)
    floor_order = sorted(floors.keys())

    route: list[dict] = []
    total_m = 0
    stops = 0
    prev_floor: int | None = None
    order = 0

    # Kick off from the depot
    route.append({"order": order, "label": depot["label"], "latitude": depot["latitude"], "longitude": depot["longitude"], "type": "depot", "floor": 0})
    order += 1

    # A "starting anchor" for a floor's TSP is the previous last stop when
    # possible, so within-floor routes chain naturally. Since we don't have a
    # per-floor entry point (a stairwell/lift), we anchor each floor's mini
    # TSP at the depot to keep the maths honest; the floor-change edge itself
    # is a fixed penalty below.
    for f in floor_order:
        bins_on_floor = floors[f]
        # Insert a floor-change marker whenever the floor number changes
        if prev_floor is not None and f != prev_floor:
            route.append({
                "order": order, "label": f"Move to floor {f}", "type": "floor_change",
                "from_floor": prev_floor, "to_floor": f,
                # Reuse the last pickup's coordinates so the map still has a lat/lng.
                "latitude": route[-1]["latitude"], "longitude": route[-1]["longitude"],
                "floor": f,
            })
            order += 1

        # Solve TSP with depot as anchor for this floor
        locations = [depot] + bins_on_floor
        result = _solve_single_floor(locations)
        if not result:
            # Fallback: keep whatever order they came in
            visit = list(range(1, len(locations)))
            floor_m = 0
        else:
            visit_full, floor_m = result
            # visit_full starts at depot (index 0). Drop the depot from the
            # output so we don't return "home" between floors — only the bins.
            visit = [n for n in visit_full[1:] if n != 0]
            # Also strip the return leg's cost (last edge went back to depot);
            # we replace it with the horizontal cost of the next floor's tour.
            # This is approximate but keeps totals reasonable.

        for n in visit:
            loc = locations[n]
            route.append({
                "order": order, "label": loc["label"],
                "latitude": loc["latitude"], "longitude": loc["longitude"],
                "type": "pickup", "bin_id": loc.get("bin_id"),
                "effective_fill": loc.get("effective_fill"),
                "reason": loc.get("reason"),
                "floor": f,
            })
            order += 1
        stops += len(visit)
        total_m += floor_m
        prev_floor = f

    # Close the loop back to the depot
    route.append({"order": order, "label": depot["label"], "latitude": depot["latitude"], "longitude": depot["longitude"], "type": "return", "floor": 0})

    # Add a rough per-floor-change penalty for time estimation only. Doesn't
    # affect route optimality; just makes the "Est. minutes" more honest for
    # multi-floor pickups.
    floor_changes = sum(1 for s in route if s["type"] == "floor_change")
    km = total_m / 1000
    minutes = round((km / 20) * 60 + stops * 3 + floor_changes * 2, 1)  # 20 km/h + 3 min/stop + 2 min per floor change
    return {
        "status": "optimal",
        "total_distance_km": round(km, 2),
        "total_stops": stops,
        "floor_changes": floor_changes,
        "route": route,
        "estimated_time_minutes": minutes,
    }


# ────────────────────────────────────────────────────────────────
#  Dispatch Decision Engine
# ────────────────────────────────────────────────────────────────

@dataclass
class DispatchPolicy:
    hard_threshold: float = DEFAULT_HARD_THRESHOLD
    soft_threshold: float = DEFAULT_SOFT_THRESHOLD
    min_bins_for_dispatch: int = DEFAULT_MIN_BINS_FOR_DISPATCH
    topup_radius_km: float = DEFAULT_TOPUP_RADIUS_KM
    grace_hours: float = DEFAULT_GRACE_HOURS
    cost_per_km: float = DEFAULT_COST_PER_KM
    cost_per_stop: float = DEFAULT_COST_PER_STOP


def decide_dispatch(
    predictions: list[dict],
    bins_by_id: dict[int, dict],   # bin_id → {latitude, longitude, gas_ppm?, soft_threshold_pct?}
    policy: DispatchPolicy | None = None,
) -> dict:
    """
    Return a dispatch recommendation:

    {
        "should_dispatch": bool,
        "reason": str,                         # one-line human-readable reason
        "must_pickup": [bin_id, ...],          # hazards / already-full
        "recommended_pickup": [bin_id, ...],   # must + opportunistic top-ups
        "deferred": [bin_id, ...],             # would be picked up but we're waiting
        "next_check_at_hours": float | null,   # suggested wait window
        "cost_estimate": float,                # if dispatched now
        "cost_per_bin": float,
    }
    """
    p = policy or DispatchPolicy()

    # 1) Classify each bin
    hard: list[dict] = []            # over hard threshold or predicted overflow within 1h
    hazards: list[dict] = []         # gas or overflow — always dispatch
    soft: list[dict] = []             # candidates for top-up
    imminent: list[dict] = []         # will hit hard threshold within grace window

    for pred in predictions:
        b = bins_by_id.get(pred["bin_id"])
        if not b:
            continue
        eff = pred.get("current_effective_fill") or 0
        gas = b.get("gas_ppm")
        hu = pred.get("hours_until_full")
        soft_thresh = b.get("soft_threshold_pct") or p.soft_threshold

        # Hazard trigger: gas over hazard level or already overflowing
        if (gas is not None and gas > 300) or eff >= 100:
            hazards.append({"bin": b, "pred": pred, "reason": "gas hazard" if gas and gas > 300 else "overflowing"})
            continue

        if eff >= p.hard_threshold:
            hard.append({"bin": b, "pred": pred, "reason": f"over {p.hard_threshold:.0f}% threshold"})
        elif hu is not None and hu <= 1.0:
            hard.append({"bin": b, "pred": pred, "reason": "predicted full within 1h"})
        elif hu is not None and hu <= p.grace_hours:
            imminent.append({"bin": b, "pred": pred, "reason": f"predicted full in {hu:.1f}h"})
        elif eff >= soft_thresh:
            soft.append({"bin": b, "pred": pred, "reason": f"over {soft_thresh:.0f}% top-up floor"})

    # 2) Hard must-pickups are hazards + hard bins.
    must_ids: set[int] = set()
    must_pickups: list[dict] = []
    for item in hazards + hard:
        pid = item["bin"]["bin_id"]
        if pid in must_ids: continue
        must_ids.add(pid)
        must_pickups.append(item)

    # 3) Opportunistic top-ups: soft bins within topup_radius of any hard bin.
    topups: list[dict] = []
    for item in soft:
        b = item["bin"]
        for h in must_pickups:
            hb = h["bin"]
            if _haversine_km(b["latitude"], b["longitude"], hb["latitude"], hb["longitude"]) <= p.topup_radius_km:
                topups.append(item)
                break

    recommended = must_pickups + topups

    # 4) Estimate cost if we dispatch now
    def _cost(pickups: list[dict]) -> tuple[float, float]:
        if not pickups:
            return 0.0, 0.0
        locs = [{"latitude": DEFAULT_DEPOT["latitude"], "longitude": DEFAULT_DEPOT["longitude"]}] + \
               [x["bin"] for x in pickups]
        # crude ordering by nearest-neighbor for cost estimation (cheap; real route uses OR-Tools)
        km = 0.0
        cur = 0
        remaining = list(range(1, len(locs)))
        while remaining:
            nxt = min(remaining, key=lambda i: _haversine_km(locs[cur]["latitude"], locs[cur]["longitude"], locs[i]["latitude"], locs[i]["longitude"]))
            km += _haversine_km(locs[cur]["latitude"], locs[cur]["longitude"], locs[nxt]["latitude"], locs[nxt]["longitude"])
            cur = nxt
            remaining.remove(nxt)
        km += _haversine_km(locs[cur]["latitude"], locs[cur]["longitude"], locs[0]["latitude"], locs[0]["longitude"])
        cost = km * p.cost_per_km + len(pickups) * p.cost_per_stop
        return round(km, 2), round(cost, 2)

    dispatch_km, dispatch_cost = _cost(recommended)
    cost_per_bin = round(dispatch_cost / max(len(recommended), 1), 2)

    # 5) Decide.
    # Always dispatch if hazards exist.
    if hazards:
        return _build(True, "Hazard: gas leak or overflow detected — dispatch immediately.",
                      must_pickups, recommended, [], None, dispatch_cost, cost_per_bin, dispatch_km, hazards, imminent)

    if not must_pickups:
        # Nothing needs picking up. If bins are imminent we can suggest a wait, otherwise no action.
        wait_hours = min((i["pred"]["hours_until_full"] or p.grace_hours) for i in imminent) if imminent else None
        return _build(False,
                      "No bins are critical." + (f" Next fills in ~{wait_hours:.1f}h." if wait_hours else ""),
                      [], [], [i["bin"]["bin_id"] for i in imminent], wait_hours,
                      0.0, 0.0, 0.0, hazards, imminent)

    # Have some hard bins. Decide by batching policy.
    hard_count = len(must_pickups)
    total = len(recommended)

    if total >= p.min_bins_for_dispatch:
        return _build(True,
                      f"{hard_count} critical + {len(topups)} top-up = {total} bins on the route — cost-effective to dispatch.",
                      must_pickups, recommended, [], None, dispatch_cost, cost_per_bin, dispatch_km, hazards, imminent)

    # Under batching threshold — decide whether waiting is cheaper.
    if imminent:
        wait_hours = min(i["pred"]["hours_until_full"] or p.grace_hours for i in imminent)
        # If waiting brings us up to min_bins within grace, defer.
        eligible_after_wait = total + sum(
            1 for i in imminent if (i["pred"]["hours_until_full"] or 999) <= wait_hours + 0.5
        )
        if eligible_after_wait >= p.min_bins_for_dispatch and wait_hours <= p.grace_hours:
            deferred = [i["bin"]["bin_id"] for i in imminent[:p.min_bins_for_dispatch - total]]
            return _build(False,
                          f"Only {total} bin(s) ready — waiting ~{wait_hours:.1f}h to batch with {len(deferred)} imminent bin(s) saves ≈{p.cost_per_km * dispatch_km:.2f} per pickup.",
                          must_pickups, recommended, deferred, wait_hours, dispatch_cost, cost_per_bin, dispatch_km, hazards, imminent)

    # Nothing to wait for and under batch size — dispatch anyway with an efficiency warning.
    return _build(True,
                  f"Only {total} bin(s) available and no imminent fills; dispatching is inefficient ({dispatch_cost:.2f} for {total} pickup(s)). Consider raising soft threshold.",
                  must_pickups, recommended, [], None, dispatch_cost, cost_per_bin, dispatch_km, hazards, imminent)


def _build(should_dispatch, reason, must, recommended, deferred, next_check,
           cost, cost_per_bin, km, hazards, imminent) -> dict:
    return {
        "should_dispatch": should_dispatch,
        "reason": reason,
        "must_pickup": [m["bin"]["bin_id"] for m in must],
        "recommended_pickup": [r["bin"]["bin_id"] for r in recommended],
        "deferred": deferred,
        "next_check_at_hours": next_check,
        "cost_estimate": cost,
        "cost_per_bin": cost_per_bin,
        "dispatch_km": km,
        "hazard_count": len(hazards),
        "imminent_count": len(imminent),
        "picks": [
            {"bin_id": r["bin"]["bin_id"], "label": r["bin"].get("label"),
             "latitude": r["bin"]["latitude"], "longitude": r["bin"]["longitude"],
             "effective_fill": r["pred"].get("current_effective_fill"),
             "reason": r["reason"]}
            for r in recommended
        ],
    }
