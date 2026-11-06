"""Build leakage-safe training arrays, normalisers, static features and flow thresholds.

Reads configs/model.yaml, configs/training.yaml, configs/data.yaml,
configs/selected_gauges.csv, the CAMELS forcing table and observed streamflow.
All statistics (normalisers, thresholds, climate descriptors) use the TRAIN
period only. Writes:

- data/processed/training/arrays.npz: x [T,N,F], rain [T,N], y [T,N], mask [T,N],
  q_m3s [T,N], static [N,S], dates, t_index_<split>
- data/processed/training/normalisers.json (incl. target inverse transform)
- data/processed/training/static_features.csv (raw and standardised)
- configs/flow_thresholds.csv (tracked)
- outputs/flow_events.csv, outputs/masked_fraction.csv (git-ignored)

Usage:
    python scripts/build_training_data.py
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from floodshield.data.camels_ind_loader import load_streamflow
from floodshield.data.feature_engineering import build_static_features, train_climate_descriptors
from floodshield.data.flow_thresholds import count_events, period_thresholds
from floodshield.data.preprocessing import (
    apply_feature_normalisers,
    fit_static_normaliser,
    fit_train_statistics,
)
from floodshield.data.sequence_dataset import (
    WindowDataset,
    announce_future_rain_mode,
    sample_indices,
)
from floodshield.inference.risk_thresholds import headline_lead_days

REPO_ROOT = Path(__file__).resolve().parents[1]
SPLITS = ("train", "validation", "test")


def rp(p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else REPO_ROOT / path


def load(name: str) -> dict:
    return yaml.safe_load((REPO_ROOT / "configs" / name).read_text())


def main() -> int:
    data_cfg, model_cfg, train_cfg = load("data.yaml"), load("model.yaml"), load("training.yaml")
    L = int(model_cfg["input"]["window_days"])
    H = int(model_cfg["output"]["horizon_days"])
    feats = list(model_cfg["input"]["feature_list"])
    splits = {s: train_cfg["split"][s] for s in SPLITS}
    tr = splits["train"]

    announce_future_rain_mode(train_cfg["future_rain"]["mode"], train_cfg["future_rain"].get("noisy"))

    gauges = pd.read_csv(rp(data_cfg["paths"]["selected_gauges"]), dtype={"gauge_id": str})
    ids = gauges["gauge_id"].tolist()
    basin = gauges.set_index("gauge_id")["basin"]

    # Dynamic features -> [T, N, F]
    forc = pd.read_parquet(rp(data_cfg["paths"]["processed"]) / "camels_forcings_selected.parquet")
    dates = pd.DatetimeIndex(sorted(forc["date"].unique()))
    cube = np.stack([forc.pivot(index="date", columns="gauge_id", values=f).loc[dates, ids].to_numpy()
                     for f in feats], axis=-1)
    q = load_streamflow(rp(data_cfg["paths"]["raw"]["camels_ind"]), ids)
    if not q.index.equals(dates):
        print("ERROR: streamflow and forcing dates differ", file=sys.stderr)
        return 1

    log1p_feats = train_cfg["normalisation"]["dynamic_log1p_features"]
    q_arr = q.to_numpy()
    norms, tnorm = fit_train_statistics(dates, cube, q_arr, feats, log1p_feats, tr["start"], tr["end"])
    x = apply_feature_normalisers(cube, feats, norms)
    # Future rain uses exactly the prcp-channel transform.
    rain_raw = forc.pivot(index="date", columns="gauge_id", values="prcp").loc[dates, ids].to_numpy()
    if "prcp" in norms:
        rain_norm = norms["prcp"]
    else:
        rain_norm = fit_train_statistics(dates, rain_raw[..., None], q_arr, ["prcp"], log1p_feats,
                                         tr["start"], tr["end"])[0]["prcp"]
    rain = rain_norm.transform(rain_raw)
    y = tnorm.transform(q_arr)
    mask = np.isfinite(q_arr).astype(np.float32)

    # Static features
    climate = train_climate_descriptors(forc, tr["start"], tr["end"])
    mi = model_cfg["input"]
    static_raw = build_static_features(rp(data_cfg["paths"]["raw"]["camels_ind"]), ids,
                                       mi["static_features"], climate,
                                       mi["static_excluded_files"], mi["static_excluded_columns"])
    snorm = fit_static_normaliser(static_raw.to_numpy())
    static = snorm.transform(static_raw.to_numpy())

    # Thresholds (train only) and events per split
    fcfg = train_cfg["flow_thresholds"]
    thr = period_thresholds(q, tr["start"], tr["end"], fcfg["quantiles"])
    thr_path = REPO_ROOT / "configs" / "flow_thresholds.csv"
    thr.reset_index().to_csv(thr_path, index=False, float_format="%.4f")
    reread = pd.read_csv(thr_path, dtype={"gauge_id": str})
    assert reread["gauge_id"].tolist() == ids
    ev_col = f"q{round(fcfg['event_quantile'] * 100):d}"
    ev_rows = []
    for gid in ids:
        row = {"gauge_id": gid, "basin": basin[gid], "threshold_m3s": thr.loc[gid, ev_col]}
        for s, p in splits.items():
            days, events = count_events(q.loc[p["start"]:p["end"], gid].to_numpy(), thr.loc[gid, ev_col])
            row[f"{s}_days_above"], row[f"{s}_events"] = days, events
        ev_rows.append(row)
    events = pd.DataFrame(ev_rows)
    events["flag_few_test_events"] = events["test_events"] < fcfg["min_test_events"]

    # Samples per split
    t_index = {s: sample_indices(dates, mask, p["start"], p["end"], L, H) for s, p in splits.items()}
    masked = {}
    for s, ti in t_index.items():
        win = np.stack([mask[t + 1:t + 1 + H] for t in ti])  # [n, H, N]
        masked[s] = 1.0 - win.mean(axis=(0, 1))
    masked_df = pd.DataFrame(masked, index=ids)
    masked_df.index.name = "gauge_id"

    out = rp(train_cfg["processed_dir"])
    out.mkdir(parents=True, exist_ok=True)
    np.savez(out / "arrays.npz", x=x.astype(np.float32), rain=rain.astype(np.float32),
             y=np.nan_to_num(y, nan=0.0).astype(np.float32), mask=mask, static=static.astype(np.float32),
             q_m3s=q_arr, window_days=np.int64(L), horizon_days=np.int64(H),
             dates=np.asarray(dates.strftime("%Y-%m-%d"), dtype="U10"), gauge_ids=np.array(ids, dtype="U5"),
             **{f"t_index_{s}": v for s, v in t_index.items()})
    (out / "normalisers.json").write_text(json.dumps({
        "feature_list": feats, "window_days": L, "horizon_days": H,
        "fit_period": tr, "dynamic": {k: v.to_dict() for k, v in norms.items()},
        "future_rain": rain_norm.to_dict(),
        "target": {**tnorm.to_dict(), "gauge_ids": ids,
                   "inverse": "q_m3s = expm1(z * std + mean), per gauge"},
        "static": {**snorm.to_dict(), "columns": static_raw.columns.tolist()},
    }, indent=1))
    pd.concat({"raw": static_raw, "standardised": pd.DataFrame(static, index=ids, columns=static_raw.columns)},
              axis=1).to_csv(out / "static_features.csv")
    (REPO_ROOT / "outputs").mkdir(exist_ok=True)
    events.to_csv(REPO_ROOT / "outputs" / "flow_events.csv", index=False)
    masked_df.to_csv(REPO_ROOT / "outputs" / "masked_fraction.csv", float_format="%.4f")

    # Datasets: shape check on one sample per split
    print(f"\nL={L} H={H} | dynamic features {feats} | static features {static_raw.columns.tolist()}")
    for s in SPLITS:
        ds = WindowDataset(x, rain, y, mask, static, dates, t_index[s], L, H)
        b = ds[0]
        print(f"{s:10s} samples={len(ds):5d}  t={b['t']}..{ds[len(ds) - 1]['t']}  "
              + "  ".join(f"{k}{tuple(v.shape)}" for k, v in b.items() if k != "t"))
    nbytes = sum(a.nbytes for a in (x.astype(np.float32), rain.astype(np.float32), y.astype(np.float32),
                                    mask, static.astype(np.float32)))
    print(f"arrays: x{x.shape} rain{rain.shape} y{y.shape} mask{mask.shape} static{static.shape}"
          f" | float32 total {nbytes / 1e6:.1f} MB | dates {dates[0].date()}..{dates[-1].date()}")
    wcfg = train_cfg["warning"]
    print("warning headline_lead_days:", headline_lead_days(wcfg["assumed_data_lag_days"], H))
    pd.set_option("display.width", 250)
    print("\nMasked target fraction per gauge per split:\n", masked_df.round(3).to_string())
    print("\nThresholds (m3/s) and events:\n",
          thr.join(events.set_index("gauge_id").drop(columns=["threshold_m3s"])).to_string(float_format="%.1f"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
