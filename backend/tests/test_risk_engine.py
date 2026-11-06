import pytest
from backend.app.risk.engine import RiskEngine
from backend.app.models.schemas import RiskLevel

def test_risk_engine_thresholds():
    engine = RiskEngine()
    engine.reset_state()
    
    # Below moderate
    lvl, sev, _ = engine.evaluate_zone("Z1", probability=0.15, hazard_index=0.2, rainfall_intensity=5.0)
    assert lvl == RiskLevel.LOW
    
    # Moderate
    lvl, sev, _ = engine.evaluate_zone("Z2", probability=0.35, hazard_index=0.4, rainfall_intensity=20.0)
    assert lvl == RiskLevel.MODERATE
    
    # High
    lvl, sev, _ = engine.evaluate_zone("Z3", probability=0.60, hazard_index=0.6, rainfall_intensity=40.0)
    assert lvl == RiskLevel.HIGH
    
    # Critical
    lvl, sev, _ = engine.evaluate_zone("Z4", probability=0.85, hazard_index=0.85, rainfall_intensity=75.0)
    assert lvl == RiskLevel.CRITICAL

def test_risk_engine_hysteresis():
    """Verify hysteresis prevents flickering around threshold."""
    engine = RiskEngine()
    engine.reset_state()
    
    # Start in CRITICAL at 0.78
    lvl, _, _ = engine.evaluate_zone("Z_HYST", probability=0.78, hazard_index=0.75, rainfall_intensity=60.0)
    assert lvl == RiskLevel.CRITICAL
    
    # Drop to 0.73 (below 0.75 critical threshold, but above 0.75 - margin 0.03 = 0.72)
    lvl, _, _ = engine.evaluate_zone("Z_HYST", probability=0.73, hazard_index=0.70, rainfall_intensity=55.0)
    assert lvl == RiskLevel.CRITICAL # Hysteresis retains CRITICAL state
    
    # Drop below 0.72 margin
    lvl, _, _ = engine.evaluate_zone("Z_HYST", probability=0.70, hazard_index=0.65, rainfall_intensity=50.0)
    assert lvl == RiskLevel.HIGH # Successfully transitioned to HIGH
