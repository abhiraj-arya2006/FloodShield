import os
import json
from pathlib import Path
import numpy as np
import pandas as pd
import xgboost as xgb
import shap
from typing import Dict, Any, List, Optional

from ml.baseline.surrogate import FloodModel
from scripts.train_synthetic import FEATURE_COLS

FEATURE_DISPLAY_NAMES = {
    "rainfall_current": ("Rainfall Intensity", "mm/h"),
    "rainfall_1h": ("1-Hour Accumulated Rain", "mm"),
    "rainfall_3h": ("3-Hour Accumulated Rain", "mm"),
    "rainfall_6h": ("6-Hour Accumulated Rain", "mm"),
    "rainfall_24h": ("24-Hour Accumulated Rain", "mm"),
    "forecast_1h": ("1-Hour Rain Forecast", "mm"),
    "forecast_3h": ("3-Hour Rain Forecast", "mm"),
    "forecast_6h": ("6-Hour Rain Forecast", "mm"),
    "elevation": ("Topographic Elevation", "m"),
    "slope": ("Terrain Slope", "deg"),
    "flow_accumulation": ("Upstream Flow Accumulation", "cells"),
    "dist_to_river": ("Distance to Yamuna River", "m"),
    "dist_to_drain": ("Distance to Najafgarh Drain", "m"),
    "twi": ("Topographic Wetness Index (TWI)", "index"),
    "hand": ("Height Above Drainage (HAND)", "m"),
    "impervious_ratio": ("Impervious Surface Ratio", "ratio"),
    "building_density": ("Building Density", "ratio"),
    "road_density": ("Road Network Density", "ratio"),
    "drainage_density": ("Drainage Network Density", "km/km²"),
    "soil_moisture": ("Soil Moisture Saturation", "ratio"),
    "upstream_river_stage": ("Upstream River Stage (Yamuna)", "m")
}

class XGBoostFloodModel(FloodModel):
    """
    Production XGBoost model trained on simulation scenarios.
    Computes multi-horizon flood probabilities, uncertainty intervals,
    and real SHAP TreeExplainer feature attributions.
    """
    def __init__(self, model_path: Optional[str] = None):
        self.name = "xgboost-synthetic-v1"
        self.version = "1.0.0"
        self.is_simulated = True
        
        default_path = Path("ml/artifacts/xgboost_flood_v1.json")
        self.model_path = Path(model_path) if model_path else default_path
        
        self.model = xgb.XGBClassifier()
        if self.model_path.exists():
            self.model.load_model(str(self.model_path))
            # Pre-initialize TreeExplainer for fast inference
            self.explainer = shap.TreeExplainer(self.model)
        else:
            self.explainer = None

    def predict(self, features_df: pd.DataFrame) -> Dict[str, np.ndarray]:
        X = features_df[FEATURE_COLS]
        
        # 1-Hour Horizon Probability
        probs_1h = self.model.predict_proba(X)[:, 1]
        
        # Uncertainty intervals via input perturbation (+/- 12% rainfall sensitivity)
        X_low = X.copy()
        X_high = X.copy()
        for c in ["rainfall_current", "rainfall_1h", "forecast_1h"]:
            X_low[c] = np.maximum(0.0, X_low[c] * 0.88)
            X_high[c] = X_high[c] * 1.12
            
        p1_low = np.clip(self.model.predict_proba(X_low)[:, 1] - 0.03, 0.0, 1.0)
        p1_high = np.clip(self.model.predict_proba(X_high)[:, 1] + 0.03, 0.0, 1.0)
        
        # 3-Hour Horizon Probability (weighted by 3h forecast)
        X_3h = X.copy()
        X_3h["rainfall_current"] = X["forecast_3h"] / 3.0
        X_3h["rainfall_1h"] = X["forecast_3h"] * 0.5
        probs_3h = np.clip(self.model.predict_proba(X_3h)[:, 1], 0.0, 1.0)
        p3_low = np.clip(probs_3h - 0.08, 0.0, 1.0)
        p3_high = np.clip(probs_3h + 0.08, 0.0, 1.0)
        
        # 6-Hour Horizon Probability
        X_6h = X.copy()
        X_6h["rainfall_current"] = X["forecast_6h"] / 6.0
        X_6h["rainfall_1h"] = X["forecast_6h"] * 0.3
        probs_6h = np.clip(self.model.predict_proba(X_6h)[:, 1], 0.0, 1.0)
        p6_low = np.clip(probs_6h - 0.12, 0.0, 1.0)
        p6_high = np.clip(probs_6h + 0.12, 0.0, 1.0)
        
        # Confidence score (0 to 100%)
        spread = p1_high - p1_low
        confidence = np.clip(100.0 * (1.0 - spread * 1.1), 40.0, 96.0)
        
        return {
            "prob_1h": np.round(probs_1h, 3),
            "prob_1h_low": np.round(p1_low, 3),
            "prob_1h_high": np.round(p1_high, 3),
            "prob_3h": np.round(probs_3h, 3),
            "prob_3h_low": np.round(p3_low, 3),
            "prob_3h_high": np.round(p3_high, 3),
            "prob_6h": np.round(probs_6h, 3),
            "prob_6h_low": np.round(p6_low, 3),
            "prob_6h_high": np.round(p6_high, 3),
            "confidence": np.round(confidence, 1)
        }

    def explain(self, features_df: pd.DataFrame, zone_id: str) -> Dict[str, Any]:
        row = features_df[features_df["zone_id"] == zone_id]
        if row.empty:
            row = features_df.iloc[[0]]
            
        X_single = row[FEATURE_COLS]
        
        # Compute real SHAP values using TreeExplainer
        shap_values = self.explainer(X_single)
        # shap_values.values has shape (1, num_features)
        vals = shap_values.values[0]
        
        contributions = []
        for i, col in enumerate(FEATURE_COLS):
            val = float(vals[i])
            f_val = float(X_single[col].iloc[0])
            disp_name, unit = FEATURE_DISPLAY_NAMES.get(col, (col, ""))
            contributions.append({
                "feature_name": col,
                "display_name": disp_name,
                "feature_value": round(f_val, 2),
                "contribution": round(val, 4),
                "unit": unit
            })
            
        # Sort by absolute SHAP contribution
        contributions.sort(key=lambda x: abs(x["contribution"]), reverse=True)
        top_factors = [x["display_name"] for x in contributions[:4] if abs(x["contribution"]) > 0.001]
        if not top_factors:
            top_factors = [contributions[0]["display_name"], contributions[1]["display_name"]]
            
        summary = f"Risk primarily driven by {top_factors[0].lower()} and {top_factors[1].lower()} in this locality."
        
        return {
            "top_factors": top_factors,
            "summary_sentence": summary,
            "contributions": contributions,
            "model_name": self.name,
            "model_version": self.version
        }
