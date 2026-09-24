from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from backend.app.simulation.engine import simulation_engine
from ml.xgboost.model import XGBoostFloodModel
from backend.app.risk.engine import risk_engine
from backend.app.services.exposure import exposure_service
from backend.app.models.schemas import (
    FloodMapResponse, CompactZoneDynamic, FloodType, RiskLevel
)

router = APIRouter(prefix="/flood-map", tags=["Flood Map"])
model = XGBoostFloodModel()

def _compute_compact_state(hour: Optional[float] = None) -> Dict[str, CompactZoneDynamic]:
    """Single Source of Truth dynamic zone states."""
    df = simulation_engine.get_feature_table(hour=hour)
    preds = model.predict(df)
    
    p1 = preds["prob_1h"]
    p1_low = preds["prob_1h_low"]
    p1_high = preds["prob_1h_high"]
    p3 = preds["prob_3h"]
    p6 = preds["prob_6h"]
    conf = preds["confidence"]
    
    hazard_indices = df["hazard_index"].values
    rf_currs = df["rainfall_current"].values
    rf_1hs = df["rainfall_1h"].values
    rf_3hs = df["rainfall_3h"].values
    rf_6hs = df["rainfall_6h"].values
    zone_ids = df["zone_id"].values
    flood_types = df["flood_type"].values
    
    # Priority scores
    priorities = exposure_service.compute_priorities(df, top_n=len(df))
    p_map = {item.zone_id: item.priority_score for item in priorities}
    
    zone_data = {}
    for i, z_id in enumerate(zone_ids):
        risk_lvl, _, _ = risk_engine.evaluate_zone(
            zone_id=z_id,
            probability=float(p1[i]),
            hazard_index=float(hazard_indices[i]),
            rainfall_intensity=float(rf_currs[i])
        )
        
        zone_data[z_id] = CompactZoneDynamic(
            p1=round(float(p1[i]), 3),
            p1_low=round(float(p1_low[i]), 3),
            p1_high=round(float(p1_high[i]), 3),
            p3=round(float(p3[i]), 3),
            p6=round(float(p6[i]), 3),
            risk=risk_lvl,
            flood_type=FloodType(flood_types[i]),
            rf_current=round(float(rf_currs[i]), 2),
            rf_accum_1h=round(float(rf_1hs[i]), 2),
            rf_accum_3h=round(float(rf_3hs[i]), 2),
            rf_accum_6h=round(float(rf_6hs[i]), 2),
            priority_score=round(p_map.get(z_id, 0.2), 3),
            confidence=round(float(conf[i]), 1)
        )
        
    return zone_data

@router.get("", response_model=FloodMapResponse)
def get_flood_map_dynamic(hour: Optional[float] = Query(None, description="Optional simulation hour offset")):
    """
    Returns ultra-compact dynamic values keyed by zone_id.
    Zero polygon overhead; feeds 60fps canvas map rendering.
    """
    zone_data = _compute_compact_state(hour=hour)
    return FloodMapResponse(
        timestamp=simulation_engine.clock.get_current_time().isoformat(),
        scenario_id=simulation_engine.active_scenario_id,
        zone_data=zone_data,
        is_simulated=True,
        generated_at=datetime.now(timezone.utc).isoformat()
    )

@router.get("/layer/{layer}")
def get_specific_layer(
    layer: str,
    hour: Optional[float] = Query(None, description="Optional simulation hour offset")
):
    """
    Returns dynamic or static scalar values for a specific layer.
    Supported layers: flood_probability, rainfall_intensity, elevation, slope,
    drainage_density, impervious_surface, historical_flood_frequency, satellite_flood_extent,
    exposure, priority_score.
    """
    df = simulation_engine.get_feature_table(hour=hour)
    
    if layer in ["flood_probability", "probability"]:
        preds = model.predict(df)
        data = {z_id: round(float(p), 3) for z_id, p in zip(df["zone_id"], preds["prob_1h"])}
    elif layer in ["rainfall_intensity", "rainfall"]:
        data = {z_id: round(float(rf), 2) for z_id, rf in zip(df["zone_id"], df["rainfall_current"])}
    elif layer == "elevation":
        data = {z_id: round(float(e), 1) for z_id, e in zip(df["zone_id"], df["elevation"])}
    elif layer == "slope":
        data = {z_id: round(float(s), 2) for z_id, s in zip(df["zone_id"], df["slope"])}
    elif layer == "drainage_density":
        data = {z_id: round(float(d), 2) for z_id, d in zip(df["zone_id"], df["drainage_density"])}
    elif layer in ["impervious_surface", "impervious"]:
        data = {z_id: round(float(imp), 3) for z_id, imp in zip(df["zone_id"], df["impervious_ratio"])}
    elif layer in ["priority_score", "priority"]:
        priorities = exposure_service.compute_priorities(df, top_n=len(df))
        data = {item.zone_id: item.priority_score for item in priorities}
    elif layer in ["exposure", "population"]:
        data = {z_id: int(pop) for z_id, pop in zip(df["zone_id"], df["population"])}
    elif layer == "satellite_flood_extent":
        # Simulated satellite extent based on current inundation
        preds = model.predict(df)
        data = {z_id: bool(p > 0.65) for z_id, p in zip(df["zone_id"], preds["prob_1h"])}
    elif layer == "historical_flood_frequency":
        # Deterministic synthetic flood frequency
        data = {z_id: round(float(min(1.0, (230.0 - min(230.0, e)) / 25.0 * 0.7 + imp * 0.3)), 2)
                for z_id, e, imp in zip(df["zone_id"], df["elevation"], df["impervious_ratio"])}
    else:
        raise HTTPException(status_code=400, detail=f"Layer '{layer}' is not supported.")
        
    return {
        "layer": layer,
        "timestamp": simulation_engine.clock.get_current_time().isoformat(),
        "values": data,
        "is_simulated": True,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
