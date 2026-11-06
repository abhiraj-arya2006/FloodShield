from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import numpy as np

from backend.app.simulation.engine import simulation_engine
from ml.xgboost.model import XGBoostFloodModel
from backend.app.risk.engine import risk_engine
from backend.app.models.schemas import (
    ZoneIntelligenceResponse, WeatherIntelligence, TerrainIntelligence,
    UrbanIntelligence, ExposureIntelligence, PredictionHorizon, ForecastDataPoint,
    ExplanationIntelligence, ShapFeatureContribution, FloodType, RiskLevel
)

router = APIRouter(prefix="/predictions", tags=["Predictions"])
model = XGBoostFloodModel()

@router.get("/latest")
def get_latest_predictions(limit: int = Query(50, ge=1, le=500)):
    """Returns top highest-risk zones at the current simulation step."""
    df = simulation_engine.get_feature_table()
    preds = model.predict(df)
    
    p1 = preds["prob_1h"]
    sorted_indices = (-p1).argsort()[:limit]
    
    results = []
    for idx in sorted_indices:
        z_id = df["zone_id"].iloc[idx]
        results.append({
            "zone_id": z_id,
            "name": df["name"].iloc[idx],
            "locality": df["locality"].iloc[idx],
            "probability_1h": round(float(p1[idx]), 3),
            "probability_3h": round(float(preds["prob_3h"][idx]), 3),
            "probability_6h": round(float(preds["prob_6h"][idx]), 3),
            "flood_type": df["flood_type"].iloc[idx],
            "confidence": round(float(preds["confidence"][idx]), 1),
            "is_simulated": True
        })
        
    return {
        "timestamp": simulation_engine.clock.get_current_time().isoformat(),
        "total_returned": len(results),
        "predictions": results,
        "is_simulated": True,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }

