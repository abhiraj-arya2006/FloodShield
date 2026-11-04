"""Tests for gauge snapping, NEXT_DOWN tracing and graph checks (tiny in-memory networks)."""

import geopandas as gpd
import numpy as np
import pandas as pd
import pytest
from shapely.geometry import LineString, Point, box

from floodshield.graph.adjacency import dense_adjacency, reachable_downstream
from floodshield.graph.river_network import SnapRules, order_shared_reach, snap_gauge, trace_edges
from floodshield.graph.validation import graph_summary, nesting_fractions, polygon_disagreements

# A small river in a metric CRS (metres):
#   1 -> 2 -> 3 -> 0 (outlet), and tributary 4 -> 2.
NEXT_DOWN = {1: 2, 2: 3, 3: 0, 4: 2}
DIST_DN = {1: 300.0, 2: 200.0, 3: 100.0, 4: 260.0}


def test_trace_links_only_to_next_gauge_downstream():
    gauge_reach = {"A": 1, "B": 2, "C": 3, "T": 4}
    area = {"A": 10, "B": 50, "C": 90, "T": 20}
    edges, log = trace_edges(gauge_reach, NEXT_DOWN, DIST_DN, area)
    got = {(s, t): km for s, t, km in zip(edges.source, edges.target, edges.river_km)}
    # A must stop at B (never skip to C); C ends at the outlet.
    assert got == {("A", "B"): 100.0, ("B", "C"): 100.0, ("T", "B"): 60.0}
    assert log.set_index("gauge_id").loc["C", "end"] == "outlet"


def test_trace_skips_reaches_without_gauges():
    edges, _ = trace_edges({"A": 1, "C": 3}, NEXT_DOWN, DIST_DN, {"A": 1, "C": 9})
    assert edges[["source", "target", "river_km"]].values.tolist() == [["A", "C", 200.0]]


def test_trace_stops_when_leaving_loaded_reaches():
    edges, log = trace_edges({"A": 1}, {1: 99}, {1: 10.0}, {"A": 1})
    assert edges.empty
    assert log.iloc[0]["end"] == "left_loaded_reaches"


def test_shared_reach_rule_smaller_area_is_upstream():
    assert order_shared_reach(["X", "Y"], {"X": 500, "Y": 80}) == ["Y", "X"]
    edges, _ = trace_edges({"X": 2, "Y": 2, "A": 1}, NEXT_DOWN, DIST_DN, {"X": 500, "Y": 80, "A": 5})
    pairs = set(zip(edges.source, edges.target))
    assert ("Y", "X") in pairs            # same reach, small -> large, distance 0
    assert ("A", "Y") in pairs            # upstream gauge joins the most upstream one
    assert edges.set_index("source").loc["Y", "same_reach"]


def test_trace_rejects_loops():
    with pytest.raises(ValueError, match="loop"):
        trace_edges({"A": 1}, {1: 2, 2: 1}, {1: 1.0, 2: 1.0}, {"A": 1})


RULES = SnapRules(max_distance_km=5.0, area_ratio_tolerance=0.5,
                  high_conf_ratio_tolerance=0.1, high_conf_distance_km=1.0)


def reaches_m(rows):
    return gpd.GeoDataFrame(
        [{"HYRIV_ID": i, "UPLAND_SKM": up} for i, up, _ in rows],
        geometry=[g for *_, g in rows], crs="EPSG:7755")


def test_snap_prefers_area_match_over_nearest():
    r = reaches_m([(1, 50.0, LineString([(0, 100), (1000, 100)])),      # 0.1 km, wrong area
                   (2, 1000.0, LineString([(0, 2000), (1000, 2000)]))])  # 2 km, right area
    out = snap_gauge(Point(500, 0), 1000.0, r, RULES)
    assert out["reach_id"] == 2 and out["status"] == "medium"
    assert out["distance_km"] == pytest.approx(2.0)


def test_snap_never_forces_a_bad_match():
    r = reaches_m([(1, 50.0, LineString([(0, 100), (1000, 100)]))])
    out = snap_gauge(Point(500, 0), 1000.0, r, RULES)
    assert out["reach_id"] is None and out["status"] == "failed"
    assert out["best_candidate_id"] == 1


def test_snap_ignores_reaches_beyond_max_distance():
    r = reaches_m([(1, 1000.0, LineString([(0, 6000), (1000, 6000)]))])
    assert snap_gauge(Point(500, 0), 1000.0, r, RULES)["status"] == "failed"


def test_snap_high_confidence():
    r = reaches_m([(1, 1020.0, LineString([(0, 300), (1000, 300)]))])
    assert snap_gauge(Point(500, 0), 1000.0, r, RULES)["status"] == "high"


def test_adjacency_reachability_and_summary():
    edges = pd.DataFrame({"source": ["A", "B"], "target": ["B", "C"]})
    a = dense_adjacency(["A", "B", "C", "D"], edges)
    assert a.dtype == np.float32 and a[0, 1] == 1 and a[1, 0] == 0
    r = reachable_downstream(a)
    assert r[0, 2] and not r[2, 0]
    s = graph_summary(["A", "B", "C", "D"], edges, pd.Series({"A": "x", "B": "x", "C": "x", "D": "y"}))
    assert s["isolated"] == ["D"] and s["components"] == 2 and s["is_dag"]


def test_polygon_crosscheck_flags_both_directions():
    polys = gpd.GeoDataFrame({"gauge_id": ["A", "B", "C"]},
                             geometry=[box(0, 0, 1000, 1000), box(0, 0, 3000, 3000),
                                       box(5000, 5000, 6000, 6000)], crs="EPSG:7755")
    frac = nesting_fractions(polys, ["A", "B", "C"], "EPSG:7755")
    assert frac.loc["A", "B"] == pytest.approx(1.0)
    # Graph says C -> B (not nested) but misses A -> B (nested).
    adj = dense_adjacency(["A", "B", "C"], pd.DataFrame({"source": ["C"], "target": ["B"]}))
    d = polygon_disagreements(frac, adj, 0.9)
    assert set(zip(d.a, d.b, d.kind)) == {("A", "B", "nested_not_upstream"),
                                          ("C", "B", "upstream_not_nested")}
