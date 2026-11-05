"""Live forecasts: real checkpoints and real API responses, with the weather service stubbed out."""
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.backend import live
from app.backend.main import app

client = TestClient(app)


@pytest.fixture(scope="module")
def ensemble():
    return live.Ensemble()


def weather(n_gauges, rain=0.5):
    past = np.zeros((1, live.WINDOW_DAYS, n_gauges, 4))
    past[..., 0], past[..., 1], past[..., 2], past[..., 3] = rain, 32.0, 20.0, 26.0
    return past, np.full((1, live.HORIZON_DAYS, n_gauges), rain)


def test_ensemble_gives_a_finite_flow_for_every_gauge_and_day(ensemble):
    flow = ensemble.predict(*weather(len(ensemble.gauge_ids)))
    assert flow.shape == (1, 4, 46)
    assert np.isfinite(flow).all() and (flow >= 0).all()


def test_more_rain_means_more_flow(ensemble):
    n = len(ensemble.gauge_ids)
    dry = ensemble.predict(*weather(n, rain=0.0)).sum()
    wet = ensemble.predict(*weather(n, rain=40.0)).sum()
    assert wet > dry * 5


def _install(monkeypatch, made_on, flow=100.0):
    ids = [g["gauge_id"] for g in client.get("/api/gauges").json()["gauges"]]
    forecast = {
        "made_on": made_on, "generated_at": datetime.now(live.IST).isoformat(timespec="minutes"),
        "gauge_ids": ids, "predicted_m3s": [[flow] * len(ids) for _ in range(4)], "weather": "Open-Meteo",
    }
    monkeypatch.setattr(live.forecaster, "_current", forecast)
    return ids


def test_forecast_endpoint_serves_the_live_run(monkeypatch):
    today = datetime.now(live.IST).date()
    _install(monkeypatch, today.isoformat(), flow=123.4)
    res = client.get(f"/api/forecast?date={today + timedelta(days=2)}&lead=2").json()
    assert res["mode"] == "live"
    assert res["total_gauges"] == 46
    for g in res["gauges"]:
        assert g["predicted_m3s"] == 123.4
        assert g["observed_m3s"] is None


def test_past_dates_still_come_from_the_archive(monkeypatch):
    _install(monkeypatch, datetime.now(live.IST).date().isoformat())
    assert client.get("/api/forecast?date=2013-07-13&lead=4").json()["mode"] == "replay"


def test_live_endpoint_keeps_the_last_forecast_when_the_refresh_fails(monkeypatch):
    yesterday = (datetime.now(live.IST).date() - timedelta(days=1)).isoformat()
    _install(monkeypatch, yesterday)

    def down(now):
        raise OSError("weather service down")

    monkeypatch.setattr(live.forecaster, "_run", down)
    body = client.get("/api/live").json()
    assert body["made_on"] == yesterday and body["stale"] is True


def test_live_endpoint_says_when_nothing_is_available(monkeypatch):
    def down(now):
        raise OSError("weather service down")

    monkeypatch.setattr(live.forecaster, "_run", down)
    monkeypatch.setattr(live.forecaster, "_current", None)
    monkeypatch.setattr(live.forecaster, "_read_saved", lambda: None)
    assert client.get("/api/live").status_code == 503


def test_ask_knows_a_forecast_is_live(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    today = datetime.now(live.IST).date().isoformat()
    _install(monkeypatch, today)
    text = client.post("/api/ask", json={"question": "Is this a live forecast?", "start": today, "day": 1}).text
    assert text.startswith("Yes.") and today in text


def test_catchment_points_cover_every_gauge():
    ids = pd.read_csv(live.MODEL_DIR / "graph_edges.csv", dtype=str)
    weather_points = live.CatchmentWeather(sorted(set(ids.source) | set(ids.target)))
    assert len(weather_points.members) == 46
    assert all(len(m) >= 1 for m in weather_points.members)
    for lat, lon in weather_points.points:
        assert 15 < lat < 25 and 72 < lon < 88


def test_weather_correction_keeps_shape_and_moves_values():
    correction = {
        "rain_from": [[0.0, 0.0, 10.0]], "rain_to": [[0.0, 1.0, 5.0]],
        "tmax_offset": [1.0], "tmin_offset": [-1.0],
    }
    means = np.array([[[10.0, 30.0, 20.0, 25.0]]])
    out = live.apply_correction(means, correction)
    assert out.shape == means.shape
    assert out[0, 0, 0] == pytest.approx(5.0, abs=1e-3)
    assert out[0, 0, 1] == 31.0 and out[0, 0, 2] == 19.0 and out[0, 0, 3] == 25.0
