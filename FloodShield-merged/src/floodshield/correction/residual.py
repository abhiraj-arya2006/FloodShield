"""Residual table and scoring for the XGBoost correction of an STG-Mamba forecast.

One row per (gauge, forecast date t, lead k). The target is
    residual = observed standardised log1p flow - forecast standardised log1p flow,
NaN on days with no observed flow. Features never contain observed flow: they are
the forecast, the lead, the target month, rain and static catchment traits.
"""

from collections.abc import Sequence

import numpy as np
import pandas as pd

from floodshield.data.preprocessing import Normaliser

BASE_FEATURES = ("predicted_z", "lead_day", "month")


def rain_feature_names(past_windows: Sequence[int], horizon: int) -> list[str]:
    return [f"rain_past_{n}d_mm" for n in past_windows] + [f"rain_t{k}_mm" for k in range(1, horizon + 1)]


def rain_features(rain: pd.DataFrame, past_windows: Sequence[int], horizon: int) -> pd.DataFrame:
    """``rain`` [date x gauge] in mm/day -> long table indexed by (sample_date, gauge_id):
    totals over t-n+1..t, plus the rain of each day t+1..t+H."""
    if not rain.index.is_monotonic_increasing or (np.diff(rain.index.values) != np.timedelta64(1, "D")).any():
        raise ValueError("rain must be on a continuous daily index")
    columns = {f"rain_past_{n}d_mm": rain.rolling(n).sum() for n in past_windows}
    columns.update({f"rain_t{k}_mm": rain.shift(-k) for k in range(1, horizon + 1)})
    long = {name: wide.stack(future_stack=True) for name, wide in columns.items()}
    out = pd.DataFrame(long)
    out.index.names = ["sample_date", "gauge_id"]
    return out


def assign_split(sample_dates: pd.Series, horizon: int, fit: dict, holdout: dict) -> pd.Series:
    """fit / holdout when ALL target days t+1..t+H lie in that period, otherwise "boundary"."""
    first = sample_dates + pd.Timedelta(days=1)
    last = sample_dates + pd.Timedelta(days=horizon)
    def inside(period: dict) -> pd.Series:
        return (first >= pd.Timestamp(period["start"])) & (last <= pd.Timestamp(period["end"]))
    split = pd.Series("boundary", index=sample_dates.index, dtype=object)
    split[inside(fit)] = "fit"
    split[inside(holdout)] = "holdout"
    return split


def build_table(predictions: pd.DataFrame, rain: pd.DataFrame, static: pd.DataFrame, target_norm: Normaliser,
                gauge_ids: Sequence[str], past_windows: Sequence[int], horizon: int, fit: dict,
                holdout: dict) -> pd.DataFrame:
    """``predictions``: saved forecasts (sample_date, target_date, lead_day, gauge_id, predicted_z,
    predicted_m3s, observed_m3s, mask). ``static``: traits indexed by gauge id."""
    position = pd.Series(np.arange(len(gauge_ids)), index=list(gauge_ids))
    table = predictions[["gauge_id", "sample_date", "target_date", "lead_day", "predicted_z", "predicted_m3s",
                         "observed_m3s", "mask"]].copy()
    table["month"] = table["target_date"].dt.month
    table["split"] = assign_split(table["sample_date"], horizon, fit, holdout)
    pos = table["gauge_id"].map(position).to_numpy()
    observed = table["observed_m3s"].to_numpy(dtype="float64")
    # The same missing-day mask as training: no observed flow means no target.
    observed = np.where(table["mask"].to_numpy() == 1, observed, np.nan)
    observed_z = (np.log1p(observed) - target_norm.mean[pos]) / target_norm.std[pos]
    table["observed_z"] = observed_z
    table["residual"] = observed_z - table["predicted_z"].to_numpy(dtype="float64")
    weather = rain_features(rain, past_windows, horizon)
    table = table.join(weather, on=["sample_date", "gauge_id"], how="left")
    table = table.join(static, on="gauge_id", how="left")
    features = feature_columns(past_windows, horizon, static.columns)
    if table[features].isna().any().any():
        raise ValueError("missing feature values: " + str(table[features].isna().sum()[lambda s: s > 0].to_dict()))
    return table


def feature_columns(past_windows: Sequence[int], horizon: int, static_columns: Sequence[str]) -> list[str]:
    return [*BASE_FEATURES, *rain_feature_names(past_windows, horizon), *static_columns]


def to_flow(z: np.ndarray, gauge_positions: np.ndarray, target_norm: Normaliser) -> np.ndarray:
    """Standardised log1p flow -> m3/s with the training-year scaling, floored at 0 as in evaluation."""
    log_flow = np.asarray(z, dtype="float64") * target_norm.std[gauge_positions] + target_norm.mean[gauge_positions]
    return np.clip(np.expm1(log_flow), 0.0, None)


def to_cube(frame: pd.DataFrame, column: str, horizon: int, gauge_ids: Sequence[str]) -> np.ndarray:
    """Long forecast rows -> [n_samples, H, N] in sample, lead and gauge order."""
    order = pd.Series(np.arange(len(gauge_ids)), index=list(gauge_ids))
    keyed = frame.assign(_g=frame["gauge_id"].map(order)).sort_values(["sample_date", "lead_day", "_g"])
    values = keyed[column].to_numpy(dtype="float64")
    return values.reshape(-1, horizon, len(gauge_ids))


def peak_ratio(pred: np.ndarray, obs: np.ndarray, top_n: int) -> float:
    """Summed predicted over summed observed flow on the ``top_n`` largest observed days."""
    keep = np.isfinite(obs)
    p, o = pred[keep], obs[keep]
    if o.size < top_n:
        return float("nan")
    top = np.argsort(o)[-top_n:]
    total = o[top].sum()
    return float(p[top].sum() / total) if total > 0 else float("nan")
