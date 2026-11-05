"""Live forecasts: today's weather through the trained STG-Mamba ensemble.

The model takes 90 days of rain and temperature per gauge plus 4 days of forecast rain.
Those come from Open-Meteo, averaged over each gauge's real catchment using the sample
points in data/model/catchment_points.json, then scaled with the saved training
normalisers. Nothing is refitted. There are no live river readings, so a live forecast
has no observed flow to check against.

Training used IMD rainfall, not Open-Meteo, so live skill is lower than the published scores.
Scored on 2012 using Open-Meteo's archive and a correction fitted only on 2010, lead days 2-4:
about 69% of flood days caught, 56% of alerts false, median NSE 0.32. The same days on the
training weather score 81%, 44% and 0.47. scripts/validate_live_pipeline.py and
scripts/fit_weather_correction.py measure this. Real forecast rain will score lower still.
"""
import json
import logging
import sys
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "app" / "backend" / "data" / "model"
CHECKPOINT_DIR = ROOT / "checkpoints"
CACHE_PATH = ROOT / "outputs" / "live_cache" / "latest.json"
MEMBERS = [f"stg_mamba_perlead_hf5{s}_best.pt" for s in ("", "_s1", "_s2")]
FEATURES = ["prcp", "tmax", "tmin", "tavg"]
WINDOW_DAYS = 90
HORIZON_DAYS = 4
IST = timezone(timedelta(hours=5, minutes=30))
REFRESH_AFTER = timedelta(hours=3)
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
ARCHIVE_CACHE = ROOT / "outputs" / "live_cache" / "archive.npz"
RECENT_DAYS = 25  # The forecast service only keeps about 8 weeks of past days. Older days come from the archive.
CHUNK = 40  # Locations per request, to keep URLs a safe length.


class LiveUnavailable(RuntimeError):
    """A live forecast couldn't be produced, and there's no earlier one to fall back on."""


def apply_correction(means: np.ndarray, correction: dict) -> np.ndarray:
    """Moves Open-Meteo catchment weather toward the CAMELS-IND weather the model was trained on.

    means is [T, gauges, 4] for prcp, tmax, tmin, tavg. Rain goes through a per-gauge quantile
    map fitted by scripts/fit_weather_correction.py, and temperatures shift by a per-gauge offset.
    """
    out = means.copy()
    rain_from, rain_to = np.asarray(correction["rain_from"]), np.asarray(correction["rain_to"])
    for g in range(means.shape[1]):
        # Keep the map strictly increasing, since the dry end has many tied quantiles.
        source = np.maximum.accumulate(rain_from[g]) + np.arange(rain_from.shape[1]) * 1e-6
        out[:, g, 0] = np.interp(means[:, g, 0], source, rain_to[g])
    out[:, :, 1] += np.asarray(correction["tmax_offset"])
    out[:, :, 2] += np.asarray(correction["tmin_offset"])
    out[:, :, 3] = out[:, :, 1:3].mean(axis=-1)
    return out


class Ensemble:
    """The three trained STG-Mamba members, averaged in standardised flow space as in evaluation."""

    def __init__(self) -> None:
        import torch

        src = str(ROOT / "src")
        if src not in sys.path:
            sys.path.insert(0, src)
        from floodshield.models.stg_mamba import STGMamba, config_from_yaml

        self._torch = torch
        self.norm = json.loads((MODEL_DIR / "normalisers.json").read_text(encoding="utf-8"))
        edges = pd.read_csv(MODEL_DIR / "graph_edges.csv", dtype={"source": str, "target": str})
        static = pd.read_csv(MODEL_DIR / "static_features.csv", header=[0, 1], index_col=0)
        static.index = static.index.astype(str).str.zfill(5)

        self.models = []
        self.gauge_ids: List[str] = []
        for name in MEMBERS:
            path = CHECKPOINT_DIR / name
            if not path.exists():
                raise LiveUnavailable(f"Missing checkpoint {name}. Run scripts/import_model_predictions.py.")
            ckpt = torch.load(path, map_location="cpu", weights_only=False)
            ids = [str(g) for g in ckpt["gauge_ids"]]
            if self.gauge_ids and ids != self.gauge_ids:
                raise LiveUnavailable("Checkpoints disagree on gauge order.")
            self.gauge_ids = ids
            cfg = config_from_yaml(ckpt["model_cfg"], ckpt["model_cfg"]["input"]["feature_list"], ckpt["n_static"], len(ids))
            model = STGMamba(cfg, edges, ids)
            model.load_state_dict(ckpt["model_state"])
            model.eval()
            self.models.append(model)

        self.static = torch.as_tensor(static.loc[self.gauge_ids]["standardised"].to_numpy(dtype=np.float32))
        if list(self.norm["target"]["gauge_ids"]) != self.gauge_ids:
            raise LiveUnavailable("Normaliser and checkpoints disagree on gauge order.")
        self.target_mean = np.asarray(self.norm["target"]["mean"])
        self.target_std = np.asarray(self.norm["target"]["std"])

    def _scale(self, values: np.ndarray, spec: dict) -> np.ndarray:
        x = np.log1p(np.clip(values, 0, None)) if spec["log1p"] else values
        return (x - spec["mean"]) / spec["std"]

    def predict(self, past: np.ndarray, future_rain: np.ndarray) -> np.ndarray:
        """past [B, 90, N, 4] raw prcp/tmax/tmin/tavg, future_rain [B, 4, N] mm -> flow [B, 4, N] m3/s."""
        scaled = np.stack([self._scale(past[..., i], self.norm["dynamic"][f]) for i, f in enumerate(FEATURES)], axis=-1)
        rain = self._scale(future_rain, self.norm["future_rain"])
        torch = self._torch
        x_past = torch.as_tensor(scaled, dtype=torch.float32)
        x_future = torch.as_tensor(rain[..., None], dtype=torch.float32)
        static = self.static.unsqueeze(0).expand(x_past.shape[0], -1, -1)
        with torch.no_grad():
            z = torch.stack([m(x_past, x_future, static) for m in self.models]).mean(0).numpy()
        return np.clip(np.expm1(z * self.target_std + self.target_mean), 0.0, None)


