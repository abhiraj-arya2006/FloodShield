"""Fits a correction from Open-Meteo weather toward the CAMELS-IND weather the model was trained on.

    python scripts/fit_weather_correction.py --camels <zip> --saved <val predictions parquet> --q95 <thresholds csv>

Needs the Open-Meteo archives cached by scripts/validate_live_pipeline.py. Fits on 2010 and
scores on 2012, so the score is on data the correction never saw. Then refits on both years and
writes data/model/weather_correction.json. Validation years only: test years stay untouched.
"""
import argparse
import json
import sys
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from validate_live_pipeline import WORK, WINDOW_DAYS, cube, load_camels, run_windows, score  # noqa: E402
from app.backend.live import MODEL_DIR, CatchmentWeather, Ensemble, apply_correction  # noqa: E402

QUANTILES = np.round(np.linspace(0.0, 1.0, 41), 4)


def load_period(first: str, weather: CatchmentWeather):
    data = np.load(WORK / f"openmeteo_{first}.npz", allow_pickle=False)
    return pd.DatetimeIndex(data["days"]), weather.catchment_means(data["values"])


def fit(pairs) -> dict:
    """Per gauge: rain quantile map, plus mean temperature offsets."""
    live = np.concatenate([p[0] for p in pairs])
    target = np.concatenate([p[1] for p in pairs])
    return {
        "quantiles": QUANTILES.tolist(),
        "rain_from": np.nanquantile(live[..., 0], QUANTILES, axis=0).round(3).T.tolist(),
        "rain_to": np.nanquantile(target[..., 0], QUANTILES, axis=0).round(3).T.tolist(),
        "tmax_offset": np.nanmean(target[..., 1] - live[..., 1], axis=0).round(3).tolist(),
        "tmin_offset": np.nanmean(target[..., 2] - live[..., 2], axis=0).round(3).tolist(),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--camels", type=Path, required=True)
    parser.add_argument("--saved", type=Path, required=True)
    parser.add_argument("--q95", type=Path, required=True)
    args = parser.parse_args()

    ensemble = Ensemble()
    ids = ensemble.gauge_ids
    weather = CatchmentWeather(ids)
    camels = load_camels(zipfile.ZipFile(args.camels), ids)
    saved = pd.read_parquet(args.saved)
    saved["gauge_id"] = saved.gauge_id.astype(str)
    q95 = pd.read_csv(args.q95, dtype={"gauge_id": str}).set_index("gauge_id").q95

    days10, om10 = load_period("2010-03-01", weather)
    days12, om12 = load_period("2012-03-01", weather)
    pair10 = (om10, cube(camels.loc[days10], ids))
    pair12 = (om12, cube(camels.loc[days12], ids))

    def scored(values, days) -> dict:
        monsoon = pd.DatetimeIndex([d for d in days[WINDOW_DAYS:] if 6 <= d.month <= 10])
        merged = saved.merge(run_windows(ensemble, days, values, monsoon), on=["sample_date", "lead_day", "gauge_id"])
        return score(merged, "flow", q95)

    held_out = fit([pair10])
    print("2012, which the correction didn't see, lead days 2-4:")
    print("  CAMELS weather:          ", scored(pair12[1], days12))
    print("  Open-Meteo, uncorrected: ", scored(om12, days12))
    print("  Open-Meteo, corrected:   ", scored(apply_correction(om12, held_out), days12))

    (MODEL_DIR / "weather_correction.json").write_text(json.dumps(fit([pair10, pair12])), encoding="utf-8")
    print("Wrote the correction, refitted on 2010 and 2012.")


if __name__ == "__main__":
    main()
