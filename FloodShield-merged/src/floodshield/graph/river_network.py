"""Snap gauges to HydroRIVERS reaches and trace upstream-to-downstream gauge edges.

HydroRIVERS fields used (HydroRIVERS_TechDoc_v10.pdf): HYRIV_ID (reach id),
NEXT_DOWN (id of the next reach downstream; 0 = none), UPLAND_SKM (upstream
area at the reach's downstream end, km2), DIST_DN_KM (distance from the reach's
downstream end to the final outlet, km).
"""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import geopandas as gpd
import pandas as pd
import pyogrio
from shapely.geometry import Point

READ_COLUMNS = ["HYRIV_ID", "NEXT_DOWN", "UPLAND_SKM", "DIST_DN_KM", "ORD_STRA"]


def load_reaches(path, bbox: Sequence[float]) -> gpd.GeoDataFrame:
    """Read only the reaches intersecting ``bbox`` (minx, miny, maxx, maxy) in lon/lat."""
    return pyogrio.read_dataframe(path, bbox=tuple(bbox), columns=READ_COLUMNS)


def next_down_map(reaches: pd.DataFrame) -> dict[int, int]:
    return dict(zip(reaches["HYRIV_ID"].astype(int), reaches["NEXT_DOWN"].astype(int)))


# --- snapping ---------------------------------------------------------------

@dataclass(frozen=True)
class SnapRules:
    max_distance_km: float          # candidate reaches within this distance of the gauge
    area_ratio_tolerance: float     # accept UPLAND_SKM / ghi_area within [1/(1+t), 1+t]
    high_conf_ratio_tolerance: float
    high_conf_distance_km: float


def ratio_ok(ratio: float, tolerance: float) -> bool:
    return 1.0 / (1.0 + tolerance) <= ratio <= 1.0 + tolerance


def snap_gauge(point_m: Point, area_km2: float, reaches_m: gpd.GeoDataFrame,
               rules: SnapRules) -> dict:
    """Pick a reach for one gauge. ``point_m`` and ``reaches_m`` are in a metric CRS.

    Candidates are reaches within ``max_distance_km``. Among those whose
    UPLAND_SKM / area ratio is within tolerance, choose the best area match
    (smallest |log ratio|), then the nearest. If none matches, no reach is
    assigned (status "failed"); the closest-area candidate is still reported.
    """
    idx = reaches_m.sindex.query(point_m.buffer(rules.max_distance_km * 1000.0))
    cand = reaches_m.iloc[idx].copy()
    out = {"reach_id": None, "distance_km": math.nan, "upland_skm": math.nan,
           "area_ratio": math.nan, "n_candidates": len(cand), "status": "failed",
           "best_candidate_id": None, "best_candidate_ratio": math.nan,
           "best_candidate_distance_km": math.nan}
    if cand.empty:
        out["reason"] = f"no reach within {rules.max_distance_km} km"
        return out
    cand["distance_km"] = cand.geometry.distance(point_m) / 1000.0
    cand = cand[cand["distance_km"] <= rules.max_distance_km]
    if cand.empty:
        out["reason"] = f"no reach within {rules.max_distance_km} km"
        return out
    cand["area_ratio"] = cand["UPLAND_SKM"] / area_km2
    cand["log_err"] = cand["area_ratio"].map(lambda r: abs(math.log(r)))
    cand = cand.sort_values(["log_err", "distance_km"], kind="mergesort")
    best = cand.iloc[0]
    out.update(best_candidate_id=int(best["HYRIV_ID"]), best_candidate_ratio=float(best["area_ratio"]),
               best_candidate_distance_km=float(best["distance_km"]))
    ok = cand[cand["area_ratio"].map(lambda r: ratio_ok(r, rules.area_ratio_tolerance))]
    if ok.empty:
        out["reason"] = (f"no candidate with UPLAND_SKM/area within tolerance "
                         f"{rules.area_ratio_tolerance}")
        return out
    pick = ok.iloc[0]
    high = (ratio_ok(pick["area_ratio"], rules.high_conf_ratio_tolerance)
            and pick["distance_km"] <= rules.high_conf_distance_km)
    out.update(reach_id=int(pick["HYRIV_ID"]), distance_km=float(pick["distance_km"]),
               upland_skm=float(pick["UPLAND_SKM"]), area_ratio=float(pick["area_ratio"]),
               status="high" if high else "medium", reason="")
    return out


