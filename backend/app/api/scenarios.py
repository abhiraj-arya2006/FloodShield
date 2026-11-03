from fastapi import APIRouter
from datetime import datetime, timezone
from backend.app.simulation.engine import simulation_engine

router = APIRouter(prefix="/scenarios", tags=["Scenarios"])

@router.get("")
def list_scenarios():
    """Returns available simulation scenarios for Delhi NCR."""
    return {
        "active_scenario_id": simulation_engine.active_scenario_id,
        "scenarios": list(simulation_engine.scenarios.values()),
        "is_simulated": True,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
