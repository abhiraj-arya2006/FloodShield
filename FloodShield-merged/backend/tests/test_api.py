import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_simulation_header():
    """Verify X-Simulation header is present on responses."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.headers.get("x-simulation") == "true"
    data = resp.json()
    assert data["is_simulated"] is True
    assert data["status"] == "healthy"

def test_zones_endpoint():
    resp = client.get("/api/zones?limit=10")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_simulated"] is True
    assert len(data["zones"]) == 10
    zone = data["zones"][0]
    assert "zone_id" in zone
    assert "geometry" in zone
    assert zone["geometry"]["type"] == "Polygon"

def test_flood_map_endpoint():
    resp = client.get("/api/flood-map")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_simulated"] is True
    assert "zone_data" in data
    # Check first zone
    first_key = list(data["zone_data"].keys())[0]
    cell = data["zone_data"][first_key]
    assert "p1" in cell
    assert "p1_low" in cell
    assert "p1_high" in cell
    assert "risk" in cell
    assert "flood_type" in cell

def test_predictions_zone_intelligence():
    resp = client.get("/api/predictions/DEL_0001")
    assert resp.status_code == 200
    data = resp.json()
    assert data["zone_id"] == "DEL_0001"
    assert "weather" in data
    assert "terrain" in data
    assert "urban" in data
    assert "exposure" in data
    assert "predictions" in data
    assert "forecast_timeline" in data
    assert "explanation" in data
    assert len(data["explanation"]["top_factors"]) > 0
    assert len(data["explanation"]["contributions"]) > 0

def test_priorities_endpoint():
    resp = client.get("/api/priorities?top=10")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["top_zones"]) == 10
    top1 = data["top_zones"][0]
    assert top1["rank"] == 1
    assert "priority_score" in top1
    assert "hazard_score" in top1
    assert "exposure_score" in top1

def test_whatif_endpoint():
    resp = client.post("/api/whatif", json={
        "rainfall_multiplier": 1.5,
        "drain_blockage_pct": 30.0,
        "selected_zone_id": "DEL_0001"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["rainfall_multiplier"] == 1.5
    assert data["drain_blockage_pct"] == 30.0
    assert "map_deltas" in data
    assert "selected_zone_delta" in data
    assert data["selected_zone_delta"] is not None

def test_alerts_lifecycle():
    # Test alert trigger
    resp = client.post("/api/alerts/test")
    assert resp.status_code == 200
    alert = resp.json()
    assert alert["state"] == "ISSUED"
    alert_id = alert["id"]
    
    # Acknowledge
    ack_resp = client.post(f"/api/alerts/{alert_id}/acknowledge", json={
        "user_id": "analyst_tester",
        "notes": "Testing acknowledgment"
    })
    assert ack_resp.status_code == 200
    assert ack_resp.json()["state"] == "ACKNOWLEDGED"

def test_simulation_control():
    resp = client.post("/api/simulation/control", json={
        "action": "pause"
    })
    assert resp.status_code == 200
    assert resp.json()["is_running"] is False
    
    resp = client.post("/api/simulation/control", json={
        "action": "play"
    })
    assert resp.status_code == 200
    assert resp.json()["is_running"] is True
