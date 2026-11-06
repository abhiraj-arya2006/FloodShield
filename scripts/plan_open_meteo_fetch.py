"""Plan Open-Meteo cell sampling for the selected gauges (no downloads).

Considered, NOT used: Open-Meteo was dropped; kept for reference only.

Reads configs/selected_gauges.csv, the CAMELS-IND catchment polygons and the
open_meteo block of configs/data.yaml, and writes:

- data/raw/open_meteo/cell_plan.csv: one row per unique grid cell
  (cell_id, lat, lon, n_gauges, gauge_ids)
- data/raw/open_meteo/gauge_cells.csv: one row per gauge
  (gauge_id, site, area, method, n_cells_inside, n_cells, cell_ids)

Usage:
    python scripts/plan_open_meteo_fetch.py
"""

import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
import yaml

from floodshield.data.camels_ind_loader import pad_gauge_ids
from floodshield.data.cell_sampling import cell_id, choose_cells

REPO_ROOT = Path(__file__).resolve().parents[1]


def repo_path(p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else REPO_ROOT / path


def main() -> int:
    cfg = yaml.safe_load((REPO_ROOT / "configs" / "data.yaml").read_text())
    om = cfg["open_meteo"]
    res, origin = float(om["grid_resolution_deg"]), float(om["grid_origin_deg"])

    gauges = pd.read_csv(repo_path(cfg["paths"]["selected_gauges"]), dtype={"gauge_id": str})
    polys = gpd.read_file(repo_path(cfg["paths"]["raw"]["camels_ind"])
                          / cfg["sources"]["camels_ind"]["files"]["catchment_polygons"])
    polys["gauge_id"] = pad_gauge_ids(polys["gauge_id"]).to_numpy()
    polys = polys.set_index("gauge_id")
    missing = sorted(set(gauges["gauge_id"]) - set(polys.index))
    if missing:
        print(f"ERROR: no catchment polygon for {missing}", file=sys.stderr)
        return 1

    gauge_rows, cell_users = [], {}
    for g in gauges.itertuples(index=False):
        choice = choose_cells(polys.loc[g.gauge_id, "geometry"], g.catchment_area_km2,
                              om["sampling"], res, origin)
        ids = [cell_id(lat, lon) for lat, lon in choice.cells]
        for cid, (lat, lon) in zip(ids, choice.cells):
            cell_users.setdefault(cid, {"lat": lat, "lon": lon, "gauges": []})["gauges"].append(
                g.gauge_id)
        gauge_rows.append({
            "gauge_id": g.gauge_id, "basin": g.basin, "cwc_site_name": g.cwc_site_name,
            "catchment_area_km2": g.catchment_area_km2, "method": choice.method,
            "n_cells_inside": choice.n_cells_inside, "n_cells": len(ids),
            "cell_ids": ";".join(ids),
        })

    gauge_plan = pd.DataFrame(gauge_rows)
    cell_plan = pd.DataFrame([
        {"cell_id": cid, "lat": v["lat"], "lon": v["lon"], "n_gauges": len(v["gauges"]),
         "gauge_ids": ";".join(v["gauges"])}
        for cid, v in sorted(cell_users.items())])

    out_cells, out_gauges = repo_path(om["cell_plan"]), repo_path(om["gauge_cell_plan"])
    out_cells.parent.mkdir(parents=True, exist_ok=True)
    cell_plan.to_csv(out_cells, index=False)
    gauge_plan.to_csv(out_gauges, index=False)

    n = gauge_plan["n_cells"]
    print(f"Gauges: {len(gauge_plan)} | unique cells: {len(cell_plan)} | "
          f"cells per gauge min/median/max: {n.min()}/{n.median():g}/{n.max()} | "
          f"cell references: {n.sum()}")
    print("Methods:", gauge_plan["method"].value_counts().to_dict())
    print(f"Wrote {out_cells.relative_to(REPO_ROOT)} and {out_gauges.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
