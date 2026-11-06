"""Hydrological skill metrics in m3/s, computed on observed days only.

All functions take 1-D float arrays; NaN in either array means "not scored".
Undefined values (no scored days, zero variance) are NaN, never a default score.
"""

import math

import numpy as np


def _paired(pred: np.ndarray, obs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    pred, obs = np.asarray(pred, dtype="float64"), np.asarray(obs, dtype="float64")
    keep = np.isfinite(pred) & np.isfinite(obs)
    return pred[keep], obs[keep]


def nse(pred: np.ndarray, obs: np.ndarray) -> float:
    """Nash-Sutcliffe efficiency: 1 - SSE / variance of obs around its mean."""
    p, o = _paired(pred, obs)
    if o.size < 2:
        return math.nan
    denom = np.sum((o - o.mean()) ** 2)
    return math.nan if denom == 0 else float(1.0 - np.sum((p - o) ** 2) / denom)


def kge(pred: np.ndarray, obs: np.ndarray) -> float:
    """Kling-Gupta efficiency (2009): 1 - sqrt((r-1)^2 + (alpha-1)^2 + (beta-1)^2),
    alpha = std(pred)/std(obs), beta = mean(pred)/mean(obs)."""
    p, o = _paired(pred, obs)
    if o.size < 2 or o.std() == 0 or o.mean() == 0:
        return math.nan
    r = 0.0 if p.std() == 0 else float(np.corrcoef(p, o)[0, 1])
    alpha, beta = p.std() / o.std(), p.mean() / o.mean()
    return float(1.0 - math.sqrt((r - 1) ** 2 + (alpha - 1) ** 2 + (beta - 1) ** 2))


def flood_contingency(pred: np.ndarray, obs: np.ndarray, threshold: float) -> dict:
    """Day-by-day detection of flow strictly above ``threshold`` on scored days."""
    p, o = _paired(pred, obs)
    flood, alarm = o > threshold, p > threshold
    hits = int(np.sum(flood & alarm))
    misses = int(np.sum(flood & ~alarm))
    false_alarms = int(np.sum(~flood & alarm))
    return {
        "scored_days": int(o.size), "flood_days": hits + misses, "hits": hits, "misses": misses,
        "false_alarms": false_alarms,
        "hit_rate": hits / (hits + misses) if hits + misses else math.nan,
        "false_alarm_ratio": false_alarms / (hits + false_alarms) if hits + false_alarms else math.nan,
    }
