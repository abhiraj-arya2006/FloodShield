"""Score a trained checkpoint in m3/s, with reference baselines and saved predictions.

Default split: validation. The test split is locked: it needs the explicit
--final-test flag and prints a loud warning. Never tune on test results.

Usage:
    python scripts/evaluate.py [--run-name stg_mamba]
    python scripts/evaluate.py --split test --final-test     # final evaluation only
    python scripts/evaluate.py --run-name NAME --members RUN1 RUN2 RUN3
        # ensemble: mean of the members' predictions in standardised log1p space,
        # scored and saved under NAME
"""

import argparse
import json
import sys
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
    flood_per_gauge,
    flood_summary,
    lead_summary,
    persistence_forecast,
    score_per_gauge,
    target_matrix,
)
from floodshield.inference.risk_thresholds import headline_lead_days
from floodshield.models.stg_mamba import STGMamba, config_from_yaml
from floodshield.training.trainer import make_loader, predict
from floodshield.utils.device import get_device

REPO_ROOT = Path(__file__).resolve().parents[1]
SHORT = {"validation": "val", "test": "test"}


def rp(p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else REPO_ROOT / path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--split", choices=["validation", "test"], default="validation")
    parser.add_argument("--final-test", action="store_true")
    parser.add_argument("--run-name", default="stg_mamba")
    parser.add_argument("--members", nargs="+", default=None, help="checkpoints to average, by run name")
    args = parser.parse_args()

    train_cfg = yaml.safe_load((REPO_ROOT / "configs" / "training.yaml").read_text())
    processed = rp(train_cfg["processed_dir"])
    data = load_split(processed, args.split, final_test=args.final_test)
    ds, q, dates, ids, t_index = (data["dataset"], data["q_m3s"], data["dates"], data["gauge_ids"],
                                  data["t_index"])
    H = data["horizon_days"]
    short = SHORT[args.split]
    # The default run keeps the plain names; other runs must not overwrite them.
    prefix = short if args.run_name == "stg_mamba" else f"{args.run_name}_{short}"

    device = get_device(train_cfg["device"], train_cfg["fallback_device"])
    members = args.members or [args.run_name]
    member_preds, ckpts = [], []
    for member in members:
        ckpt = torch.load(rp(train_cfg["checkpoint_dir"]) / f"{member}_best.pt", map_location="cpu",
                          weights_only=False)
        model_cfg = ckpt["model_cfg"]
        if ckpt["gauge_ids"] != ids:
            print(f"ERROR: checkpoint {member} gauge order differs from the data", file=sys.stderr)
            return 1
        edges = pd.read_csv(rp(model_cfg["graph"]["edges_file"]), dtype={"source": str, "target": str})
        cfg = config_from_yaml(model_cfg, model_cfg["input"]["feature_list"], ckpt["n_static"], len(ids))
        model = STGMamba(cfg, edges, ids).to(device)
        model.load_state_dict(ckpt["model_state"])
        member_preds.append(predict(model, make_loader(ds, train_cfg["eval_batch_size"], shuffle=False), device))
        ckpts.append(ckpt)

    norm = json.loads((processed / "normalisers.json").read_text())
    if norm["target"]["gauge_ids"] != ids:
        print("ERROR: normaliser gauge order differs from the data", file=sys.stderr)
        return 1
    tnorm = Normaliser.from_dict(norm["target"])

    pred_z = np.mean(member_preds, axis=0)
    pred_raw = np.stack([tnorm.inverse(pred_z[:, k]) for k in range(H)], axis=1)
    negative = int((pred_raw < 0).sum())
    pred = np.clip(pred_raw, 0.0, None)   # expm1 of a slightly negative log flow
    obs = target_matrix(q, t_index, H)

    # Baselines (references only).
    tr = train_cfg["split"]["train"]
    clim = fit_climatology(q, dates, tr["start"], tr["end"], train_cfg["baselines"]["climatology_window_days"])
    clim_pred = climatology_forecast(clim, dates, t_index, H)
    pers_pred = persistence_forecast(q, t_index, H)

    # Thresholds and lead days from config.
    thr = pd.read_csv(REPO_ROOT / "configs" / "flow_thresholds.csv", dtype={"gauge_id": str}).set_index("gauge_id")
    w = train_cfg["warning"]
    thresholds = thr[f"q{round(w['threshold_quantile'] * 100):d}"]
    leads = headline_lead_days(w["assumed_data_lag_days"], H)

    # Model on all of its observed days.
    scores = score_per_gauge(pred, obs, ids)
    flood = flood_per_gauge(pred, obs, thresholds, ids, leads)

    # All three on identical days: observed target AND observed flow on day t.
    common = np.isfinite(obs) & np.isfinite(pers_pred) & np.isfinite(clim_pred)
    def on_common(a: np.ndarray) -> np.ndarray:
        return np.where(common, a, np.nan)
    comparison, comparison_flood, score_tables = {}, {}, {}
    for name, forecast in (("model", pred), ("climatology", clim_pred), ("persistence", pers_pred)):
        table = score_per_gauge(on_common(forecast), obs, ids)
        score_tables[name] = table
        comparison[name] = {int(k): {"median_nse": float(g["nse"].median()), "median_kge": float(g["kge"].median())}
                            for k, g in table.groupby("lead_day")}
        comparison_flood[name] = flood_summary(flood_per_gauge(on_common(forecast), obs, thresholds, ids, leads))
    beats = {}
    for name in ("climatology", "persistence"):
        beats[name] = {}
        for lead in range(1, H + 1):
            m = score_tables["model"].query("lead_day == @lead").set_index("gauge_id")
            b = score_tables[name].query("lead_day == @lead").set_index("gauge_id")
            beats[name][lead] = {"nse": int((m["nse"] > b["nse"]).sum()), "kge": int((m["kge"] > b["kge"]).sum())}

    # Save predictions: every sample, gauge and lead.
    out_dir = REPO_ROOT / "outputs"
    out_dir.mkdir(exist_ok=True)
    n, N = len(t_index), len(ids)
    t_dates = dates[t_index]
    target_dates = np.stack([dates[t_index + k + 1].to_numpy() for k in range(H)], axis=1)
    frame = pd.DataFrame({
        "sample_date": np.repeat(t_dates.to_numpy(), H * N),
        "target_date": np.repeat(target_dates.ravel(), N),
        "lead_day": np.tile(np.repeat(np.arange(1, H + 1), N), n),
        "gauge_id": np.tile(np.array(ids, dtype=object), n * H),
        "predicted_m3s": pred.ravel(),
        "observed_m3s": obs.ravel(),
        "mask": np.isfinite(obs).ravel().astype(np.int8),
        "predicted_z": pred_z.ravel(),
    })
    frame["gauge_id"] = frame["gauge_id"].astype(str)
    pred_path = out_dir / f"{prefix}_predictions.parquet"
    frame.to_parquet(pred_path, index=False)
    scores.to_csv(out_dir / f"{prefix}_scores.csv", index=False)
    flood.to_csv(out_dir / f"{prefix}_flood.csv", index=False)
    pd.concat({k: v.set_index(["gauge_id", "lead_day"]) for k, v in score_tables.items()}, axis=1).to_csv(
        out_dir / f"{prefix}_baseline_comparison.csv")

    summary = {
        "split": args.split, "run_name": args.run_name, "members": members, "decoder": cfg.decoder,
        "best_epoch": [c["epoch"] for c in ckpts] if args.members else ckpts[0]["epoch"],
        "best_val_loss": [c["val_loss"] for c in ckpts] if args.members else ckpts[0]["val_loss"],
        "samples": n, "gauges": N,
        "negative_predictions_clipped": negative,
        "future_rain_mode": train_cfg["future_rain"]["mode"],
        "note": "future_rain mode observed uses real IMD rain for t+1..t+H, so these scores are optimistic "
                "compared with using a real rain forecast.",
        "scores": lead_summary(scores), "flood": flood_summary(flood),
        "flood_threshold": f"q{round(w['threshold_quantile'] * 100):d}",
        "comparison_common_days": comparison, "comparison_flood_common_days": comparison_flood,
        "model_beats_baseline_gauges": beats,
    }
    metrics_dir = rp(train_cfg["metrics_dir"])
    metrics_dir.mkdir(parents=True, exist_ok=True)
    (metrics_dir / f"{args.run_name}_{short}_metrics.json").write_text(json.dumps(summary, indent=1))
    print(json.dumps(summary, indent=1))
    print(f"\nWrote {pred_path.relative_to(REPO_ROOT)} ({len(frame)} rows)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
