"""Choose one alert margin from the saved ensemble forecasts on the validation years.

Reads only the saved 2009-2012 forecasts, so the test years are never loaded. Does
not retrain and does not use the XGBoost correction. The chosen margin goes to a new
file; configs/training.yaml warning.alert_margin stays as it is.

Usage:
    python scripts/sweep_alert_margin.py
"""

import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from floodshield.inference.alert_margin import alert_counts, select_margin
from floodshield.inference.risk_thresholds import headline_lead_days

REPO_ROOT = Path(__file__).resolve().parents[1]
RUN = "ens_perlead_hf5"
MEMBERS = ["stg_mamba_perlead_hf5", "stg_mamba_perlead_hf5_s1", "stg_mamba_perlead_hf5_s2"]
EXCLUDED = ["03030", "03056", "08029", "03109", "08020"]
MARGINS = [round(i * 0.005, 3) for i in range(199)]   # 0 to 0.99; a margin of 1 would always alert
SWEEP_PATH = REPO_ROOT / "metrics" / "alert_margin_sweep_val.csv"
FINAL_PATH = REPO_ROOT / "configs" / "alert_margin_final.yaml"
RULE = ("Smallest single margin with pooled hit rate >= 0.90 and false-alarm share <= 0.60 at every one of leads "
        "2, 3 and 4 on all 46 gauges. If none, the margin with false-alarm share <= 0.50 at every lead and the "
        "highest hit rate at its worst lead (ties: smallest margin), and 0.90 is reported as not reachable.")


def main() -> int:
    for path in (SWEEP_PATH, FINAL_PATH):
        if path.exists():
            print(f"ERROR: {path} already exists; not overwriting", file=sys.stderr)
            return 1

    train_cfg = yaml.safe_load((REPO_ROOT / "configs" / "training.yaml").read_text())
    metrics = json.loads((REPO_ROOT / "metrics" / f"{RUN}_val_metrics.json").read_text())
    if metrics["members"] != MEMBERS or metrics["decoder"] != "per_lead" or metrics["split"] != "validation":
        raise ValueError(f"{RUN} is not the per-lead weight-5 three-seed validation ensemble")
    val = train_cfg["split"]["validation"]
    frame = pd.read_parquet(REPO_ROOT / "outputs" / f"{RUN}_val_predictions.parquet",
                            columns=["gauge_id", "target_date", "lead_day", "predicted_m3s", "observed_m3s", "mask"])
    if frame["target_date"].min() < pd.Timestamp(val["start"]) or frame["target_date"].max() > pd.Timestamp(val["end"]):
        raise ValueError("saved forecasts reach outside the validation years")

    w = train_cfg["warning"]
    thresholds = pd.read_csv(REPO_ROOT / "configs" / "flow_thresholds.csv",
                             dtype={"gauge_id": str}).set_index("gauge_id")[f"q{round(w['threshold_quantile'] * 100):d}"]
    leads = headline_lead_days(w["assumed_data_lag_days"], int(frame["lead_day"].max()))
    frame = frame[(frame["mask"] == 1) & frame["lead_day"].isin(leads)].copy()
    frame["threshold"] = frame["gauge_id"].map(thresholds)
    gauges = sorted(frame["gauge_id"].unique())
    kept = [g for g in gauges if g not in EXCLUDED]
    if len(gauges) != 46 or len(kept) != 41 or (thresholds.loc[gauges] <= 0).any():
        raise ValueError("expected 46 gauges with positive thresholds, 41 after the exclusions")

    rows = []
    for name, members in (("all_46", gauges), ("excl_5_41", kept)):
        subset = frame[frame["gauge_id"].isin(members)]
        for lead in leads:
            part = subset[subset["lead_day"] == lead]
            pred, obs, thr = (part["predicted_m3s"].to_numpy(), part["observed_m3s"].to_numpy(),
                              part["threshold"].to_numpy())
            for margin in MARGINS:
                rows.append({"gauge_set": name, "margin": margin, "lead_day": lead,
                             **alert_counts(pred, obs, thr, margin)})
    sweep = pd.DataFrame(rows)

    choice = select_margin(sweep[sweep["gauge_set"] == "all_46"])
    at_choice = sweep[sweep["margin"] == choice["margin"]]
    def results(name: str) -> dict:
        part = at_choice[at_choice["gauge_set"] == name]
        return {int(r.lead_day): {"hit_rate": round(r.hit_rate, 4), "false_alarm_share": round(r.false_alarm_share, 4),
                                  "accuracy": round(r.accuracy, 4), "flood_days": int(r.flood_days),
                                  "hits": int(r.hits), "false_alarms": int(r.false_alarms),
                                  "scored_days": int(r.scored_days)} for r in part.itertuples()}

    final = {
        "alert_margin": choice["margin"],
        "definition": "alert if forecast_m3s >= q95 * (1 - alert_margin); dimensionless fraction of the gauge's "
                      "training-year q95 (configs/flow_thresholds.csv). One value for all gauges and leads.",
        "flood_day": "observed_m3s > q95",
        "rule": RULE,
        "rule_branch": choice["branch"],
        "hit_rate_0_90_reachable_within_false_alarm_limit": choice["target_reachable"],
        "smallest_margin_reaching_hit_rate_0_90": choice["smallest_margin_reaching_hit_target"],
        "chosen_on": date.today().isoformat(),
        "forecasts": {"run": RUN, "members": MEMBERS, "xgboost_correction": False},
        "validation_period": [val["start"], val["end"]],
        "sweep": {"margins": f"{MARGINS[0]} to {MARGINS[-1]} in steps of 0.005", "file": str(SWEEP_PATH.relative_to(REPO_ROOT))},
        "validation_results": {"all_46": results("all_46"), "excl_5_41": {"excluded": EXCLUDED, **results("excl_5_41")}},
        "notes": ["Pooled over gauges and scored on days with observed flow.",
                  "future_rain mode observed: validation uses real IMD rain, so scores are optimistic.",
                  "Not read by any code yet; configs/training.yaml warning.alert_margin is unchanged."],
    }
    sweep.round(6).to_csv(SWEEP_PATH, index=False)
    FINAL_PATH.write_text(yaml.safe_dump(final, sort_keys=False, width=110))
    print(FINAL_PATH.read_text())
    grid = sweep[sweep["gauge_set"] == "all_46"].pivot(index="margin", columns="lead_day",
                                                       values=["hit_rate", "false_alarm_share"])
    print(grid.loc[np.round(np.arange(0, 1.0, 0.1), 3)].round(3).to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())
