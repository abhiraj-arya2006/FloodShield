"""Alert-margin sweep and selection rule.

An alert is raised when forecast flow >= threshold * (1 - margin). The margin is a
dimensionless fraction of each gauge's own threshold, so one value means the same
thing at every gauge whatever its size: 0.2 alerts at 80% of the threshold in m3/s.
A flood day is observed flow strictly above the threshold.
"""

import numpy as np
import pandas as pd


def alert_counts(pred: np.ndarray, obs: np.ndarray, threshold: np.ndarray, margin: float) -> dict:
    """Day counts over paired 1-D arrays. Rows with no observed flow must already be removed."""
    alert = pred >= threshold * (1.0 - margin)
    flood = obs > threshold
    hits = int(np.sum(flood & alert))
    false_alarms = int(np.sum(~flood & alert))
    misses = int(np.sum(flood & ~alert))
    correct_negatives = int(np.sum(~flood & ~alert))
    alerts = hits + false_alarms
    return {
        "scored_days": int(obs.size), "flood_days": hits + misses, "alert_days": alerts, "hits": hits,
        "misses": misses, "false_alarms": false_alarms, "correct_negatives": correct_negatives,
        "hit_rate": hits / (hits + misses) if hits + misses else float("nan"),
        "false_alarm_share": false_alarms / alerts if alerts else float("nan"),
        "accuracy": (hits + correct_negatives) / obs.size if obs.size else float("nan"),
    }


def select_margin(sweep: pd.DataFrame, hit_target: float = 0.90, far_limit: float = 0.60,
                  fallback_far_limit: float = 0.50) -> dict:
    """``sweep``: one row per (margin, lead_day) with hit_rate and false_alarm_share.

    Rule: the smallest margin with hit rate >= hit_target AND false-alarm share <= far_limit
    at every lead. If there is none, the margin with false-alarm share <= fallback_far_limit
    at every lead and the highest hit rate at its worst lead (ties: smallest margin).
    """
    by_margin = sweep.groupby("margin").agg(min_hit=("hit_rate", "min"), max_far=("false_alarm_share", "max"))
    reaches_hit = by_margin[by_margin["min_hit"] >= hit_target]
    primary = reaches_hit[reaches_hit["max_far"] <= far_limit]
    smallest_reaching_hit = None if reaches_hit.empty else float(reaches_hit.index.min())
    if not primary.empty:
        return {"margin": float(primary.index.min()), "branch": "primary", "target_reachable": True,
                "smallest_margin_reaching_hit_target": smallest_reaching_hit}
    allowed = by_margin[by_margin["max_far"] <= fallback_far_limit]
    if allowed.empty:
        raise ValueError(f"no margin keeps the false-alarm share at or below {fallback_far_limit} at every lead")
    best = allowed[allowed["min_hit"] == allowed["min_hit"].max()]
    return {"margin": float(best.index.min()), "branch": "fallback", "target_reachable": False,
            "smallest_margin_reaching_hit_target": smallest_reaching_hit}
