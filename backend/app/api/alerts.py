from fastapi import APIRouter, HTTPException, Query, Body
from datetime import datetime, timezone
from typing import List, Optional

from backend.app.simulation.engine import simulation_engine
from ml.xgboost.model import XGBoostFloodModel
from backend.app.alerts.service import alert_service
from backend.app.models.schemas import Alert, AlertAcknowledgeRequest

router = APIRouter(prefix="/alerts", tags=["Alerts"])
model = XGBoostFloodModel()

@router.get("", response_model=List[Alert])
def get_alerts(limit: int = Query(50, ge=1, le=200)):
    """
    Returns active and historical flood early warning alerts.
    Evaluates current simulation step to capture any freshly emerged risks.
    """
    # Evaluate current state to trigger new alerts if needed
    df = simulation_engine.get_feature_table()
    preds = model.predict(df)
    alert_service.evaluate_and_create_alerts(
        features_df=df,
        predictions=preds,
        current_sim_seconds=simulation_engine.clock.elapsed_sim_seconds
    )
    
    # Sort newest first
    all_alerts = list(alert_service.alerts.values())
    all_alerts.sort(key=lambda a: a.timestamp, reverse=True)
    return all_alerts[:limit]

@router.post("/test", response_model=Alert)
def post_test_alert():
    """Trigger a simulated test alert to verify notification dispatch & UI state."""
    return alert_service.trigger_test_alert()

@router.post("/{alert_id}/acknowledge", response_model=Alert)
def acknowledge_alert(alert_id: str, req: AlertAcknowledgeRequest = Body(...)):
    """Operator acknowledges an active alert; records timestamp and user in audit log."""
    updated = alert_service.acknowledge_alert(
        alert_id=alert_id,
        user_id=req.user_id,
        notes=req.notes or "Acknowledged by operator"
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found.")
    return updated

@router.post("/{alert_id}/resolve", response_model=Alert)
def resolve_alert(alert_id: str, req: AlertAcknowledgeRequest = Body(...)):
    """Operator marks an alert resolved; records resolution in audit log."""
    updated = alert_service.resolve_alert(
        alert_id=alert_id,
        user_id=req.user_id,
        notes=req.notes or "Resolved after flood waters receded"
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found.")
    return updated
