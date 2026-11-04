"""Select Godavari and Mahanadi gauges for STG-Mamba training.

Reads CAMELS-IND (data/raw/camels_ind), the gauge_selection block of
configs/data.yaml and the split periods of configs/training.yaml, then writes:

- configs/selected_gauges.csv: gauges passing the active preset (tracked in Git)
- outputs/gauge_selection_report.csv: every candidate gauge with all
  diagnostics, flags and pass/fail reasons for every preset (git-ignored)

Usage:
    python scripts/select_gauges.py [--preset proposed]
"""

import argparse
import sys
from pathlib import Path

import pandas as pd
import yaml

from floodshield.data.camels_ind_loader import load_gauge_table, load_streamflow
from floodshield.data.gauge_selection import (
    FLAG_COLUMNS,
    apply_manual_includes,
    apply_thresholds,
    compute_diagnostics,
    compute_flags,
)

REPO_ROOT = Path(__file__).resolve().parents[1]

SELECTED_COLUMNS = ["gauge_id", "basin", "river", "cwc_site_name", "ghi_lat", "ghi_lon",
                    "catchment_area_km2", "selection", *FLAG_COLUMNS]


def load_yaml(path: Path) -> dict:
    with path.open() as f:
        return yaml.safe_load(f)


def repo_path(p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else REPO_ROOT / path


def main() -> int:
    data_cfg = load_yaml(REPO_ROOT / "configs" / "data.yaml")
    train_cfg = load_yaml(REPO_ROOT / "configs" / "training.yaml")
    sel_cfg = data_cfg["gauge_selection"]

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--preset", default=sel_cfg["active_preset"],
                        choices=sorted(sel_cfg["presets"]))
    args = parser.parse_args()

    splits = {name: train_cfg["split"][name] for name in ("train", "validation", "test")}
    raw_dir = repo_path(data_cfg["paths"]["raw"]["camels_ind"])
    prefixes = {b: data_cfg["basin_code_prefixes"][b] for b in data_cfg["basins"]}

    gauges = load_gauge_table(raw_dir, prefixes)
    streamflow = load_streamflow(raw_dir, gauges.index)
    print(f"Candidates: {len(gauges)} gauges "
          f"({', '.join(f'{b}={n}' for b, n in gauges['basin'].value_counts().items())})")
    print("Splits (from configs/training.yaml, status: "
          f"{train_cfg['split'].get('status', '?')}): "
          + ", ".join(f"{k} {v['start']}..{v['end']}" for k, v in splits.items()))

    diag = compute_diagnostics(streamflow, gauges, splits, sel_cfg["monsoon_months"],
                               sel_cfg["flags"]["high_flow_quantile"])
    flags = compute_flags(diag, sel_cfg["flags"])
    report = diag.join(flags)

    for name, preset in sel_cfg["presets"].items():
        result = apply_thresholds(diag, preset)
        report[f"passes_{name}"] = result["passes"]
        report[f"fail_reasons_{name}"] = result["fail_reasons"]
    report = report.join(apply_manual_includes(report[f"passes_{args.preset}"],
                                               sel_cfg.get("manual_include")))
    for gid, row in report[report["selection"] == "manual_include"].iterrows():
        print(f"Manual include: {gid} {row['cwc_site_name']} ({row['basin']}), "
              f"fails '{args.preset}': {row[f'fail_reasons_{args.preset}']}")

    print("\nGauges passing per preset:")
    for name, preset in sel_cfg["presets"].items():
        counts = report[report[f"passes_{name}"]]["basin"].value_counts()
        cov, mon = preset["coverage_min"], preset["monsoon_coverage_min"]
        print(f"  {name:9s} coverage>= {cov['train']}/{cov['validation']}/{cov['test']}  "
              f"monsoon>= {mon['train']}/{mon['validation']}/{mon['test']}  -> "
              + ", ".join(f"{b}={counts.get(b, 0)}" for b in data_cfg["basins"]))

    report_path = repo_path(data_cfg["paths"]["gauge_selection_report"])
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report.reset_index().to_csv(report_path, index=False)

    selected = report[report["selected"]].reset_index().rename(
        columns={"cwc_river": "river", "ghi_area": "catchment_area_km2"})
    selected = selected[SELECTED_COLUMNS]
    selected_path = repo_path(data_cfg["paths"]["selected_gauges"])
    selected.to_csv(selected_path, index=False)

    # Leading zeros must survive the round trip.
    reread = pd.read_csv(selected_path, dtype={"gauge_id": str})
    if not (reread["gauge_id"].str.len() == 5).all() or \
            reread["gauge_id"].tolist() != selected["gauge_id"].tolist():
        print(f"ERROR: gauge IDs did not round-trip through {selected_path}", file=sys.stderr)
        return 1

    print(f"\nPreset '{args.preset}': selected {len(selected)} gauges "
          f"({', '.join(f'{b}={n}' for b, n in selected['basin'].value_counts().items())})")
    for basin in data_cfg["basins"]:
        n = int((selected["basin"] == basin).sum())
        if n < 10:
            print(f"WARNING: {basin} has only {n} selected gauges (< 10)")
    print(f"Wrote {selected_path.relative_to(REPO_ROOT)} (IDs re-read OK: "
          f"{reread['gauge_id'].head(3).tolist()} ...)")
    print(f"Wrote {report_path.relative_to(REPO_ROOT)} ({len(report)} gauges)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
