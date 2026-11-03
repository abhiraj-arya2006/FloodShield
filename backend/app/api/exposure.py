from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone

from backend.app.simulation.engine import simulation_engine

router = APIRouter(prefix="/exposure", tags=["Exposure"])

@router.get("/{zone_id}")
def get_zone_exposure(zone_id: str):
    """Detailed exposure and vulnerability metrics for a specific zone."""
    zone = simulation_engine.zone_map.get(zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail=f"Zone {zone_id} not found.")
        
    return {
        "zone_id": zone_id,
        "name": zone.name,
        "population": zone.population,
        "critical_facilities_count": zone.critical_facilities_count,
        "road_importance_score": zone.road_importance_score,
        "impervious_ratio": zone.impervious_ratio,
        "building_density": zone.building_density,
        "is_simulated": True,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