@router.get("/{zone_id}", response_model=ZoneIntelligenceResponse)
def get_zone_intelligence(zone_id: str):
    """
    Comprehensive Zone Intelligence panel payload:
    Full weather, terrain, urban, exposure, predictions (1h/3h/6h with intervals),
    forecast timeline (6-hour curve with uncertainty and rain), and SHAP explanations.
    """
    df = simulation_engine.get_feature_table()
    row = df[df["zone_id"] == zone_id]
    if row.empty:
        raise HTTPException(status_code=404, detail=f"Zone {zone_id} not found.")
        
    r = row.iloc[0]
    preds = model.predict(row)
    expl = model.explain(df, zone_id)
    
    p1 = float(preds["prob_1h"][0])
    p1_low = float(preds["prob_1h_low"][0])
    p1_high = float(preds["prob_1h_high"][0])
    p3 = float(preds["prob_3h"][0])
    p3_low = float(preds["prob_3h_low"][0])
    p3_high = float(preds["prob_3h_high"][0])
    p6 = float(preds["prob_6h"][0])
    p6_low = float(preds["prob_6h_low"][0])
    p6_high = float(preds["prob_6h_high"][0])
    conf = float(preds["confidence"][0])
    
    risk_lvl, severity, _ = risk_engine.evaluate_zone(
        zone_id=zone_id,
        probability=p1,
        hazard_index=float(r["hazard_index"]),
        rainfall_intensity=float(r["rainfall_current"])
    )
    
    # Critical facilities
    facilities = ["Metro Station", "Underpass"] if r["critical_facilities_count"] > 1 else ["Underpass"] if r["critical_facilities_count"] == 1 else []
    
    # 6-Hour Forecast Timeline
    timeline: List[ForecastDataPoint] = []
    current_h = simulation_engine.clock.get_elapsed_hours()
    for h_step in range(1, 7):
        lead_rf = simulation_engine.weather_field.get_forecast_rain(r["latitude"], r["longitude"], current_h, float(h_step))
        # Interpolate probabilities
        t_factor = h_step / 6.0
        prob_step = p1 * (1.0 - t_factor) + p6 * t_factor
        timeline.append(ForecastDataPoint(
            hour=h_step,
            probability=round(float(np.clip(prob_step, 0.0, 1.0)), 3),
            interval_low=round(float(np.clip(prob_step - 0.08 * (1 + t_factor), 0.0, 1.0)), 3),
            interval_high=round(float(np.clip(prob_step + 0.08 * (1 + t_factor), 0.0, 1.0)), 3),
            forecast_rain_mm_h=round(float(lead_rf / h_step), 2)
        ))
        
    shap_contributions = [
        ShapFeatureContribution(
            feature_name=c["feature_name"],
            display_name=c["display_name"],
            feature_value=c["feature_value"],
            contribution=c["contribution"],
            unit=c["unit"]
        )
        for c in expl["contributions"]
    ]
    
    def p_to_risk(p: float) -> RiskLevel:
        if p >= 0.75: return RiskLevel.CRITICAL
        if p >= 0.50: return RiskLevel.HIGH
        if p >= 0.25: return RiskLevel.MODERATE
        return RiskLevel.LOW
        
    return ZoneIntelligenceResponse(
        zone_id=r["zone_id"],
        name=r["name"],
        locality=r["locality"],
        latitude=float(r["latitude"]),
        longitude=float(r["longitude"]),
        flood_type=FloodType(r["flood_type"]),
        risk_level=risk_lvl,
        estimated_severity=severity,
        confidence=conf,
        priority_score=round(float(r["hazard_index"] * 0.6 + r["road_importance_score"] * 0.4), 3),
        prediction_timestamp=simulation_engine.clock.get_current_time().isoformat(),
        model_name=model.name,
        model_version=model.version,
        is_simulated=True,
        weather=WeatherIntelligence(
            current_rainfall_mm_h=float(r["rainfall_current"]),
            rainfall_1h_mm=float(r["rainfall_1h"]),
            rainfall_3h_mm=float(r["rainfall_3h"]),
            rainfall_6h_mm=float(r["rainfall_6h"]),
            rainfall_24h_mm=float(r["rainfall_24h"]),
            temperature_c=float(r["temperature"]),
            humidity_pct=float(r["humidity"]),
            wind_speed_km_h=float(r["wind_speed"]),
            pressure_hpa=float(r["pressure"]),
            soil_moisture=float(r["soil_moisture"])
        ),
        terrain=TerrainIntelligence(
            elevation_m=float(r["elevation"]),
            slope_deg=float(r["slope"]),
            flow_accumulation=float(r["flow_accumulation"]),
            dist_to_river_m=float(r["dist_to_river"]),
            dist_to_drain_m=float(r["dist_to_drain"]),
            twi=float(r["twi"]),
            hand_m=float(r["hand"])
        ),
        urban=UrbanIntelligence(
            impervious_pct=round(float(r["impervious_ratio"] * 100.0), 1),
            building_density=round(float(r["building_density"] * 100.0), 1),
            road_density=round(float(r["road_density"] * 100.0), 1),
            vegetation_pct=round(float(r["vegetation_ratio"] * 100.0), 1),
            drainage_density=float(r["drainage_density"]),
            drain_capacity_index=float(r["drain_capacity_index"]),
            drain_blockage_pct=round(float(r["drain_blockage_factor"] * 100.0), 1)
        ),
        exposure=ExposureIntelligence(
            population=int(r["population"]),
            critical_facilities=facilities,
            nearby_underpasses=1 if "Ring Road" in r["name"] or "Sector" in r["name"] else 0,
            road_importance_score=float(r["road_importance_score"]),
            vulnerability_score=round(float(r["impervious_ratio"] * 0.7 + (1.0 - r["hand"] / 5.0) * 0.3), 2)
        ),
        predictions=[
            PredictionHorizon(horizon_hours=1, probability=p1, interval_low=p1_low, interval_high=p1_high, risk_level=p_to_risk(p1)),
            PredictionHorizon(horizon_hours=3, probability=p3, interval_low=p3_low, interval_high=p3_high, risk_level=p_to_risk(p3)),
            PredictionHorizon(horizon_hours=6, probability=p6, interval_low=p6_low, interval_high=p6_high, risk_level=p_to_risk(p6))
        ],
        forecast_timeline=timeline,
        explanation=ExplanationIntelligence(
            top_factors=expl["top_factors"],
            summary_sentence=expl["summary_sentence"],
            contributions=shap_contributions,
            model_name=model.name,
            model_version=model.version
        )
    )

@router.get("/{zone_id}/forecast")
def get_zone_forecast(zone_id: str):
    """Returns 6-hour forecast probabilities and uncertainty bands for a zone."""
    res = get_zone_intelligence(zone_id)
    return {
        "zone_id": zone_id,
        "name": res.name,
        "forecast_timeline": res.forecast_timeline,
        "is_simulated": True,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
