import pytest
from fastapi.testclient import TestClient
from app.backend.main import app
from app.backend.data_source import LiveSource, get_data_source

client = TestClient(app)


def test_health_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["mode"] == "replay"
    assert data["data_period"] == "2009-2012"
    assert data["total_gauges"] == 46


def test_gauges_endpoint():
    res = client.get("/api/gauges")
    assert res.status_code == 200
    data = res.json()
    assert data["total_gauges"] == 46
    gauges = data["gauges"]
    assert len(gauges) == 46

    # Verify Godavari & Mahanadi split
    godavari = [g for g in gauges if g["basin"] == "Godavari"]
    mahanadi = [g for g in gauges if g["basin"] == "Mahanadi"]
    assert len(godavari) == 27
    assert len(mahanadi) == 19

    # Verify Gauge IDs are strictly 5-character strings
    for g in gauges:
        assert isinstance(g["gauge_id"], str)
        assert len(g["gauge_id"]) == 5
        assert g["q90_m3s"] > 0
        assert g["q95_m3s"] > g["q90_m3s"]
        assert 15.0 <= g["ghi_lat"] <= 25.0
        assert 70.0 <= g["ghi_lon"] <= 90.0


def test_edges_endpoint():
    res = client.get("/api/edges")
    assert res.status_code == 200
    data = res.json()
    assert data["total_edges"] == 44
    for edge in data["edges"]:
        assert isinstance(edge["from_gauge_id"], str)
        assert isinstance(edge["to_gauge_id"], str)
        assert len(edge["from_gauge_id"]) == 5
        assert len(edge["to_gauge_id"]) == 5
        assert edge["river_distance_km"] > 0


def test_dates_endpoint():
    res = client.get("/api/dates")
    assert res.status_code == 200
    data = res.json()
    assert data["total_dates"] == 1461
    assert data["min_date"] == "2009-01-01"
    assert data["max_date"] == "2012-12-31"


def test_forecast_endpoint_valid():
    res = client.get("/api/forecast?date=2010-08-15&lead=2")
    assert res.status_code == 200
    data = res.json()
    assert data["date"] == "2010-08-15"
    assert data["lead_day"] == 2
    assert data["headline_type"] == "headline"
    assert data["mode"] == "replay"
    assert data["total_gauges"] == 46
    assert data["warning_count"] + data["watch_count"] + data["ok_count"] == 46

    # Check gauge row format
    first_gauge = data["gauges"][0]
    assert isinstance(first_gauge["gauge_id"], str)
    assert first_gauge["status"] in ["OK", "WATCH", "WARNING"]
    assert first_gauge["predicted_m3s"] > 0


def test_forecast_nowcast_lead_1():
    res = client.get("/api/forecast?date=2010-08-15&lead=1")
    assert res.status_code == 200
    data = res.json()
    assert data["lead_day"] == 1
    assert data["headline_type"] == "nowcast"


def test_forecast_invalid_lead_days():
    # lead 0 -> 422
    res0 = client.get("/api/forecast?date=2010-08-15&lead=0")
    assert res0.status_code == 422

    # lead 5 -> 422
    res5 = client.get("/api/forecast?date=2010-08-15&lead=5")
    assert res5.status_code == 422


def test_forecast_invalid_date_format():
    res = client.get("/api/forecast?date=bad-date&lead=2")
    assert res.status_code == 400
    assert "Invalid date format" in res.json()["detail"]


def test_forecast_date_out_of_range():
    res = client.get("/api/forecast?date=2025-01-01&lead=2")
    assert res.status_code == 404
    assert "No forecast found" in res.json()["detail"]


def test_single_gauge_forecast_valid():
    res = client.get("/api/gauges/01001/forecast?date=2010-08-15")
    assert res.status_code == 200
    data = res.json()
    assert data["gauge_id"] == "01001"
    assert data["name"] == "Gangapur"
    assert data["basin"] == "Godavari"
    assert len(data["lead_days"]) == 4
    leads = [ld["lead_day"] for ld in data["lead_days"]]
    assert leads == [1, 2, 3, 4]


def test_single_gauge_unknown():
    res = client.get("/api/gauges/99999/forecast?date=2010-08-15")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_alerts_endpoint():
    res = client.get("/api/alerts?date=2010-08-15&lead=2")
    assert res.status_code == 200
    data = res.json()
    assert data["date"] == "2010-08-15"
    assert data["lead_day"] == 2
    assert data["total_alerts"] == len(data["alerts"])

    # If any alerts exist, check structure and simulated draft
    for alert in data["alerts"]:
        assert alert["status"] in ["WATCH", "WARNING"]
        assert alert["approx_hours"] == "~39 h"
        assert "[FloodShield ALERT]" in alert["drafted_message"]
        assert "SIMULATED ADVISORY" in alert["drafted_message"]
        assert alert["predicted_m3s"] >= alert["threshold_m3s"]


def test_model_info_endpoint():
    res = client.get("/api/model-info")
    assert res.status_code == 200
    data = res.json()
    assert data["model_name"] == "STG-Mamba"
    assert "Mamba" in data["forecaster"]
    assert "XGBoost" in data["correction_stage"]
    assert "1980 - 2008" in data["training_years"]
    assert "2009 - 2012" in data["validation_years"]
    sources = [s["name"] for s in data["data_sources"]]
    assert "CAMELS-IND" in sources
    assert "HydroRIVERS" in sources
    assert "Open-Meteo ERA5 Historical Weather Archive" in sources


def test_live_source_501_not_implemented():
    """Verify that when LiveSource is active, it raises 501 Not Implemented."""
    live_source = LiveSource()
    app.dependency_overrides[get_data_source] = lambda: live_source
    try:
        res = client.get("/api/gauges")
        assert res.status_code == 501
        assert "Live inference pipeline is planned for Phase 3" in res.json()["detail"]
    finally:
        app.dependency_overrides.clear()

