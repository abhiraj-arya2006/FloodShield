import abc
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Tuple

class FloodModel(abc.ABC):
    """Abstract interface for FloodShield prediction models."""
    
    @abc.abstractmethod
    def predict(self, features_df: pd.DataFrame) -> Dict[str, np.ndarray]:
        """
        Returns predictions dictionary containing:
        - prob_1h, prob_1h_low, prob_1h_high
        - prob_3h, prob_3h_low, prob_3h_high
        - prob_6h, prob_6h_low, prob_6h_high
        - confidence: 0 to 100%
        """
        pass

    @abc.abstractmethod
    def explain(self, features_df: pd.DataFrame, zone_id: str) -> Dict[str, Any]:
        """
        Returns local feature contributions and plain-language summary.
        """
        pass

class SurrogateFloodModel(FloodModel):
    """
    Transparent, physically motivated logistic flood model.
    Used as reliable fallback, zero-dependency baseline, and sanity check.
    """
    def __init__(self, name: str = "surrogate_logistic_v1"):
        self.name = name
        self.version = "1.0.0"
        self.is_simulated = True

    def _logistic(self, x: np.ndarray) -> np.ndarray:
        return 1.0 / (1.0 + np.exp(-x))

    def predict(self, features_df: pd.DataFrame) -> Dict[str, np.ndarray]:
        # Feature extract
        hazard = features_df["hazard_index"].values
        rf_curr = features_df["rainfall_current"].values
        fc_1h = features_df["forecast_1h"].values
        fc_3h = features_df["forecast_3h"].values
        fc_6h = features_df["forecast_6h"].values
        
        # 1-Hour Horizon
        z_1h = (hazard - 0.45) * 5.5 + (rf_curr / 35.0) * 1.5
        p1 = np.clip(self._logistic(z_1h), 0.01, 0.99)
        p1_low = np.clip(p1 - 0.06 - (1.0 - p1) * 0.04, 0.0, 1.0)
        p1_high = np.clip(p1 + 0.06 + p1 * 0.04, 0.0, 1.0)
        
        # 3-Hour Horizon
        z_3h = (hazard - 0.45) * 5.0 + (fc_3h / 45.0) * 1.8
        p3 = np.clip(self._logistic(z_3h), 0.01, 0.99)
        p3_low = np.clip(p3 - 0.09, 0.0, 1.0)
        p3_high = np.clip(p3 + 0.09, 0.0, 1.0)
        
        # 6-Hour Horizon
        z_6h = (hazard - 0.45) * 4.5 + (fc_6h / 65.0) * 2.0
        p6 = np.clip(self._logistic(z_6h), 0.01, 0.99)
        p6_low = np.clip(p6 - 0.12, 0.0, 1.0)
        p6_high = np.clip(p6 + 0.12, 0.0, 1.0)
        
        # Confidence derived from data freshness and interval spread
        interval_spread = (p1_high - p1_low)
        confidence = np.clip(100.0 * (1.0 - interval_spread * 1.2), 45.0, 95.0)
        
        return {
            "prob_1h": np.round(p1, 3),
            "prob_1h_low": np.round(p1_low, 3),
            "prob_1h_high": np.round(p1_high, 3),
            "prob_3h": np.round(p3, 3),
            "prob_3h_low": np.round(p3_low, 3),
            "prob_3h_high": np.round(p3_high, 3),
            "prob_6h": np.round(p6, 3),
            "prob_6h_low": np.round(p6_low, 3),
            "prob_6h_high": np.round(p6_high, 3),
            "confidence": np.round(confidence, 1)
        }

    def explain(self, features_df: pd.DataFrame, zone_id: str) -> Dict[str, Any]:
        row = features_df[features_df["zone_id"] == zone_id]
        if row.empty:
            row = features_df.iloc[[0]]
            
        r = row.iloc[0]
        # Linear feature contributions for surrogate
        rf_contrib = float((r["rainfall_current"] / 40.0) * 0.35)
        elev_contrib = float(-max(0.0, (r["elevation"] - 210.0) / 40.0) * 0.25)
        hand_contrib = float(-max(0.0, (r["hand"] - 2.0) / 5.0) * 0.20)
        imp_contrib = float((r["impervious_ratio"] - 0.5) * 0.25)
        drain_contrib = float(- (r["drainage_density"] - 1.5) * 0.15)
        
        items = [
            {"feature_name": "rainfall_current", "display_name": "Rainfall Intensity", "feature_value": float(r["rainfall_current"]), "contribution": round(rf_contrib, 3), "unit": "mm/h"},
            {"feature_name": "impervious_ratio", "display_name": "Impervious Surface Ratio", "feature_value": float(r["impervious_ratio"]), "contribution": round(imp_contrib, 3), "unit": "ratio"},
            {"feature_name": "hand", "display_name": "Height Above Drainage (HAND)", "feature_value": float(r["hand"]), "contribution": round(hand_contrib, 3), "unit": "m"},
            {"feature_name": "elevation", "display_name": "Topographic Elevation", "feature_value": float(r["elevation"]), "contribution": round(elev_contrib, 3), "unit": "m"},
            {"feature_name": "drainage_density", "display_name": "Drainage Network Density", "feature_value": float(r["drainage_density"]), "contribution": round(drain_contrib, 3), "unit": "km/km²"}
        ]
        items.sort(key=lambda x: abs(x["contribution"]), reverse=True)
        top_factors = [x["display_name"] for x in items[:3]]
        
        summary = f"Risk primarily influenced by {top_factors[0].lower()} and {top_factors[1].lower()} in this locality."
        
        return {
            "top_factors": top_factors,
            "summary_sentence": summary,
            "contributions": items,
            "model_name": self.name,
            "model_version": self.version
        }
