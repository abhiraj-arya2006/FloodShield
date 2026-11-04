"""Build the per-gauge daily table of ALL CAMELS-IND forcings for the selected gauges.

Reads configs/selected_gauges.csv and
data/raw/camels_ind/catchment_mean_forcings/<gauge>.csv, then writes:

- data/processed/camels_forcings_selected.parquet: long table
  (gauge_id, date, one column per forcing; units in the column metadata file)
- outputs/forcing_column_summary.csv: per column, over all selected gauges
- outputs/forcing_checks.csv: per gauge, the number of days failing each check

Nothing is dropped or filled; anomalies are only counted and reported.

Usage:
    python scripts/build_forcing_table.py
"""

import json
import sys
from pathlib import Path

import pandas as pd
import yaml

from floodshield.data.camels_ind_loader import load_forcings
from floodshield.data.forcing_checks import column_summary, plausibility_checks

REPO_ROOT = Path(__file__).resolve().parents[1]
EXPECTED_START, EXPECTED_END = "1980-01-01", "2020-12-31"


def main() -> int:
    cfg = yaml.safe_load((REPO_ROOT / "configs" / "data.yaml").read_text())
    raw_dir = REPO_ROOT / cfg["paths"]["raw"]["camels_ind"]
    gauges = pd.read_csv(REPO_ROOT / cfg["paths"]["selected_gauges"], dtype={"gauge_id": str})

    frames, checks, all_units = [], {}, None
    expected_index = pd.date_range(EXPECTED_START, EXPECTED_END, freq="D")
    for gid in gauges["gauge_id"]:
        df, units = load_forcings(raw_dir, gid)
        if all_units is None:
            all_units = units
        elif units != all_units:
            print(f"ERROR: {gid} has different columns/units than the first gauge", file=sys.stderr)
            return 1
        if not df.index.equals(expected_index):
            print(f"ERROR: {gid} dates {df.index[0].date()}..{df.index[-1].date()} "
                  f"are not {EXPECTED_START}..{EXPECTED_END}", file=sys.stderr)
            return 1
        checks[gid] = plausibility_checks(df)
        frames.append(df.assign(gauge_id=gid).reset_index())

    table = pd.concat(frames, ignore_index=True)
    table = table[["gauge_id", "date", *all_units]]
    out_dir = REPO_ROOT / cfg["paths"]["processed"]
    out_dir.mkdir(parents=True, exist_ok=True)
    table_path = out_dir / "camels_forcings_selected.parquet"
    table.to_parquet(table_path, index=False)
    (out_dir / "camels_forcings_selected_units.json").write_text(json.dumps(all_units, indent=1))

    summary = column_summary(table.set_index("date")[list(all_units)], all_units)
    check_table = pd.DataFrame.from_dict(checks, orient="index")
    check_table.index.name = "gauge_id"
    outputs = REPO_ROOT / "outputs"
    outputs.mkdir(exist_ok=True)
    summary.to_csv(outputs / "forcing_column_summary.csv")
    check_table.to_csv(outputs / "forcing_checks.csv")

    print(f"{len(gauges)} gauges x {len(expected_index)} days "
          f"({EXPECTED_START}..{EXPECTED_END}, continuous) = {len(table)} rows")
    print(f"Wrote {table_path.relative_to(REPO_ROOT)}")
    pd.set_option("display.width", 250)
    print(summary.drop(columns=["source", "derivation"]).to_string(float_format="%.2f"))
    totals = check_table.sum()
    print("\nCheck violations (days, summed over gauges):")
    print(totals.to_string())
    print("\nGauges with any violation per check:")
    print((check_table > 0).sum()[totals > 0].to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())
