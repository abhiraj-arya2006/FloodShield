"""Flood alerts from per-gauge high-flow thresholds.

Thresholds are training-period streamflow percentiles per gauge
(configs/flow_thresholds.csv). An alert means predicted daily flow above the
gauge's own threshold; it is not an official CWC warning level and a daily
model cannot resolve the hour.
"""


def headline_lead_days(assumed_data_lag_days: int, horizon_days: int) -> list[int]:
    """Lead days worth headlining: the first forecast day that is still in the
    future at issue time is lag + 1 (day t+1 is already today or the past)."""
    first = int(assumed_data_lag_days) + 1
    if first > horizon_days:
        raise ValueError("data lag leaves no forecast day inside the horizon")
    return list(range(first, int(horizon_days) + 1))


# TODO: Apply configs/training.yaml warning.threshold_quantile and alert_margin (tuned on validation only).
