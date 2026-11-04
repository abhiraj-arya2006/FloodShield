"""Load real STG-Mamba forecasts and the real river network into the app.

    python scripts/import_model_predictions.py --bundle <folder> --model-repo <folder>

--bundle      holds outputs/ens_perlead_hf5_val_predictions.parquet (2009-2012),
              outputs/final_test_predictions.parquet (2013-2018) and checkpoints/.
--model-repo  a checkout of the model repository, for configs/ and metrics/.

Nothing is written unless the forecasts reproduce the published test scores in
metrics/final_test_results.csv, so the app can't show numbers that disagree with them.
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "app" / "backend" / "data"
CONFIGS = ROOT / "configs"
RUN = "ens_perlead_hf5"
VALIDATION_FILE = f"{RUN}_val_predictions.parquet"
TEST_FILE = "final_test_predictions.parquet"
CHECKPOINTS = [f"stg_mamba_perlead_hf5{s}_best.pt" for s in ("", "_s1", "_s2")]


def fail(message: str) -> None:
    sys.exit(f"ERROR: {message}")


def check_scores(test: pd.DataFrame, q95: pd.Series, margin: float, results: pd.DataFrame) -> None:
    published = results[(results.gauge_set == "all_46") & (results.forecast == "model")
                        & (results["days"] == "all_observed_days")].set_index("lead_day")
    for lead in (2, 3, 4):
        day = test[(test.lead_day == lead) & (test["mask"] == 1)]
        level = day.gauge_id.map(q95)
        flood = day.observed_m3s > level
        alert = day.predicted_m3s >= level * (1 - margin)
        counts = {"hits": int((flood & alert).sum()), "misses": int((flood & ~alert).sum()),
                  "false_alarms": int((~flood & alert).sum())}
        for name, value in counts.items():
            if value != int(published.loc[lead, name]):
                fail(f"lead {lead} {name} is {value}, published {int(published.loc[lead, name])}")
        print(f"Lead {lead} matches the published test scores: {counts}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--model-repo", type=Path, required=True)
    args = parser.parse_args()

    for path in (args.bundle / "outputs" / VALIDATION_FILE, args.bundle / "outputs" / TEST_FILE,
                 args.model_repo / "configs" / "selected_gauges.csv"):
        if not path.exists():
            fail(f"missing {path}")

    margin = float(yaml.safe_load((args.model_repo / "configs" / "alert_margin_final.yaml").read_text())["alert_margin"])
    gauges = pd.read_csv(args.model_repo / "configs" / "selected_gauges.csv", dtype={"gauge_id": str})
    edges = pd.read_csv(args.model_repo / "configs" / "graph_edges.csv", dtype={"source": str, "target": str})
    levels = pd.read_csv(args.model_repo / "configs" / "flow_thresholds.csv", dtype={"gauge_id": str}).set_index("gauge_id")
    results = pd.read_csv(args.model_repo / "metrics" / "final_test_results.csv")

    validation = pd.read_parquet(args.bundle / "outputs" / VALIDATION_FILE).assign(split="validation")
    test = pd.read_parquet(args.bundle / "outputs" / TEST_FILE).assign(split="test")
    check_scores(test, levels.q95, margin, results)

    forecasts = pd.concat([validation, test], ignore_index=True)
    expected = set(gauges.gauge_id)
    if set(forecasts.gauge_id.astype(str)) != expected or set(levels.index) != expected:
        fail("gauge ids differ between forecasts, gauge list and thresholds")
    if forecasts.duplicated(["target_date", "lead_day", "gauge_id"]).any():
        fail("duplicate forecasts for the same day, lead and gauge")
    if not ((forecasts.target_date - forecasts.sample_date).dt.days == forecasts.lead_day).all():
        fail("a forecast's lead day doesn't match its dates")

    out = pd.DataFrame({
        "date": forecasts.target_date.dt.strftime("%Y-%m-%d"),
        "gauge_id": forecasts.gauge_id.astype(str),
        "lead_day": forecasts.lead_day.astype("int8"),
        "predicted_m3s": forecasts.predicted_m3s.round(2),
        "observed_m3s": forecasts.observed_m3s.round(2),
        "mask": forecasts["mask"].astype(bool),
        "split": forecasts.split,
    })

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out.to_parquet(DATA_DIR / "replay_predictions.parquet", index=False)

    gauge_items = [{
        "gauge_id": g.gauge_id,
        "name": g.cwc_site_name,
        "basin": g.basin.capitalize(),
        "river": g.river.split("/")[-1],
        "ghi_lat": round(float(g.ghi_lat), 5),
        "ghi_lon": round(float(g.ghi_lon), 5),
        "q90_m3s": round(float(levels.loc[g.gauge_id, "q90"]), 2),
        "q95_m3s": round(float(levels.loc[g.gauge_id, "q95"]), 2),
    } for g in gauges.itertuples()]
    (DATA_DIR / "gauges.json").write_text(json.dumps(gauge_items, indent=2), encoding="utf-8")

    edge_items = [{"from_gauge_id": e.source, "to_gauge_id": e.target, "river_distance_km": round(float(e.river_km), 1)}
                  for e in edges.itertuples()]
    (DATA_DIR / "edges.json").write_text(json.dumps(edge_items, indent=2), encoding="utf-8")

    pd.DataFrame(gauge_items)[["gauge_id", "q90_m3s", "q95_m3s"]].to_csv(CONFIGS / "flow_thresholds.csv", index=False)
    meta = {
        "predictions": "stg_mamba",
        "run": RUN,
        "members": CHECKPOINTS,
        "alert_margin": margin,
        "first_forecast_date": out.date.min(),
        "last_forecast_date": out.date.max(),
    }
    (DATA_DIR / "replay_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    policy_path = CONFIGS / "river_alert_policy.yaml"
    policy = yaml.safe_load(policy_path.read_text(encoding="utf-8"))
    policy["alert_margin"] = margin
    policy_path.write_text(yaml.safe_dump(policy), encoding="utf-8")

    (ROOT / "checkpoints").mkdir(exist_ok=True)
    for name in CHECKPOINTS:
        source = args.bundle / "checkpoints" / name
        if source.exists():
            shutil.copy2(source, ROOT / "checkpoints" / name)

    print(f"Imported {len(out):,} forecasts for {len(gauge_items)} gauges and {len(edge_items)} river links, "
          f"{meta['first_forecast_date']} to {meta['last_forecast_date']}.")


if __name__ == "__main__":
    main()