class CatchmentWeather:
    """Fetches daily weather at sample points and averages it over each gauge's catchment."""

    def __init__(self, gauge_ids: Sequence[str]) -> None:
        data = json.loads((MODEL_DIR / "catchment_points.json").read_text(encoding="utf-8"))
        self.points: List[Tuple[float, float]] = [tuple(p) for p in data["points"]]
        self.members = [np.asarray(data["gauges"][g], dtype=int) for g in gauge_ids]

    def fetch(self, url: str, params: Dict[str, str], chunk_size: int = CHUNK, pause: float = 0.0) -> Tuple[pd.DatetimeIndex, np.ndarray]:
        """Returns dates and [T, points, 3] for rain, tmax, tmin. `pause` paces long archive requests."""
        days, frames = None, []
        for i in range(0, len(self.points), chunk_size):
            chunk = self.points[i:i + chunk_size]
            if i and pause:
                time.sleep(pause)
            query = {
                "latitude": ",".join(f"{p[0]:.3f}" for p in chunk),
                "longitude": ",".join(f"{p[1]:.3f}" for p in chunk),
                "daily": "precipitation_sum,temperature_2m_max,temperature_2m_min",
                "timezone": "Asia/Kolkata",
                **params,
            }
            with urllib.request.urlopen(f"{url}?{urllib.parse.urlencode(query)}", timeout=60) as res:
                body = json.load(res)
            for location in body if isinstance(body, list) else [body]:
                daily = location["daily"]
                days = daily["time"]
                frames.append(np.array([daily["precipitation_sum"], daily["temperature_2m_max"], daily["temperature_2m_min"]], dtype=float).T)
        return pd.DatetimeIndex(days), np.stack(frames, axis=1)

    def catchment_means(self, values: np.ndarray) -> np.ndarray:
        """[T, points, 3] -> [T, gauges, 4] with tavg = (tmax + tmin) / 2, as CAMELS-IND defines it."""
        rain_tmax_tmin = np.stack([np.nanmean(values[:, m, :], axis=1) for m in self.members], axis=1)
        tavg = rain_tmax_tmin[..., 1:].mean(axis=-1, keepdims=True)
        return np.concatenate([rain_tmax_tmin, tavg], axis=-1)


