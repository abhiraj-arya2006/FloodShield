import os
import yaml
import numpy as np
from typing import Dict, Any, Tuple, Optional
from backend.app.core.config import settings
from backend.app.models.schemas import RiskLevel

class RiskEngine:
    """
    Dedicated RiskEngine computing risk levels, severity, and recommendations
    with hysteresis to prevent flickering at boundary thresholds.
    """
    def __init__(self):
        self._load_config()
        # Track previous risk state per zone for stateful hysteresis
        self._zone_prev_states: Dict[str, RiskLevel] = {}

    def _load_config(self):
        cfg_file = settings.CONFIG_DIR / "risk_thresholds.yaml"
        if os.path.exists(cfg_file):
            with open(cfg_file, "r", encoding="utf-8") as f:
                self.config = yaml.safe_load(f)
        else:
            self.config = {
                "thresholds": {
                    "low": {"max": 0.25},
                    "moderate": {"min": 0.25, "max": 0.50},
                    "high": {"min": 0.50, "max": 0.75},
                    "critical": {"min": 0.75, "max": 1.00}
                },
                "hysteresis": {"margin": 0.03}
            }
            
        self.t_mod = float(self.config["thresholds"]["moderate"]["min"])
        self.t_high = float(self.config["thresholds"]["high"]["min"])
        self.t_crit = float(self.config["thresholds"]["critical"]["min"])
        self.margin = float(self.config.get("hysteresis", {}).get("margin", 0.03))

    def evaluate_zone(
        self,
        zone_id: str,
        probability: float,
        hazard_index: float,
        rainfall_intensity: float
    ) -> Tuple[RiskLevel, float, str]:
        """
        Evaluate risk level with hysteresis for a single zone.
        Returns (RiskLevel, severity_score, recommended_attention).
        """
        prev_level = self._zone_prev_states.get(zone_id, RiskLevel.LOW)
        
        # Apply hysteresis thresholds based on previous state
        if prev_level == RiskLevel.CRITICAL:
            crit_bound = self.t_crit - self.margin
        else:
            crit_bound = self.t_crit
            
        if prev_level == RiskLevel.HIGH:
            high_bound = self.t_high - self.margin
        else:
            high_bound = self.t_high
            
        if prev_level == RiskLevel.MODERATE:
            mod_bound = self.t_mod - self.margin
        else:
            mod_bound = self.t_mod
            
        # Determine new level
        if probability >= crit_bound:
            new_level = RiskLevel.CRITICAL
            rec = "Immediate emergency response; evacuate low-lying settlements."
        elif probability >= high_bound:
            new_level = RiskLevel.HIGH
            rec = "Pre-position mobile dewatering pumps; alert emergency traffic units."
        elif probability >= mod_bound:
            new_level = RiskLevel.MODERATE
            rec = "Inspect critical drainage nodes and underpasses."
        else:
            new_level = RiskLevel.LOW
            rec = "Routine monitoring."
            
        self._zone_prev_states[zone_id] = new_level
        
        # Severity score (0.0 to 1.0)
        severity = float(np.clip(probability * 0.7 + hazard_index * 0.3, 0.0, 1.0))
        
        return new_level, round(severity, 3), rec

    def reset_state(self):
        """Clear historical zone states."""
        self._zone_prev_states.clear()

risk_engine = RiskEngine()
