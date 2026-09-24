from fastapi import APIRouter
from datetime import datetime, timezone
from backend.app.core.config import settings
from backend.app.simulation.engine import simulation_engine

router = APIRouter(tags=["Health"])

@router.get("/health")
def get_health():
    """System health, component freshness, and simulation status."""
    return {
        "status": "healthy",
        "service": "FloodGuard AI",
        "version": settings.VERSION,
        "is_simulated": True,
        "simulation_mode": settings.SIMULATION_MODE,
        "components": {
            "simulation_engine": "online",
            "model_registry": "online (xgboost-synthetic-v1.0.0)",
            "risk_engine": "online",
            "alert_service": "online",
            "database": "in_memory_repository (M1)",
            "websocket_broadcaster": "online"
        },
        "simulation_clock": {
            "current_time": simulation_engine.clock.get_current_time().isoformat(),
            "speed": simulation_engine.clock.speed,
            "is_running": simulation_engine.clock.is_running,
            "active_scenario": simulation_engine.active_scenario_id
        },
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
