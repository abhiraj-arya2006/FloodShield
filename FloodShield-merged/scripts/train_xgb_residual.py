"""Fit XGBoost on the saved ensemble's residuals: fit 2009-2011, check on 2012.

Reads only the saved validation forecasts and rain up to 2012-12-31, so the test
years are never loaded. Does not retrain STG-Mamba or touch its checkpoints.

XGBoost needs an OpenMP runtime on macOS. Without a system libomp, use the copy
scikit-learn ships:
    DYLD_FALLBACK_LIBRARY_PATH=.venv/lib/python3.11/site-packages/sklearn/.dylibs \
        .venv/bin/python scripts/train_xgb_residual.py
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
import yaml

from floodshield.correction.residual import build_table, feature_columns, peak_ratio, to_cube, to_flow
from floodshield.data.preprocessing import Normaliser
from floodshield.evaluation.evaluator import flood_per_gauge, score_per_gauge
from floodshield.inference.risk_thresholds import headline_lead_days

REPO_ROOT = Path(__file__).resolve().parents[1]


def load_inputs(cfg: dict, train_cfg: dict) -> tuple:
    run = cfg["ensemble"]["run_name"]
    metrics = json.loads((REPO_ROOT / "metrics" / f"{run}_val_metrics.json").read_text())
    if metrics["members"] != cfg["ensemble"]["members"] or metrics["decoder"] != cfg["ensemble"]["decoder"]:
        raise ValueError(f"{run} was not built from the configured members and decoder")
    if metrics["split"] != "validation":
        raise ValueError(f"{run} metrics are not from the validation split")
    predictions = pd.read_parquet(REPO_ROOT / "outputs" / f"{run}_val_predictions.parquet")
    last_day = pd.Timestamp(cfg["split"]["holdout"]["end"])
    if predictions["target_date"].max() > last_day or predictions["target_date"].min() < pd.Timestamp(
            cfg["split"]["fit"]["start"]):
        raise ValueError("saved forecasts reach outside the configured years")

    first_day = predictions["sample_date"].min() - pd.Timedelta(days=max(cfg["rain"]["past_window_days"]))
    forcings = pd.read_parquet(REPO_ROOT / "data" / "processed" / "camels_forcings_selected.parquet",
                               columns=["gauge_id", "date", "prcp"],
                               filters=[("date", ">=", first_day), ("date", "<=", last_day)])
    if forcings["date"].max() > last_day:
        raise ValueError("rain was read beyond the validation years")
    rain = forcings.pivot(index="date", columns="gauge_id", values="prcp").sort_index()

    static = pd.read_csv(REPO_ROOT / train_cfg["processed_dir"] / "static_features.csv", header=[0, 1], index_col=0)
    static = static["standardised"]
    static.index = static.index.astype(str).str.zfill(5)
    static.columns.name = None

    norm = json.loads((REPO_ROOT / train_cfg["processed_dir"] / "normalisers.json").read_text())
    target_norm = Normaliser.from_dict(norm["target"])
    return predictions, rain, static, target_norm, norm["target"]["gauge_ids"], norm["horizon_days"]


def rmse(a: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(a))))


def score_holdout(holdout: pd.DataFrame, column: str, thresholds: pd.Series, ids: list, H: int, leads: list,
                  top_n: int) -> tuple:
    pred = to_cube(holdout, column, H, ids)
    obs = to_cube(holdout.assign(_o=holdout["observed_m3s"].where(holdout["mask"] == 1)), "_o", H, ids)
    scores = score_per_gauge(pred, obs, ids).set_index(["gauge_id", "lead_day"])
    flood = flood_per_gauge(pred, obs, thresholds, ids, leads).set_index(["gauge_id", "lead_day"])
    peaks = pd.Series({(g, k + 1): peak_ratio(pred[:, k, j], obs[:, k, j], top_n)
                       for j, g in enumerate(ids) for k in range(H)}, name="peak_ratio")
    peaks.index.names = ["gauge_id", "lead_day"]
    return scores, flood, peaks


def lead_row(scores: pd.DataFrame, flood: pd.DataFrame, peaks: pd.Series, lead: int) -> dict:
    s, f = scores.xs(lead, level="lead_day"), flood.xs(lead, level="lead_day")
    hits, false_alarms = int(f["hits"].sum()), int(f["false_alarms"].sum())
    return {"median_nse": float(s["nse"].median()), "flood_days": int(f["flood_days"].sum()), "hits": hits,
            "false_alarms": false_alarms, "hit_share": hits / int(f["flood_days"].sum()),
            "false_alarm_share": false_alarms / (hits + false_alarms) if hits + false_alarms else None,
            "median_peak_ratio": float(peaks.xs(lead, level="lead_day").median())}


def write_markdown(path: Path, s: dict, leads: list) -> None:
    lines = ["# XGBoost residual correction: 2012 holdout", "",
             f"Ensemble `{s['ensemble']}`; fit on {s['rows']['fit_observed']} observed rows (2009-2011), "
             f"{s['rows']['holdout_observed']} observed rows in 2012. Best round {s['best_round']} of "
             f"{s['max_rounds']}.", "",
             "| Lead | NSE before | NSE after | Floods caught before | after | False-alarm share before | after "
             "| Peak ratio before | after | Gauges better / worse |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for lead in leads:
        b, a, c = s["before"][str(lead)], s["after"][str(lead)], s["nse_change"][str(lead)]
        lines.append(f"| {lead} | {b['median_nse']:.3f} | {a['median_nse']:.3f} | {b['hits']}/{b['flood_days']} "
                     f"| {a['hits']}/{a['flood_days']} | {b['false_alarm_share']:.3f} | {a['false_alarm_share']:.3f} "
                     f"| {b['median_peak_ratio']:.3f} | {a['median_peak_ratio']:.3f} "
                     f"| {c['improved']} / {c['worsened']} |")
    lines += ["", f"Standardised log-flow RMSE on 2012: {s['z_rmse']['holdout_before']:.4f} before, "
                  f"{s['z_rmse']['holdout_after']:.4f} after.", "",
              "2012 chose the stopping round and also gives these scores, so they are not fully independent. "
              "The same years also selected the ensemble. Future rain is observed IMD rain, not a real forecast.",
              ""]
    path.write_text("\n".join(lines))


def main() -> int:
    cfg = yaml.safe_load((REPO_ROOT / "configs" / "xgb_residual.yaml").read_text())
    train_cfg = yaml.safe_load((REPO_ROOT / "configs" / "training.yaml").read_text())
    predictions, rain, static, target_norm, ids, H = load_inputs(cfg, train_cfg)
    windows = cfg["rain"]["past_window_days"]
    table = build_table(predictions, rain, static, target_norm, ids, windows, H, cfg["split"]["fit"],
                        cfg["split"]["holdout"])
    features = feature_columns(windows, H, static.columns)

    positions = table["gauge_id"].map(pd.Series(np.arange(len(ids)), index=ids)).to_numpy()
    if not np.allclose(to_flow(table["predicted_z"].to_numpy(), positions, target_norm),
                       table["predicted_m3s"].to_numpy(), rtol=1e-3, atol=1e-2):
        raise ValueError("saved forecasts do not convert back to their saved m3/s values")

    observed = table["residual"].notna()
    fit = table[(table["split"] == "fit") & observed]
    holdout_rows = table[(table["split"] == "holdout") & observed]

    params = dict(cfg["xgboost"])
    model = xgb.XGBRegressor(**params)
    model.fit(fit[features], fit["residual"],
              eval_set=[(fit[features], fit["residual"]), (holdout_rows[features], holdout_rows["residual"])],
              verbose=False)

    table["predicted_residual"] = model.predict(table[features])
    table["corrected_z"] = table["predicted_z"] + table["predicted_residual"]
    table["corrected_m3s"] = to_flow(table["corrected_z"].to_numpy(), positions, target_norm)

    # Sensitivity only: all rounds with no stopping on 2012. Not saved and not used for anything else.
    fixed = xgb.XGBRegressor(**{k: v for k, v in params.items() if k != "early_stopping_rounds"})
    fixed.fit(fit[features], fit["residual"], verbose=False)
    table["_fixed_m3s"] = to_flow(table["predicted_z"].to_numpy() + fixed.predict(table[features]), positions,
                                  target_norm)

    thr = pd.read_csv(REPO_ROOT / "configs" / "flow_thresholds.csv", dtype={"gauge_id": str}).set_index("gauge_id")
    w = train_cfg["warning"]
    thresholds = thr[f"q{round(w['threshold_quantile'] * 100):d}"]
    leads = headline_lead_days(w["assumed_data_lag_days"], H)
    top_n = cfg["scoring"]["peak_top_n"]

    holdout = table[table["split"] == "holdout"]
    before = score_holdout(holdout, "predicted_m3s", thresholds, ids, H, leads, top_n)
    after = score_holdout(holdout, "corrected_m3s", thresholds, ids, H, leads, top_n)
    fixed_scores = score_holdout(holdout, "_fixed_m3s", thresholds, ids, H, leads, top_n)

    gauges = before[0][["scored_days"]].copy()
    gauges["nse_before"], gauges["nse_after"] = before[0]["nse"], after[0]["nse"]
    gauges["kge_before"], gauges["kge_after"] = before[0]["kge"], after[0]["kge"]
    gauges["peak_before"], gauges["peak_after"] = before[2], after[2]
    for name, part in (("before", before[1]), ("after", after[1])):
        for col in ("flood_days", "hits", "false_alarms"):
            gauges[f"{col}_{name}"] = part[col]
    gauges = gauges.reset_index()

    nse_change = {}
    for lead in range(1, H + 1):
        g = gauges[gauges["lead_day"] == lead]
        delta = g["nse_after"] - g["nse_before"]
        nse_change[str(lead)] = {"improved": int((delta > 0).sum()), "worsened": int((delta < 0).sum()),
                                 "unchanged": int((delta == 0).sum()), "undefined": int(delta.isna().sum()),
                                 "median_change": float(delta.median())}

    zero_day = holdout_rows["observed_m3s"].to_numpy() == 0
    corrected_rows = table.loc[holdout_rows.index, "predicted_residual"].to_numpy()
    resid = holdout_rows["residual"].to_numpy()
    importance = model.get_booster().get_score(importance_type="gain")
    summary = {
        "ensemble": cfg["ensemble"]["run_name"], "members": cfg["ensemble"]["members"],
        "xgboost_version": xgb.__version__, "params": params, "features": features,
        "rows": {"total": len(table), "fit_observed": len(fit), "holdout_observed": len(holdout_rows),
                 "boundary_excluded": int((table["split"] == "boundary").sum()),
                 "fit_forecast_dates": [str(fit["sample_date"].min().date()), str(fit["sample_date"].max().date())],
                 "holdout_forecast_dates": [str(holdout["sample_date"].min().date()),
                                            str(holdout["sample_date"].max().date())]},
        "best_round": int(model.best_iteration) + 1, "max_rounds": int(params["n_estimators"]),
        "z_rmse": {"fit_before": rmse(fit["residual"]),
                   "fit_after": rmse(fit["residual"] - table.loc[fit.index, "predicted_residual"]),
                   "holdout_before": rmse(resid), "holdout_after": rmse(resid - corrected_rows),
                   "holdout_zero_days_before": rmse(resid[zero_day]),
                   "holdout_zero_days_after": rmse((resid - corrected_rows)[zero_day]),
                   "holdout_flowing_days_before": rmse(resid[~zero_day]),
                   "holdout_flowing_days_after": rmse((resid - corrected_rows)[~zero_day])},
        "before": {str(k): lead_row(*before, k) for k in leads},
        "after": {str(k): lead_row(*after, k) for k in leads},
        "nse_change": nse_change,
        "sensitivity_all_rounds_no_stopping": {str(k): lead_row(*fixed_scores, k) for k in leads},
        "gain_importance": dict(sorted(importance.items(), key=lambda kv: -kv[1])),
        "notes": ["2012 chose the stopping round and also gives these scores.",
                  "Ensemble selection also used 2009-2012, so 2012 is not untouched.",
                  "Future rain is observed IMD rain, so scores are optimistic against a real forecast.",
                  "Flood counts are pooled over gauges; the test years were not read."],
    }

    out = cfg["outputs"]
    model_path = REPO_ROOT / out["model"]
    if model_path.exists():
        print(f"ERROR: {model_path} already exists; not overwriting", file=sys.stderr)
        return 1
    model.save_model(model_path)
    table.drop(columns="_fixed_m3s").to_parquet(REPO_ROOT / out["table"], index=False)
    gauges.to_csv(REPO_ROOT / out["gauges"], index=False)
    (REPO_ROOT / out["summary_json"]).write_text(json.dumps(summary, indent=1))
    write_markdown(REPO_ROOT / out["summary_md"], summary, leads)
    print(json.dumps({k: summary[k] for k in ("rows", "best_round", "z_rmse", "before", "after", "nse_change",
                                              "sensitivity_all_rounds_no_stopping", "gain_importance")}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
