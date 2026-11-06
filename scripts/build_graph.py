"""Build the directed river graph between the selected gauges from HydroRIVERS.

Steps: load reaches inside the catchments' bounding box, snap each gauge
(ghi_lat/ghi_lon) to a reach by distance and upstream-area match, trace
NEXT_DOWN to the next gauge downstream, cross-check against CAMELS-IND
catchment polygon nesting, and write:

- data/graph/: edges.csv, adjacency.npy, node_order.csv, snapping_report.csv,
  trace_log.csv, polygon_crosscheck.csv, graph_summary.json
- configs/graph_edges.csv (tracked, small)
- outputs/graph_map.png

Usage:
    python scripts/build_graph.py
"""

import json
import sys
from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import yaml

from floodshield.data.camels_ind_loader import pad_gauge_ids
from floodshield.graph.adjacency import dense_adjacency
from floodshield.graph.river_network import (
    SnapRules,
    load_reaches,
    next_down_map,
    snap_gauges,
    trace_edges,
)
from floodshield.graph.validation import (
    graph_summary,
    nesting_fractions,
    polygon_disagreements,
)

REPO_ROOT = Path(__file__).resolve().parents[1]


def rp(p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else REPO_ROOT / path


def main() -> int:
    cfg = yaml.safe_load((REPO_ROOT / "configs" / "data.yaml").read_text())
    gcfg = cfg["river_graph"]
    gauges = pd.read_csv(rp(cfg["paths"]["selected_gauges"]), dtype={"gauge_id": str})
    gauges = gauges.rename(columns={"catchment_area_km2": "ghi_area"})
    node_ids = gauges["gauge_id"].tolist()
    basin = gauges.set_index("gauge_id")["basin"]
    area = gauges.set_index("gauge_id")["ghi_area"].to_dict()

    polys = gpd.read_file(rp(cfg["paths"]["raw"]["camels_ind"])
                          / cfg["sources"]["camels_ind"]["files"]["catchment_polygons"])
    polys["gauge_id"] = pad_gauge_ids(polys["gauge_id"]).to_numpy()
    polys = polys[polys["gauge_id"].isin(node_ids)]
    m = float(gcfg["bbox_margin_deg"])
    b = polys.total_bounds
    bbox = (b[0] - m, b[1] - m, b[2] + m, b[3] + m)

    shp = rp(cfg["paths"]["raw"]["hydrorivers"]) / cfg["sources"]["hydrorivers"]["shapefile"]
    reaches = load_reaches(shp, bbox)
    print(f"HydroRIVERS: {len(reaches)} reaches in bbox {tuple(round(x, 2) for x in bbox)}")

    rules = SnapRules(gcfg["snap_max_distance_km"], gcfg["area_ratio_tolerance"],
                      gcfg["high_conf_ratio_tolerance"], gcfg["high_conf_distance_km"])
    snaps = snap_gauges(gauges, reaches, rules, gcfg["metric_crs"])
    snaps.insert(1, "basin", snaps["gauge_id"].map(basin))
    snapped = snaps.dropna(subset=["reach_id"])
    gauge_reach = dict(zip(snapped["gauge_id"], snapped["reach_id"].astype(int)))

    shared = snapped.groupby("reach_id")["gauge_id"].apply(list)
    shared = shared[shared.map(len) > 1]

    nd = next_down_map(reaches)
    dist_dn = dict(zip(reaches["HYRIV_ID"].astype(int), reaches["DIST_DN_KM"]))
    edges, trace_log = trace_edges(gauge_reach, nd, dist_dn, area)

    adj = dense_adjacency(node_ids, edges)
    frac = nesting_fractions(polys, node_ids, gcfg["metric_crs"])
    disagree = polygon_disagreements(frac, adj, gcfg["nested_fraction_min"])
    summary = graph_summary(node_ids, edges, basin)
    summary.update(
        snap_status=snaps["status"].value_counts().to_dict(),
        failed=snaps.loc[snaps["status"] == "failed", "gauge_id"].tolist(),
        review=snaps.loc[snaps["status"] != "high", "gauge_id"].tolist(),
        shared_reaches={str(k): v for k, v in shared.items()},
        trace_ends=trace_log["end"].map(lambda s: s.split(" ")[0]).value_counts().to_dict(),
        polygon_disagreements=len(disagree),
    )

    out = rp(gcfg["outputs"]["dir"])
    out.mkdir(parents=True, exist_ok=True)
    edges.to_csv(out / "edges.csv", index=False)
    np.save(out / "adjacency.npy", adj)
    pd.DataFrame({"index": range(len(node_ids)), "gauge_id": node_ids}).to_csv(
        out / "node_order.csv", index=False)
    snaps.to_csv(out / "snapping_report.csv", index=False)
    trace_log.to_csv(out / "trace_log.csv", index=False)
    disagree.to_csv(out / "polygon_crosscheck.csv", index=False)
    (out / "graph_summary.json").write_text(json.dumps(summary, indent=1, default=str))
    edges.to_csv(rp(gcfg["outputs"]["tracked_edges"]), index=False)

    # Leading zeros must survive.
    reread = pd.read_csv(rp(gcfg["outputs"]["tracked_edges"]), dtype={"source": str, "target": str})
    assert reread["source"].str.len().eq(5).all() and reread["target"].str.len().eq(5).all()

    draw_map(reaches, polys, gauges, edges, rp(gcfg["outputs"]["map"]))

    pd.set_option("display.width", 250)
    print(snaps[["gauge_id", "basin", "reach_id", "distance_km", "upland_skm", "ghi_area",
                 "area_ratio", "status", "n_candidates", "best_candidate_ratio"]]
          .to_string(index=False, float_format="%.3f"))
    print("\nTrace ends:", summary["trace_ends"])
    print(json.dumps({k: v for k, v in summary.items() if k != "component_sizes"}, indent=1, default=str))
    print("component sizes:", summary["component_sizes"])
    print("\nEdges:")
    print(edges.assign(src_basin=edges["source"].map(basin)).to_string(index=False, float_format="%.1f"))
    print("\nPolygon cross-check disagreements:")
    print(disagree.to_string(index=False, float_format="%.3f") if len(disagree) else "none")
    return 0


def draw_map(reaches, polys, gauges, edges, path: Path) -> None:
    fig, ax = plt.subplots(figsize=(12, 9), dpi=130)
    big = reaches[reaches["ORD_STRA"] >= 4]
    big.plot(ax=ax, color="#7fb3d5", linewidth=big["ORD_STRA"].map(lambda o: 0.2 + 0.25 * (o - 4)))
    polys.boundary.plot(ax=ax, color="#bbbbbb", linewidth=0.4)
    xy = gauges.set_index("gauge_id")[["ghi_lon", "ghi_lat"]]
    for _, e in edges.iterrows():
        (x0, y0), (x1, y1) = xy.loc[e["source"]], xy.loc[e["target"]]
        ax.annotate("", xy=(x1, y1), xytext=(x0, y0),
                    arrowprops={"arrowstyle": "->", "color": "#c0392b", "lw": 1.0,
                                "shrinkA": 3, "shrinkB": 3})
    colors = {"godavari": "#1f618d", "mahanadi": "#117a65"}
    for b, g in gauges.groupby("basin"):
        ax.scatter(g["ghi_lon"], g["ghi_lat"], s=22, color=colors.get(b, "k"), zorder=5,
                   edgecolor="white", linewidth=0.5, label=b)
    for gid, (x, y) in xy.iterrows():
        ax.text(x + 0.05, y + 0.05, gid, fontsize=5.5, zorder=6)
    ax.set_title("Selected gauges, HydroRIVERS (Strahler order >= 4) and traced edges (upstream -> downstream)")
    ax.set_xlabel("longitude"); ax.set_ylabel("latitude"); ax.legend(loc="lower left")
    ax.set_aspect("equal")
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout(); fig.savefig(path); plt.close(fig)


if __name__ == "__main__":
    sys.exit(main())
