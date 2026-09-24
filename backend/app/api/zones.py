from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timezone
from typing import Optional

from backend.app.simulation.engine import simulation_engine
from backend.app.models.schemas import ZonesListResponse, ZoneStatic

router = APIRouter(prefix="/zones", tags=["Zones"])

@router.get("", response_model=ZonesListResponse)
def get_all_zones(limit: Optional[int] = Query(None, description="Optional limit on number of zones")):
    """
    Returns static zone geometries (GeoJSON coordinates) and terrain baselines.
    Client fetches this once and caches in memory.
    """
    zones = simulation_engine.zones
    if limit is not None:
        zones = zones[:limit]
        
    return ZonesListResponse(
        total_zones=len(zones),
        crs="EPSG:4326",
        zones=zones,
        is_simulated=True,
        generated_at=datetime.now(timezone.utc).isoformat()
    )

@router.get("/{zone_id}", response_model=ZoneStatic)
def get_zone_by_id(zone_id: str):
    """Fetch static geometry and baseline properties for a specific zone."""
    zone = simulation_engine.zone_map.get(zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail=f"Zone {zone_id} not found.")
    return zone
