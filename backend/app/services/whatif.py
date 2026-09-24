import numpy as np
from typing import Optional, Dict, Any

from backend.app.simulation.engine import simulation_engine
from ml.xgboost.model import XGBoostFloodModel
from backend.app.models.schemas import (
    WhatIfRequest, WhatIfResponse, WhatIfZoneDelta, RiskLevel
)

class WhatIfService:
    """
    Evaluates counterfactual flood risk scenarios:
    e.g. +50% rainfall, 30% drainage blockage.
    """
    def __init__(self):
        self.model = XGBoostFloodModel()

    def evaluate(self, request: WhatIfRequest) -> WhatIfResponse:
        hour = simulation_engine.clock.get_elapsed_hours()
        
        # 1. Baseline feature table
        base_df = simulation_engine.get_feature_table(
            hour=hour, rainfall_multiplier=1.0, drain_blockage_pct=0.0
        )
        base_preds = self.model.predict(base_df)["prob_1h"]
        
        # 2. Counterfactual feature table
        cf_df = simulation_engine.get_feature_table(
            hour=hour,
            rainfall_multiplier=request.rainfall_multiplier,
            drain_blockage_pct=request.drain_blockage_pct
        )
        cf_preds = self.model.predict(cf_df)["prob_1h"]
        
        deltas = cf_preds - base_preds
        zone_ids = base_df["zone_id"].values
        
        map_deltas = {
            z_id: round(float(d), 3) for z_id, d in zip(zone_ids, deltas)
        }
        
        # Selected zone delta
        selected_delta = None
        if request.selected_zone_id:
            idx_matches = np.where(zone_ids == request.selected_zone_id)[0]
            if len(idx_matches) > 0:
                idx = int(idx_matches[0])
                orig_p = float(base_preds[idx])
                new_p = float(cf_preds[idx])
                
                def p_to_risk(p):
                    if p >= 0.75: return RiskLevel.CRITICAL
                    if p >= 0.50: return RiskLevel.HIGH
                    if p >= 0.25: return RiskLevel.MODERATE
                    return RiskLevel.LOW
                    
                selected_delta = WhatIfZoneDelta(
                    zone_id=request.selected_zone_id,
                    original_prob=round(orig_p, 3),
                    simulated_prob=round(new_p, 3),
                    delta_prob=round(new_p - orig_p, 3),
                    original_risk=p_to_risk(orig_p),
                    simulated_risk=p_to_risk(new_p)
                )
                
        # Summary statistics
        affected_summary = {
            "avg_probability_increase": round(float(np.mean(deltas)), 3),
            "max_probability_increase": round(float(np.max(deltas)), 3),
            "critical_zones_baseline": int(np.sum(base_preds >= 0.75)),
            "critical_zones_simulated": int(np.sum(cf_preds >= 0.75)),
            "net_critical_increase": int(np.sum(cf_preds >= 0.75) - np.sum(base_preds >= 0.75))
        }
        
        return WhatIfResponse(
            rainfall_multiplier=request.rainfall_multiplier,
            drain_blockage_pct=request.drain_blockage_pct,
            selected_zone_delta=selected_delta,
            affected_zones_summary=affected_summary,
            map_deltas=map_deltas,
            is_simulated=True
        )

whatif_service = WhatIfService()
