import pytest
from backend.app.alerts.service import AlertService
from backend.app.models.schemas import AlertState, RiskLevel

def test_alert_lifecycle():
    service = AlertService()
    
    # 1. Trigger test alert
    alert = service.trigger_test_alert()
    assert alert.state == AlertState.ISSUED
    assert "[SIMULATION]" in alert.message_en
    assert alert.is_simulated is True
    assert len(alert.audit_trail) == 1
    assert alert.audit_trail[0].action == "CREATED"
    
    # 2. Acknowledge alert
    ack_alert = service.acknowledge_alert(
        alert_id=alert.id,
        user_id="operator_delhi",
        notes="Pre-deploying mobile pumps"
    )
    assert ack_alert is not None
    assert ack_alert.state == AlertState.ACKNOWLEDGED
    assert len(ack_alert.audit_trail) == 2
    assert ack_alert.audit_trail[1].action == "ACKNOWLEDGED"
    assert ack_alert.audit_trail[1].performed_by == "operator_delhi"
    
    # 3. Resolve alert
    res_alert = service.resolve_alert(
        alert_id=alert.id,
        user_id="operator_delhi",
        notes="Waterlogging receded"
    )
    assert res_alert is not None
    assert res_alert.state == AlertState.RESOLVED
    assert len(res_alert.audit_trail) == 3
    assert res_alert.audit_trail[2].action == "RESOLVED"
