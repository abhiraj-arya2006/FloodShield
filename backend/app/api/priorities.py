from fastapi import APIRouter, Query
from datetime import datetime, timezone

from backend.app.simulation.engine import simulation_engine
from backend.app.services.exposure import exposure_service
from backend.app.models.schemas import PrioritiesResponse

router = APIRouter(prefix="/priorities", tags=["Priorities"])

@router.get("", response_model=PrioritiesResponse)
def get_top_priorities(top: int = Query(10, ge=1, le=50, description="Top N critical zones")):
    """
    Returns prioritized rank of zones needing urgent intervention,
    factoring in Hazard × Exposure × Vulnerability.
    """
    df = simulation_engine.get_feature_table()
    top_items = exposure_service.compute_priorities(df, top_n=top)
    return PrioritiesResponse(
        timestamp=simulation_engine.clock.get_current_time().isoformat(),
        top_zones=top_items,
        is_simulated=True
    )
