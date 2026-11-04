import os
import yaml
import numpy as np
import pandas as pd
from typing import List, Dict, Any
from datetime import datetime, timezone

from backend.app.core.config import settings
from backend.app.models.schemas import PriorityItem, FloodType, RiskLevel

class ExposureService:
    """
    Computes exposure indices and impact-based priority scores:
    Priority Score = f(Hazard, Exposure, Vulnerability)
    """
    def __init__(self):
        self._load_weights()

    def _load_weights(self):
        cfg_file = settings.CONFIG_DIR / "risk_thresholds.yaml"
        if os.path.exists(cfg_file):
            with open(cfg_file, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f)
                self.weights = cfg.get("weights", {"hazard": 0.50, "exposure": 0.35, "vulnerability": 0.15})
        else:
            self.weights = {"hazard": 0.50, "exposure": 0.35, "vulnerability": 0.15}

    def compute_priorities(self, feature_df: pd.DataFrame, top_n: int = 10) -> List[PriorityItem]:
        """Rank zones by impact-based priority score."""
        w_h = self.weights["hazard"]
        w_e = self.weights["exposure"]
        w_v = self.weights["vulnerability"]
        
        # Normalize exposure components
        max_pop = max(1.0, float(feature_df["population"].max()))
        pop_norm = feature_df["population"].values / max_pop
        
        fac_norm = np.clip(feature_df["critical_facilities_count"].values / 3.0, 0.0, 1.0)
        road_norm = np.clip(feature_df["road_importance_score"].values, 0.0, 1.0)
        
        # Exposure score
        exposure_scores = pop_norm * 0.5 + fac_norm * 0.3 + road_norm * 0.2
        
        # Vulnerability score (low drainage density + high impervious + low HAND)
        vulnerability_scores = np.clip(
            (feature_df["impervious_ratio"].values * 0.4) +
            (np.maximum(0.0, 1.0 - feature_df["hand"].values / 4.0) * 0.4) +
            (np.maximum(0.0, 1.0 - feature_df["drainage_density"].values / 3.0) * 0.2),
            0.0, 1.0
        )
        
        hazard_scores = np.clip(feature_df["hazard_index"].values, 0.0, 1.0)
        
        # Priority Score
        priority_scores = (hazard_scores * w_h) + (exposure_scores * w_e) + (vulnerability_scores * w_v)
        
        # Create temp ranking dataframe
        ranked_df = feature_df.copy()
        ranked_df["priority_score"] = np.round(priority_scores, 3)
        ranked_df["hazard_score"] = np.round(hazard_scores, 3)
        ranked_df["exposure_score"] = np.round(exposure_scores, 3)
        ranked_df["vulnerability_score"] = np.round(vulnerability_scores, 3)
        
        ranked_df = ranked_df.sort_values(by="priority_score", ascending=False).head(top_n)
        
        items = []
        for rank, (_, row) in enumerate(ranked_df.iterrows(), start=1):
            # Derive risk level from hazard
            h = row["hazard_score"]
            if h >= 0.75:
                r_level = RiskLevel.CRITICAL
            elif h >= 0.50:
                r_level = RiskLevel.HIGH
            elif h >= 0.25:
                r_level = RiskLevel.MODERATE
            else:
                r_level = RiskLevel.LOW
                
            items.append(PriorityItem(
                rank=rank,
                zone_id=row["zone_id"],
                name=row["name"],
                locality=row["locality"],
                flood_type=FloodType(row["flood_type"]),
                risk_level=r_level,
                priority_score=float(row["priority_score"]),
                hazard_score=float(row["hazard_score"]),
                exposure_score=float(row["exposure_score"]),
                vulnerability_score=float(row["vulnerability_score"]),
                population_at_risk=int(row["population"]),
                critical_facilities_count=int(row["critical_facilities_count"]),
                is_simulated=True
            ))
            
        return items

exposure_service = ExposureService()
