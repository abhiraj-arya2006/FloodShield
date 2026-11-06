"""The one-time final test of the per-lead weight-5 three-seed ensemble on 2013-2018.

Nothing is fitted or chosen here: checkpoints, scaling, q95 thresholds and the alert
margin are read as saved. The lock file is created before the test split is loaded and
is never removed, so a second run stops, even if the first one failed.

Usage:
    python scripts/run_final_test.py --rehearse-validation   # same code on 2009-2012; no lock
    python scripts/run_final_test.py --final-test            # once only
"""

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import yaml

from floodshield.data.preprocessing import Normaliser
from floodshield.data.sequence_dataset import load_split
from floodshield.evaluation.evaluator import (
    climatology_forecast,
    fit_climatology,
    persistence_forecast,
    score_per_gauge,
    target_matrix,
)
from floodshield.evaluation.once_lock import AlreadyRunError, acquire_once_lock
from floodshield.inference.alert_margin import alert_counts
from floodshield.inference.risk_thresholds import headline_lead_days
from floodshield.models.stg_mamba import STGMamba, config_from_yaml
from floodshield.training.trainer import make_loader, predict
from floodshield.utils.device import get_device

REPO_ROOT = Path(__file__).resolve().parents[1]
EXPECTED_MEMBERS = ["stg_mamba_perlead_hf5", "stg_mamba_perlead_hf5_s1", "stg_mamba_perlead_hf5_s2"]
EXCLUDED = ["03030", "03056", "08029", "03109", "08020"]
LOCK = REPO_ROOT / "outputs" / "test_run_done.lock"
TEST_OUTPUTS = {
    "table": REPO_ROOT / "metrics" / "final_test_results.csv",
    "summary": REPO_ROOT / "metrics" / "final_test_results.json",
    "gauges": REPO_ROOT / "outputs" / "final_test_gauges.csv",
    "predictions": REPO_ROOT / "outputs" / "final_test_predictions.parquet",
}
VALIDATION_OUTPUTS = {
    "table": REPO_ROOT / "metrics" / "final_test_validation_reference.csv",
    "summary": REPO_ROOT / "metrics" / "final_test_validation_reference.json",
    "gauges": REPO_ROOT / "outputs" / "final_test_validation_gauges.csv",
    "predictions": REPO_ROOT / "outputs" / "final_test_validation_predictions.parquet",
}


