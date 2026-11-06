import os
import uuid
import yaml
import time
from typing import Dict, List, Optional
from datetime import datetime, timezone

from backend.app.core.config import settings
from backend.app.models.schemas import (
    Alert, AlertState, AlertAuditEntry, CAPAlertPayload, FloodType, RiskLevel
)

class AlertService:
    """
    Manages flood early warning alert lifecycle:
    - State machine: ISSUED -> ESCALATED -> ACKNOWLEDGED -> RESOLVED/EXPIRED
    - Cooldown per zone + escalation bypass
    - Locality clustering to prevent alert storms
    - Multi-language templates (EN & HI) and CAP-standard payloads
    - Audit log for operator actions
    """
    def __init__(self):
        self._load_policy()
        self.alerts: Dict[str, Alert] = {} # Keyed by alert_id
        self.zone_last_alert_time: Dict[str, float] = {} # zone_id -> sim_timestamp
        self.zone_last_risk_level: Dict[str, RiskLevel] = {}

    def _load_policy(self):
        policy_file = settings.CONFIG_DIR / "alert_policy.yaml"
        if os.path.exists(policy_file):
            with open(policy_file, "r", encoding="utf-8") as f:
                self.policy = yaml.safe_load(f)
        else:
            self.policy = {
                "alert_policy": {
                    "cooldown_seconds": 1800,
                    "min_confidence_gate": 0.60,
                    "escalation_bypasses_cooldown": True
                },
                "templates": {
                    "en": {"prefix": "[SIMULATION] "},
                    "hi": {"prefix": "[सिमुलेशन] "}
                }
            }

    def evaluate_and_create_alerts(
        self,
        features_df,
        predictions: Dict[str, any],
        current_sim_seconds: float
    ) -> List[Alert]:
        """
        Scan predicted zones and trigger alerts for CRITICAL / HIGH risks
        passing confidence gates, cooldowns, and deduplication rules.
        """
        cooldown_sec = float(self.policy["alert_policy"].get("cooldown_seconds", 1800))
        min_conf = float(self.policy["alert_policy"].get("min_confidence_gate", 0.60)) * 100.0
        
        new_alerts = []
        p1 = predictions["prob_1h"]
        p1_low = predictions["prob_1h_low"]
        p1_high = predictions["prob_1h_high"]
        conf = predictions["confidence"]
        
        # We cluster by locality: pick worst zone per locality to avoid 500 alerts
        seen_localities = set()
        
        for i, row in features_df.iterrows():
            prob = float(p1[i])
            confidence = float(conf[i])
            zone_id = row["zone_id"]
            locality = row["locality"]
            
            # Only trigger for High or Critical
            if prob < 0.50 or confidence < min_conf:
                continue
                
            risk_lvl = RiskLevel.CRITICAL if prob >= 0.75 else RiskLevel.HIGH
            
            # Spatial deduplication per tick: 1 representative alert per locality
            if locality in seen_localities:
                continue
                
            last_alert_time = self.zone_last_alert_time.get(zone_id, -999999.0)
            prev_risk = self.zone_last_risk_level.get(zone_id, RiskLevel.LOW)
            time_since_last = current_sim_seconds - last_alert_time
            
            is_escalation = (prev_risk in [RiskLevel.LOW, RiskLevel.MODERATE] and risk_lvl in [RiskLevel.HIGH, RiskLevel.CRITICAL]) or \
                            (prev_risk == RiskLevel.HIGH and risk_lvl == RiskLevel.CRITICAL)
                            
            # Cooldown check
            if time_since_last < cooldown_sec and not is_escalation:
                continue # Suppressed by cooldown
                
            # Create alert
            seen_localities.add(locality)
            self.zone_last_alert_time[zone_id] = current_sim_seconds
            self.zone_last_risk_level[zone_id] = risk_lvl
            
            alert = self._build_alert(
                zone_id=zone_id,
                zone_name=row["name"],
                flood_type=FloodType(row["flood_type"]),
                risk_level=risk_lvl,
                probability=prob,
                interval_low=float(p1_low[i]),
                interval_high=float(p1_high[i]),
                confidence=confidence,
                severity=float(row["target_flood_severity"]),
                forecast_rain_3h=float(row["forecast_3h"])
            )
            self.alerts[alert.id] = alert
            new_alerts.append(alert)
            
        return new_alerts

    def _build_alert(
        self,
        zone_id: str,
        zone_name: str,
        flood_type: FloodType,
        risk_level: RiskLevel,
        probability: float,
        interval_low: float,
        interval_high: float,
        confidence: float,
        severity: float,
        forecast_rain_3h: float
    ) -> Alert:
        alert_id = f"ALT_{uuid.uuid4().hex[:8].upper()}"
        now_str = datetime.now(timezone.utc).isoformat()
        
        prob_pct = int(probability * 100)
        low_pct = int(interval_low * 100)
        high_pct = int(interval_high * 100)
        conf_pct = int(confidence)
        
        top_factors = ["Extreme Precipitation", "High Impervious Ratio", "Low Drainage Elevation (HAND)"]
        if flood_type == FloodType.FLUVIAL:
            top_factors = ["Yamuna River Surge", "Low Embankment Freeboard", "River Proximity"]
        elif flood_type == FloodType.COMPOUND:
            top_factors = ["River Stage Overflow", "Urban Stormwater Backwater", "High Surface Runoff"]
            
        forecast_summary = f"Heavy localized rainfall of ~{forecast_rain_3h:.1f} mm forecast over next 3 hours."
        
        en_msg = (
            f"[SIMULATION] {risk_level.value} FLOOD RISK\n"
            f"Zone: {zone_name} · Flood Type: {flood_type.value}\n"
            f"Probability: {prob_pct}% ({low_pct}–{high_pct}%) · Confidence: {conf_pct}%\n"
            f"Forecast: {forecast_summary}\n"
            f"Top Factors: {', '.join(top_factors)}\n"
            f"Model: xgb-synthetic-v1.0.0"
        )
        
        hi_msg = (
            f"[सिमुलेशन] {risk_level.value} बाढ़ जोखिम चेतावनी\n"
            f"क्षेत्र: {zone_name} · बाढ़ का प्रकार: {flood_type.value}\n"
            f"संभावना: {prob_pct}% ({low_pct}–{high_pct}%) · विश्वसनीयता: {conf_pct}%\n"
            f"पूर्वानुमान: {forecast_summary}\n"
            f"प्रमुख कारक: {', '.join(top_factors)}\n"
            f"मॉडल: xgb-synthetic-v1.0.0"
        )
        
        cap = CAPAlertPayload(
            identifier=alert_id,
            sender="FloodShield-Prototype",
            sent=now_str,
            status="Draft",
            msgType="Alert",
            scope="Public",
            event=f"{risk_level.value} Flood Early Warning",
            urgency="Immediate" if risk_level == RiskLevel.CRITICAL else "Expected",
            severity="Extreme" if risk_level == RiskLevel.CRITICAL else "Severe",
            certainty="Observed" if confidence > 80 else "Likely",
            headline=f"[SIMULATION] {risk_level.value} Flood Warning for {zone_name}",
            description=en_msg,
            areaDesc=zone_name
        )
        
        audit = [
            AlertAuditEntry(
                timestamp=now_str,
                action="CREATED",
                performed_by="FloodShield-RiskEngine",
                notes="Automated early warning alert generated by simulation."
            )
        ]
        
        return Alert(
            id=alert_id,
            timestamp=now_str,
            zone_id=zone_id,
            zone_name=zone_name,
            flood_type=flood_type,
            risk_level=risk_level,
            probability=probability,
            interval_low=interval_low,
            interval_high=interval_high,
            confidence=confidence,
            severity=severity,
            model_version="xgb-synthetic-v1.0.0",
            top_factors=top_factors,
            forecast_summary=forecast_summary,
            state=AlertState.ISSUED,
            message_en=en_msg,
            message_hi=hi_msg,
            cap=cap,
            audit_trail=audit,
            is_simulated=True
        )

    def acknowledge_alert(self, alert_id: str, user_id: str, notes: str) -> Optional[Alert]:
        """Acknowledge alert and log audit trail."""
        alert = self.alerts.get(alert_id)
        if not alert:
            return None
        alert.state = AlertState.ACKNOWLEDGED
        alert.audit_trail.append(AlertAuditEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            action="ACKNOWLEDGED",
            performed_by=user_id,
            notes=notes
        ))
        return alert

    def resolve_alert(self, alert_id: str, user_id: str, notes: str) -> Optional[Alert]:
        """Resolve alert and log audit trail."""
        alert = self.alerts.get(alert_id)
        if not alert:
            return None
        alert.state = AlertState.RESOLVED
        alert.audit_trail.append(AlertAuditEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            action="RESOLVED",
            performed_by=user_id,
            notes=notes
        ))
        return alert

    def trigger_test_alert(self) -> Alert:
        """Inject a test alert for verification."""
        alert = self._build_alert(
            zone_id="DEL_0042",
            zone_name="Najafgarh Basin (DEL_0042)",
            flood_type=FloodType.PLUVIAL,
            risk_level=RiskLevel.CRITICAL,
            probability=0.89,
            interval_low=0.82,
            interval_high=0.94,
            confidence=82.0,
            severity=0.88,
            forecast_rain_3h=48.5
        )
        self.alerts[alert.id] = alert
        return alert

alert_service = AlertService()
