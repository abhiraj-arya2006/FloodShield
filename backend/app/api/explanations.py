from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone

from backend.app.simulation.engine import simulation_engine
from ml.xgboost.model import XGBoostFloodModel

router = APIRouter(prefix="/explanations", tags=["Explainability (SHAP)"])
model = XGBoostFloodModel()

@router.get("/{zone_id}")
def get_zone_explanation(zone_id: str):
    """
    Returns real SHAP TreeExplainer feature attributions for a given zone:
    Positive/negative contributions, grouped display names, and plain-language summary.
    """
    df = simulation_engine.get_feature_table()
    row = df[df["zone_id"] == zone_id]
    if row.empty:
        raise HTTPException(status_code=404, detail=f"Zone {zone_id} not found.")
        
    explanation = model.explain(df, zone_id)
    return {
        "zone_id": zone_id,
        "name": row["name"].iloc[0],
        "top_factors": explanation["top_factors"],
        "summary_sentence": explanation["summary_sentence"],
        "contributions": explanation["contributions"],
        "model_name": explanation["model_name"],
        "model_version": explanation["model_version"],
        "disclaimer": "SHAP values explain model predictions based on inputs, not direct physical causation.",
        "is_simulated": True,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
