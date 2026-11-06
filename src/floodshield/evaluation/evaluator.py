"""Per-gauge, per-lead scoring plus reference baselines.

Baselines are REFERENCES only: climatology uses training-period flow; persistence
uses observed flow on the sample date t and is never a model input.

Arrays: predictions [n_samples, H, N] in m3/s, indexed by sample position t.
"""

from collections.abc import Sequence

import numpy as np
import pandas as pd

from floodshield.evaluation.metrics import flood_contingency, kge, nse


def target_matrix(q: np.ndarray, t_index: np.ndarray, horizon: int) -> np.ndarray:
    """Observed flow for each sample and lead: [n_samples, H, N], NaN where missing."""
    return np.stack([q[t_index + lead] for lead in range(1, horizon + 1)], axis=1)


def persistence_forecast(q: np.ndarray, t_index: np.ndarray, horizon: int) -> np.ndarray:
    """Every lead repeats the flow observed on day t; NaN when day t is missing."""
    return np.repeat(q[t_index][:, None, :], horizon, axis=1)


def calendar_bin(dates: pd.DatetimeIndex) -> np.ndarray:
    """0..365 position of each date in a leap-year calendar, so a calendar day keeps
    the same bin in every year."""
    dates = pd.DatetimeIndex(dates)
    return np.array([pd.Timestamp(2000, m, d).day_of_year - 1 for m, d in zip(dates.month, dates.day)])


def fit_climatology(q: np.ndarray, dates: pd.DatetimeIndex, start: str, end: str,
                    window_days: int) -> np.ndarray:
    """Mean observed flow per calendar day from [start, end] only: [366, N] in m3/s,
    using a centred circular window of ``window_days`` calendar days."""
    if window_days < 1 or window_days % 2 == 0:
        raise ValueError("climatology window must be an odd number of days")
    dates = pd.DatetimeIndex(dates)
    keep = np.asarray((dates >= pd.Timestamp(start)) & (dates <= pd.Timestamp(end)))
    bins, values = calendar_bin(dates[keep]), q[keep]
    n = q.shape[1]
    sums, counts = np.zeros((366, n)), np.zeros((366, n))
    observed = np.isfinite(values)
    np.add.at(sums, bins, np.where(observed, values, 0.0))
    np.add.at(counts, bins, observed.astype("float64"))
    half = window_days // 2
    sum_w = sum(np.roll(sums, k, axis=0) for k in range(-half, half + 1))
    cnt_w = sum(np.roll(counts, k, axis=0) for k in range(-half, half + 1))
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(cnt_w > 0, sum_w / cnt_w, np.nan)


def climatology_forecast(clim: np.ndarray, dates: pd.DatetimeIndex, t_index: np.ndarray,
                         horizon: int) -> np.ndarray:
    dates = pd.DatetimeIndex(dates)
    return np.stack([clim[calendar_bin(dates[t_index + lead])] for lead in range(1, horizon + 1)], axis=1)


def score_per_gauge(pred: np.ndarray, obs: np.ndarray, gauge_ids: Sequence[str]) -> pd.DataFrame:
    """Long table: gauge_id, lead_day, scored_days, nse, kge."""
    rows = []
    for k in range(pred.shape[1]):
        for j, gid in enumerate(gauge_ids):
            p, o = pred[:, k, j], obs[:, k, j]
            rows.append({"gauge_id": gid, "lead_day": k + 1,
                         "scored_days": int(np.sum(np.isfinite(p) & np.isfinite(o))),
                         "nse": nse(p, o), "kge": kge(p, o)})
    return pd.DataFrame(rows)


def flood_per_gauge(pred: np.ndarray, obs: np.ndarray, thresholds: pd.Series,
                    gauge_ids: Sequence[str], leads: Sequence[int]) -> pd.DataFrame:
    rows = []
    for lead in leads:
        for j, gid in enumerate(gauge_ids):
            rows.append({"gauge_id": gid, "lead_day": lead,
                         **flood_contingency(pred[:, lead - 1, j], obs[:, lead - 1, j], float(thresholds[gid]))})
    return pd.DataFrame(rows)


def lead_summary(scores: pd.DataFrame, worst_n: int = 5) -> dict:
    """Median NSE/KGE per lead, plus the worst gauges by each metric."""
    out = {}
    for lead, g in scores.groupby("lead_day"):
        entry = {"median_nse": float(g["nse"].median()), "median_kge": float(g["kge"].median()),
                 "median_scored_days": float(g["scored_days"].median()),
                 "min_scored_days": int(g["scored_days"].min())}
        for metric in ("nse", "kge"):
            worst = g.nsmallest(worst_n, metric)
            entry[f"worst_{metric}"] = [{"gauge_id": r.gauge_id, metric: float(getattr(r, metric))}
                                        for r in worst.itertuples()]
        out[int(lead)] = entry
    return out


def flood_summary(flood: pd.DataFrame, worst_n: int = 5) -> dict:
    """Totals pooled over gauges, medians across gauges, and worst gauges by hit rate."""
    out = {}
    for lead, g in flood.groupby("lead_day"):
        hits, misses, fa = int(g["hits"].sum()), int(g["misses"].sum()), int(g["false_alarms"].sum())
        out[int(lead)] = {
            "flood_days": int(g["flood_days"].sum()), "hits": hits, "misses": misses, "false_alarms": fa,
            "pooled_hit_rate": hits / (hits + misses) if hits + misses else None,
            "pooled_false_alarm_ratio": fa / (hits + fa) if hits + fa else None,
            "median_hit_rate": float(g["hit_rate"].median()),
            "median_false_alarm_ratio": float(g["false_alarm_ratio"].median()),
            "gauges_without_any_alarm": int((g["hits"] + g["false_alarms"] == 0).sum()),
            "worst_hit_rate": [
                {"gauge_id": r.gauge_id, "hit_rate": float(r.hit_rate), "flood_days": int(r.flood_days),
                 "false_alarms": int(r.false_alarms)}
                for r in g.sort_values(["hit_rate", "flood_days"], ascending=[True, False]).head(worst_n).itertuples()],
        }
    return out
