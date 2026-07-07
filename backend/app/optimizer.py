"""
Route Optimizer
===============
Uses Google OR-Tools to solve the Vehicle Routing Problem (VRP).
Given a set of bins that need collection, computes the optimal
pickup route that minimizes total travel distance.

The depot (starting point) is the maintenance building where
the garbage truck starts and returns to.
"""

import math
from ortools.constraint_solver import routing_enums_pb2, pywrapcp


# ── Default depot location (adjust to your campus) ────
DEFAULT_DEPOT = {
    "label": "Maintenance Depot",
    "latitude": 4.3845,
    "longitude": 103.9630,
}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.asin(math.sqrt(a))


def _build_distance_matrix(locations: list[dict]) -> list[list[int]]:
    """
    Build a distance matrix (in meters) between all locations.
    Index 0 is always the depot.
    """
    n = len(locations)
    matrix = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                dist = _haversine_km(
                    locations[i]["latitude"], locations[i]["longitude"],
                    locations[j]["latitude"], locations[j]["longitude"],
                )
                matrix[i][j] = int(dist * 1000)  # convert to meters
    return matrix


def optimize_route(
    bins_to_collect: list[dict],
    depot: dict | None = None,
    num_vehicles: int = 1,
) -> dict:
    """
    Compute the optimal collection route.

    Args:
        bins_to_collect: list of dicts with at least
            {bin_id, label, latitude, longitude, effective_fill}
        depot: {label, latitude, longitude} — truck starting point
        num_vehicles: number of trucks (default 1)

    Returns:
        {
            "status": "optimal" | "no_solution" | "no_bins",
            "total_distance_km": float,
            "total_stops": int,
            "route": [
                {"order": 0, "label": "Depot", "latitude": ..., "longitude": ..., "type": "depot"},
                {"order": 1, "label": "Cafeteria A", ..., "type": "pickup", "bin_id": 1, "effective_fill": 92.3},
                ...
                {"order": N, "label": "Depot", ..., "type": "return"},
            ],
            "estimated_time_minutes": float,
        }
    """
    if not bins_to_collect:
        return {
            "status": "no_bins",
            "total_distance_km": 0,
            "total_stops": 0,
            "route": [],
            "estimated_time_minutes": 0,
        }

    depot = depot or DEFAULT_DEPOT

    # Build locations list: depot at index 0, then bins
    locations = [depot] + bins_to_collect
    distance_matrix = _build_distance_matrix(locations)

    # ── OR-Tools setup ────────────────────────────────
    manager = pywrapcp.RoutingIndexManager(
        len(locations),   # number of nodes
        num_vehicles,     # number of vehicles
        0,                # depot index
    )
    routing = pywrapcp.RoutingModel(manager)

    # Distance callback
    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return distance_matrix[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # Search parameters
    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_params.time_limit.seconds = 5  # fast enough for campus scale

    # ── Solve ─────────────────────────────────────────
    solution = routing.SolveWithParameters(search_params)

    if not solution:
        return {
            "status": "no_solution",
            "total_distance_km": 0,
            "total_stops": 0,
            "route": [],
            "estimated_time_minutes": 0,
        }

    # ── Extract route ─────────────────────────────────
    route = []
    total_distance_m = 0
    index = routing.Start(0)
    order = 0

    while not routing.IsEnd(index):
        node = manager.IndexToNode(index)
        loc = locations[node]

        if node == 0:
            route.append({
                "order": order,
                "label": depot["label"],
                "latitude": depot["latitude"],
                "longitude": depot["longitude"],
                "type": "depot",
            })
        else:
            route.append({
                "order": order,
                "label": loc["label"],
                "latitude": loc["latitude"],
                "longitude": loc["longitude"],
                "type": "pickup",
                "bin_id": loc.get("bin_id"),
                "effective_fill": loc.get("effective_fill"),
            })

        prev_index = index
        index = solution.Value(routing.NextVar(index))
        total_distance_m += routing.GetArcCostForVehicle(prev_index, index, 0)
        order += 1

    # Add return to depot
    route.append({
        "order": order,
        "label": depot["label"],
        "latitude": depot["latitude"],
        "longitude": depot["longitude"],
        "type": "return",
    })

    total_km = total_distance_m / 1000
    # Estimate time: assume 20 km/h average in campus + 3 min per stop
    stops = len(bins_to_collect)
    drive_minutes = (total_km / 20) * 60
    stop_minutes = stops * 3
    estimated_time = round(drive_minutes + stop_minutes, 1)

    return {
        "status": "optimal",
        "total_distance_km": round(total_km, 2),
        "total_stops": stops,
        "route": route,
        "estimated_time_minutes": estimated_time,
    }
