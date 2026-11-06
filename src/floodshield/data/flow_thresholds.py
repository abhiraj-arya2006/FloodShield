"""Per-gauge high-flow thresholds (TRAIN period only) and high-flow event counts.

Event definition: an event is a run of consecutive days with observed flow
strictly above the threshold. A missing day ends an event (we cannot know
whether flow stayed high), and missing days never count as above.
"""

from collections.abc import Sequence

import numpy as np
import pandas as pd


def train_thresholds(q_train: pd.DataFrame, quantiles: Sequence[float]) -> pd.DataFrame:
    """Rows = gauges, columns q90/q95/... from observed (non-missing) train days."""
    rows = {}
    for gid in q_train.columns:
        obs = q_train[gid].dropna()
        if obs.empty:
            raise ValueError(f"gauge {gid} has no observed train days")
        rows[gid] = {f"q{round(q * 100):d}": float(obs.quantile(q)) for q in quantiles}
        rows[gid]["n_train_obs_days"] = int(obs.size)
    out = pd.DataFrame.from_dict(rows, orient="index")
    out.index.name = "gauge_id"
    return out


def count_events(values: np.ndarray, threshold: float) -> tuple[int, int]:
    """(days above, separate events) for one series; NaN = missing day."""
    above_days = events = 0
    in_event = False
    for v in np.asarray(values, dtype="float64"):
        if np.isnan(v) or v <= threshold:
            in_event = False
            continue
        above_days += 1
        if not in_event:
            events += 1
            in_event = True
    return above_days, events


def period_thresholds(q: pd.DataFrame, start: str, end: str,
                      quantiles: Sequence[float]) -> pd.DataFrame:
    """Thresholds from the days in [start, end] only (``q`` indexed by date)."""
    return train_thresholds(q.loc[pd.Timestamp(start):pd.Timestamp(end)], quantiles)