class LiveForecaster:
    """Produces and caches the current forecast. Requests never wait on a fresh forecast longer than one run."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ensemble: Optional[Ensemble] = None
        self._current: Optional[dict] = None

    def _run(self, now: datetime) -> dict:
        if self._ensemble is None:
            self._ensemble = Ensemble()
        ensemble = self._ensemble
        weather = CatchmentWeather(ensemble.gauge_ids)
        dates, values = self._weather(weather, now)
        means = weather.catchment_means(values)
        means = apply_correction(means, json.loads((MODEL_DIR / "weather_correction.json").read_text(encoding="utf-8")))

        made_on = now.date().isoformat()
        if np.isnan(means[:, :, 0]).all(axis=1).sum() > HORIZON_DAYS:
            logger.warning("Weather has %d empty days", int(np.isnan(means[:, :, 0]).all(axis=1).sum()))
        t = dates.get_loc(pd.Timestamp(made_on))
        window = means[t - WINDOW_DAYS + 1:t + 1]
        rain = means[t + 1:t + 1 + HORIZON_DAYS, :, 0]
        if window.shape[0] != WINDOW_DAYS or rain.shape[0] != HORIZON_DAYS:
            raise LiveUnavailable("The weather service returned too few days.")
        missing = np.isnan(window).mean()
        if missing > 0.02 or np.isnan(rain).any():
            raise LiveUnavailable("The weather service returned incomplete data.")
        window = pd.DataFrame(window.reshape(WINDOW_DAYS, -1)).ffill().bfill().to_numpy().reshape(window.shape)

        flow = ensemble.predict(window[None], rain[None])[0]
        return {
            "made_on": made_on,
            "generated_at": now.isoformat(timespec="minutes"),
            "gauge_ids": ensemble.gauge_ids,
            "predicted_m3s": np.round(flow, 2).tolist(),
            "weather": "Open-Meteo",
        }

    def _weather(self, weather: "CatchmentWeather", now: datetime) -> Tuple[pd.DatetimeIndex, np.ndarray]:
        """Joins the archive (older days, fetched once a day) with the forecast service (recent and coming days)."""
        today = pd.Timestamp(now.date())
        days = pd.date_range(today - timedelta(days=WINDOW_DAYS + 5), today + timedelta(days=HORIZON_DAYS + 1))
        joined = np.full((len(days), len(weather.points), 3), np.nan)

        older, older_values = self._archive(weather, today)
        joined[days.get_indexer(older)] = older_values
        recent, recent_values = weather.fetch(FORECAST_URL, {"past_days": str(RECENT_DAYS), "forecast_days": str(HORIZON_DAYS + 2)})
        keep = days.get_indexer(recent)
        for position, row in zip(keep, recent_values):
            if position >= 0:
                joined[position] = np.where(np.isfinite(row), row, joined[position])
        return days, joined

    def _archive(self, weather: "CatchmentWeather", today: pd.Timestamp) -> Tuple[pd.DatetimeIndex, np.ndarray]:
        stamp = today.date().isoformat()
        try:
            saved = np.load(ARCHIVE_CACHE, allow_pickle=False)
            if str(saved["made_on"]) == stamp and saved["values"].shape[1] == len(weather.points):
                return pd.DatetimeIndex(saved["days"]), saved["values"]
        except (OSError, ValueError, KeyError):
            pass
        first = today - timedelta(days=WINDOW_DAYS + 5)
        last = today - timedelta(days=RECENT_DAYS - 5)
        older, values = weather.fetch(ARCHIVE_URL, {"start_date": first.date().isoformat(), "end_date": last.date().isoformat()}, pause=3.0)
        ARCHIVE_CACHE.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(ARCHIVE_CACHE, made_on=stamp, days=older.to_numpy().astype("datetime64[D]").astype(str), values=values)
        return older, values

    def _save(self, forecast: dict) -> None:
        try:
            CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            CACHE_PATH.write_text(json.dumps(forecast), encoding="utf-8")
        except OSError as error:
            logger.warning("Couldn't save the live forecast: %s", error)

    def _read_saved(self) -> Optional[dict]:
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def current(self) -> dict:
        """The freshest forecast available. If a refresh fails, the last good forecast is returned as stale."""
        now = datetime.now(IST)
        with self._lock:
            if self._current is None:
                self._current = self._read_saved()
            forecast = self._current
            if forecast:
                age = now - datetime.fromisoformat(forecast["generated_at"])
                if forecast["made_on"] == now.date().isoformat() and age < REFRESH_AFTER:
                    return {**forecast, "stale": False}
            try:
                self._current = self._run(now)
                self._save(self._current)
                return {**self._current, "stale": False}
            except Exception as error:  # Network, parsing or model failure: keep serving what we have.
                logger.warning("Live forecast failed: %s: %s", type(error).__name__, error)
                if forecast:
                    return {**forecast, "stale": True}
                raise LiveUnavailable("The live forecast can't be produced right now. Past years are still available.") from error

    def lookup(self, date: str, lead_day: int) -> Optional[Dict[str, float]]:
        """Flow per gauge if (date, lead) belongs to the current live forecast, without triggering a refresh."""
        forecast = self._current
        if not forecast:
            return None
        made_on = datetime.fromisoformat(forecast["made_on"]).date()
        if (datetime.fromisoformat(date).date() - made_on).days != lead_day or not 1 <= lead_day <= HORIZON_DAYS:
            return None
        return {g: row[lead_day - 1] for g, row in zip(forecast["gauge_ids"], np.asarray(forecast["predicted_m3s"]).T.tolist())}


forecaster = LiveForecaster()