def snap_gauges(gauges: pd.DataFrame, reaches: gpd.GeoDataFrame, rules: SnapRules,
                metric_crs: str) -> pd.DataFrame:
    """Snap every gauge (columns gauge_id, ghi_lat, ghi_lon, ghi_area)."""
    reaches_m = reaches.to_crs(metric_crs)
    pts = gpd.GeoSeries(gpd.points_from_xy(gauges["ghi_lon"], gauges["ghi_lat"]),
                        crs="EPSG:4326").to_crs(metric_crs)
    rows = []
    for (_, g), pt in zip(gauges.iterrows(), pts):
        rows.append({"gauge_id": g["gauge_id"], "ghi_area": g["ghi_area"],
                     **snap_gauge(pt, float(g["ghi_area"]), reaches_m, rules)})
    return pd.DataFrame(rows)


# --- tracing ----------------------------------------------------------------

def order_shared_reach(gauge_ids: Sequence[str], area: Mapping[str, float]) -> list[str]:
    """Rule for gauges snapped to the SAME reach: order upstream -> downstream by
    catchment area (smaller area is upstream); ties keep ID order."""
    return sorted(gauge_ids, key=lambda g: (area[g], g))


def trace_edges(gauge_reach: Mapping[str, int], next_down: Mapping[int, int],
                dist_dn_km: Mapping[int, float], area: Mapping[str, float],
                max_steps: int = 100000) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Directed edges from each gauge to the NEXT gauge downstream only.

    Returns (edges, trace_log). Edge distance is DIST_DN_KM(upstream reach) -
    DIST_DN_KM(downstream reach); 0 for gauges on the same reach. A trace ends
    without an edge when NEXT_DOWN is 0 (outlet) or leaves the loaded reaches.
    """
    reach_gauges: dict[int, list[str]] = {}
    for g, r in gauge_reach.items():
        reach_gauges.setdefault(int(r), []).append(g)
    ordered = {r: order_shared_reach(gs, area) for r, gs in reach_gauges.items()}

    edges, log = [], []
    for g, r in gauge_reach.items():
        r = int(r)
        here = ordered[r]
        pos = here.index(g)
        if pos + 1 < len(here):  # another gauge further down the same reach
            edges.append({"source": g, "target": here[pos + 1], "river_km": 0.0,
                          "same_reach": True})
            log.append({"gauge_id": g, "end": "gauge_on_same_reach", "steps": 0})
            continue
        cur, steps, seen = r, 0, {r}
        while True:
            nxt = int(next_down.get(cur, 0))
            if nxt == 0:
                log.append({"gauge_id": g, "end": "outlet", "steps": steps})
                break
            if nxt not in next_down:
                log.append({"gauge_id": g, "end": "left_loaded_reaches", "steps": steps})
                break
            if nxt in seen or steps >= max_steps:
                raise ValueError(f"loop or runaway trace from gauge {g} at reach {nxt}")
            seen.add(nxt)
            steps += 1
            if nxt in ordered:
                target = ordered[nxt][0]  # most upstream gauge on that reach
                edges.append({"source": g, "target": target,
                              "river_km": float(dist_dn_km[r] - dist_dn_km[nxt]),
                              "same_reach": False})
                log.append({"gauge_id": g, "end": f"gauge {target}", "steps": steps})
                break
            cur = nxt
    cols = ["source", "target", "river_km", "same_reach"]
    return pd.DataFrame(edges, columns=cols), pd.DataFrame(log)