def rp(p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else REPO_ROOT / path


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def score_set(forecast: np.ndarray, obs: np.ndarray, thresholds: np.ndarray, ids: list, keep: list, leads: list,
              margin: float) -> tuple[list, pd.DataFrame]:
    """Median NSE/KGE across gauges and flood counts pooled over the gauges in ``keep``."""
    table = score_per_gauge(forecast, obs, ids).set_index(["gauge_id", "lead_day"])
    columns = [ids.index(g) for g in keep]
    rows = []
    for lead in leads:
        part = table.xs(lead, level="lead_day").loc[keep]
        p, o = forecast[:, lead - 1, columns], obs[:, lead - 1, columns]
        thr = np.broadcast_to(thresholds[columns], p.shape)
        paired = np.isfinite(p) & np.isfinite(o)
        rows.append({"lead_day": lead, "median_nse": float(part["nse"].median()),
                     "median_kge": float(part["kge"].median()), "gauges_with_nse": int(part["nse"].notna().sum()),
                     **alert_counts(p[paired], o[paired], thr[paired], margin)})
    return rows, table


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--final-test", action="store_true")
    mode.add_argument("--rehearse-validation", action="store_true")
    args = parser.parse_args()
    split = "test" if args.final_test else "validation"
    outputs = TEST_OUTPUTS if args.final_test else VALIDATION_OUTPUTS

    if args.final_test and LOCK.exists():
        print(f"STOP: {LOCK} already exists. The test has already been started; not running it again.",
              file=sys.stderr)
        return 2
    for path in outputs.values():
        if path.exists():
            print(f"STOP: {path} already exists; not overwriting.", file=sys.stderr)
            return 2

    # Everything that can be checked without the test years, before the lock is taken.
    train_cfg = yaml.safe_load((REPO_ROOT / "configs" / "training.yaml").read_text())
    margin_path = REPO_ROOT / "configs" / "alert_margin_final.yaml"
    margin_cfg = yaml.safe_load(margin_path.read_text())
    margin = float(margin_cfg["alert_margin"])
    if margin_cfg["forecasts"]["members"] != EXPECTED_MEMBERS or margin_cfg["forecasts"]["xgboost_correction"]:
        raise ValueError("the saved margin was not set for the per-lead weight-5 ensemble")
    processed = rp(train_cfg["processed_dir"])
    checkpoints = [rp(train_cfg["checkpoint_dir"]) / f"{m}_best.pt" for m in EXPECTED_MEMBERS]
    w = train_cfg["warning"]
    q_name = f"q{round(w['threshold_quantile'] * 100):d}"
    threshold_path = REPO_ROOT / "configs" / "flow_thresholds.csv"
    thr_table = pd.read_csv(threshold_path, dtype={"gauge_id": str}).set_index("gauge_id")[q_name]
    norm_path = processed / "normalisers.json"
    norm = json.loads(norm_path.read_text())
    tnorm = Normaliser.from_dict(norm["target"])
    ids = norm["target"]["gauge_ids"]
    kept = [g for g in ids if g not in EXCLUDED]
    if len(ids) != 46 or len(kept) != 41:
        raise ValueError("expected 46 gauges, 41 after the exclusions")
    device = get_device(train_cfg["device"], train_cfg["fallback_device"])
    fingerprints = {str(p.relative_to(REPO_ROOT)): sha256(p)
                    for p in [*checkpoints, margin_path, threshold_path, norm_path]}
    commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True).stdout.strip()

    if args.final_test:
        try:
            acquire_once_lock(LOCK, json.dumps({"started": datetime.now().isoformat(timespec="seconds"),
                                                "git_head": commit, "alert_margin": margin,
                                                "inputs_sha256": fingerprints}, indent=1) + "\n")
        except AlreadyRunError as exc:
            print(f"STOP: {exc}. Not running the test again.", file=sys.stderr)
            return 2
        print(f"Lock created: {LOCK.relative_to(REPO_ROOT)}", flush=True)

    data = load_split(processed, split, final_test=args.final_test)
    ds, q, dates, t_index, H = data["dataset"], data["q_m3s"], data["dates"], data["t_index"], data["horizon_days"]
    if data["gauge_ids"] != ids:
        raise ValueError("gauge order differs between the arrays and the normaliser")
    member_preds = []
    for member, path in zip(EXPECTED_MEMBERS, checkpoints):
        ckpt = torch.load(path, map_location="cpu", weights_only=False)
        if ckpt["gauge_ids"] != ids:
            raise ValueError(f"checkpoint {member} gauge order differs from the data")
        model_cfg = ckpt["model_cfg"]
        edges = pd.read_csv(rp(model_cfg["graph"]["edges_file"]), dtype={"source": str, "target": str})
        cfg = config_from_yaml(model_cfg, model_cfg["input"]["feature_list"], ckpt["n_static"], len(ids))
        if cfg.decoder != "per_lead":
            raise ValueError(f"checkpoint {member} is not per_lead")
        model = STGMamba(cfg, edges, ids).to(device)
        model.load_state_dict(ckpt["model_state"])
        member_preds.append(predict(model, make_loader(ds, train_cfg["eval_batch_size"], shuffle=False), device))
        print(f"Predicted with {member}", flush=True)

    pred_z = np.mean(member_preds, axis=0)
    pred = np.clip(np.stack([tnorm.inverse(pred_z[:, k]) for k in range(H)], axis=1), 0.0, None)
    obs = target_matrix(q, t_index, H)

    # Save the forecasts first, so a later failure never needs a second prediction run.
    n, N = len(t_index), len(ids)
    target_dates = np.stack([dates[t_index + k + 1].to_numpy() for k in range(H)], axis=1)
    frame = pd.DataFrame({
        "sample_date": np.repeat(dates[t_index].to_numpy(), H * N),
        "target_date": np.repeat(target_dates.ravel(), N),
        "lead_day": np.tile(np.repeat(np.arange(1, H + 1), N), n),
        "gauge_id": np.tile(np.array(ids, dtype=object), n * H),
        "predicted_m3s": pred.ravel(), "observed_m3s": obs.ravel(),
        "mask": np.isfinite(obs).ravel().astype(np.int8), "predicted_z": pred_z.ravel(),
    })
    frame["gauge_id"] = frame["gauge_id"].astype(str)
    frame.to_parquet(outputs["predictions"], index=False)

    tr = train_cfg["split"]["train"]
    clim = fit_climatology(q, dates, tr["start"], tr["end"], train_cfg["baselines"]["climatology_window_days"])
    forecasts = {"model": pred, "seasonal_average": climatology_forecast(clim, dates, t_index, H),
                 "same_as_yesterday": persistence_forecast(q, t_index, H)}
    thresholds = thr_table.loc[ids].to_numpy(dtype="float64")
    leads = headline_lead_days(w["assumed_data_lag_days"], H)
    common = np.isfinite(obs) & np.isfinite(forecasts["same_as_yesterday"]) & np.isfinite(forecasts["seasonal_average"])

    rows, gauge_tables = [], []
    for days, mask in (("all_observed_days", np.isfinite(obs)), ("common_days", common)):
        for name, forecast in forecasts.items():
            limited = np.where(mask, forecast, np.nan)
            for set_name, members in (("all_46", ids), ("excl_5_41", kept)):
                set_rows, table = score_set(limited, obs, thresholds, ids, members, leads, margin)
                rows += [{"gauge_set": set_name, "forecast": name, "days": days, **r} for r in set_rows]
            gauge_tables.append(table.assign(forecast=name, days=days).reset_index())
    results = pd.DataFrame(rows)

    flood = obs > thresholds[None, None, :]
    flood_frame = frame[frame["mask"] == 1].copy()
    flood_frame["flood"] = flood_frame["observed_m3s"] > flood_frame["gauge_id"].map(thr_table)
    distinct = flood_frame.drop_duplicates(["gauge_id", "target_date"])
    def counts(members: list) -> dict:
        d = distinct[distinct["gauge_id"].isin(members)]
        per_gauge = d.groupby("gauge_id")["flood"].sum()
        return {"distinct_gauge_days_observed": len(d), "distinct_flood_gauge_days": int(d["flood"].sum()),
                "flood_share_of_observed_days": float(d["flood"].mean()),
                "by_year": {int(y): int(v) for y, v in d.groupby(d["target_date"].dt.year)["flood"].sum().items()},
                "gauges_below_min_events": sorted(per_gauge[per_gauge < train_cfg["flow_thresholds"]["min_test_events"]].index),
                "flood_days_by_lead": {int(k): int(flood[:, k - 1, [ids.index(g) for g in members]].sum()) for k in leads}}

    summary = {"split": split, "members": EXPECTED_MEMBERS, "alert_margin": margin,
               "alert_margin_selection": margin_cfg["selection"], "definition": margin_cfg["definition"],
               "flood_day": margin_cfg["flood_day"], "threshold": q_name, "excluded_gauges": EXCLUDED,
               "future_rain_mode": train_cfg["future_rain"]["mode"], "git_head": commit,
               "inputs_sha256": fingerprints, "samples": n, "sample_dates": [str(dates[t_index[0]].date()), str(dates[t_index[-1]].date())],
               "target_dates": [str(frame["target_date"].min().date()), str(frame["target_date"].max().date())],
               "flood_days": {"all_46": counts(ids), "excl_5_41": counts(kept)},
               "same_as_yesterday_definition": "repeats observed flow on forecast date t at every lead",
               "seasonal_average_definition": "training-year calendar mean, centred "
                                              f"{train_cfg['baselines']['climatology_window_days']}-day window"}

    results.round(6).to_csv(outputs["table"], index=False)
    pd.concat(gauge_tables, ignore_index=True).round(6).to_csv(outputs["gauges"], index=False)
    outputs["summary"].write_text(json.dumps(summary, indent=1))

    show = ["gauge_set", "forecast", "lead_day", "median_nse", "median_kge", "flood_days", "hits", "hit_rate",
            "false_alarms", "false_alarm_share", "scored_days"]
    for days in ("all_observed_days", "common_days"):
        print(f"\n=== {split}, margin {margin}, {days} ===", flush=True)
        print(results[results["days"] == days][show].round(3).to_string(index=False), flush=True)
    print("\nFlood days:", json.dumps(summary["flood_days"], indent=1), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
