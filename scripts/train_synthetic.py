import os
import json
from pathlib import Path
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    roc_auc_score, precision_recall_curve, auc, brier_score_loss,
    f1_score, precision_score, recall_score, confusion_matrix
)
from datetime import datetime, timezone

from backend.app.simulation.engine import simulation_engine

FEATURE_COLS = [
    "rainfall_current", "rainfall_1h", "rainfall_3h", "rainfall_6h", "rainfall_24h",
    "forecast_1h", "forecast_3h", "forecast_6h",
    "elevation", "slope", "flow_accumulation", "dist_to_river", "dist_to_drain",
    "twi", "hand", "impervious_ratio", "building_density", "road_density",
    "drainage_density", "soil_moisture", "upstream_river_stage"
]

def calculate_ece(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10) -> float:
    """Calculates Expected Calibration Error (ECE)."""
    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        in_bin = (y_prob >= bin_boundaries[i]) & (y_prob < bin_boundaries[i + 1])
        prop_in_bin = np.mean(in_bin)
        if prop_in_bin > 0:
            accuracy_in_bin = np.mean(y_true[in_bin])
            avg_confidence_in_bin = np.mean(y_prob[in_bin])
            ece += np.abs(avg_confidence_in_bin - accuracy_in_bin) * prop_in_bin
    return float(ece)

def train_synthetic_xgboost():
    print("Generating synthetic training dataset across scenarios...")
    dfs = []
    
    # Generate multi-scenario samples
    scenarios_to_sample = ["dry_day", "thunderstorm", "monsoon_continuous", "cloudburst", "compound_surge"]
    for sc_id in scenarios_to_sample:
        simulation_engine.set_scenario(sc_id)
        # Sample across hours: early, mid, peak
        for h in [1.0, 2.5, 4.0, 6.0]:
            df_step = simulation_engine.get_feature_table(hour=h)
            dfs.append(df_step)
            
    full_df = pd.concat(dfs, ignore_index=True)
    print(f"Total synthetic training records: {len(full_df)}")
    
    X = full_df[FEATURE_COLS]
    y = full_df["target_flood"]
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )
    
    print(f"Training XGBoost on {len(X_train)} samples with {len(FEATURE_COLS)} features...")
    model = xgb.XGBClassifier(
        n_estimators=120,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        eval_metric="logloss",
        random_state=42
    )
    model.fit(X_train, y_train)
    
    # Evaluation
    probs = model.predict_proba(X_test)[:, 1]
    preds = (probs >= 0.5).astype(int)
    
    roc_auc = float(roc_auc_score(y_test, probs))
    precision_pts, recall_pts, _ = precision_recall_curve(y_test, probs)
    pr_auc = float(auc(recall_pts, precision_pts))
    brier = float(brier_score_loss(y_test, probs))
    ece = calculate_ece(y_test.values, probs)
    f1 = float(f1_score(y_test, preds))
    prec = float(precision_score(y_test, preds, zero_division=0))
    rec = float(recall_score(y_test, preds))
    cm = confusion_matrix(y_test, preds).tolist()
    
    print("--- Model Evaluation Metrics (Synthetic Benchmark) ---")
    print(f"ROC-AUC:   {roc_auc:.4f}")
    print(f"PR-AUC:    {pr_auc:.4f}")
    print(f"Brier:     {brier:.4f}")
    print(f"ECE:       {ece:.4f}")
    print(f"F1-Score:  {f1:.4f}")
    print(f"Precision: {prec:.4f}")
    print(f"Recall:    {rec:.4f}")
    print(f"Confusion Matrix: {cm}")
    
    # Save artifacts
    artifacts_dir = Path("ml/artifacts")
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    
    model_path = artifacts_dir / "xgboost_flood_v1.json"
    model.save_model(str(model_path))
    print(f"Model saved to {model_path}")
    
    metadata = {
        "model_name": "xgboost-synthetic-v1",
        "model_version": "1.0.0",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "trained_on": "synthetic",
        "features": FEATURE_COLS,
        "metrics": {
            "roc_auc": round(roc_auc, 4),
            "pr_auc": round(pr_auc, 4),
            "brier_score": round(brier, 4),
            "expected_calibration_error": round(ece, 4),
            "f1_score": round(f1, 4),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "confusion_matrix": cm
        },
        "hyperparameters": {
            "n_estimators": 120,
            "max_depth": 5,
            "learning_rate": 0.08,
            "subsample": 0.85
        },
        "disclaimer": "Trained on synthetic simulation data to validate engineering pipeline. Not for real emergency warnings."
    }
    
    meta_path = artifacts_dir / "model_metadata.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Metadata saved to {meta_path}")

if __name__ == "__main__":
    train_synthetic_xgboost()
