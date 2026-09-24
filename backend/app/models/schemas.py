from typing import List, Dict, Any, Optional
from enum import Enum
from pydantic import BaseModel, Field

class FloodType(str, Enum):
    PLUVIAL = "PLUVIAL"
    FLUVIAL = "FLUVIAL"
    COMPOUND = "COMPOUND"

class RiskLevel(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class AlertState(str, Enum):
    ISSUED = "ISSUED"
    ESCALATED = "ESCALATED"
    DOWNGRADED = "DOWNGRADED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"
    EXPIRED = "EXPIRED"

# --- Static Zone Schemas ---
class ZoneGeometry(BaseModel):
    type: str = "Polygon"
    coordinates: List[List[List[float]]] # GeoJSON polygon coordinates [[ [lon, lat], ... ]]

class ZoneStatic(BaseModel):
    zone_id: str
    name: str
    locality: str
    centroid_lat: float
    centroid_lon: float
    geometry: ZoneGeometry
    # Baseline terrain & urban attributes
    elevation_m: float
    slope_deg: float
    flow_accumulation: float
    dist_to_river_m: float
    dist_to_drain_m: float
    twi: float
    hand_m: float
    impervious_ratio: float
    building_density: float
    road_density: float
    vegetation_ratio: float
    drainage_density_km_km2: float
    # Exposure baseline
    population: int
    critical_facilities_count: int
    road_importance_score: float
    is_simulated: bool = True

class ZonesListResponse(BaseModel):
    total_zones: int
    crs: str = "EPSG:4326"
    zones: List[ZoneStatic]
    is_simulated: bool = True
    generated_at: str

# --- Compact Dynamic Values by zone_id (for fast 60fps rendering) ---
class CompactZoneDynamic(BaseModel):
    p1: float = Field(..., description="1-hour flood probability")
    p1_low: float
    p1_high: float
    p3: float = Field(..., description="3-hour flood probability")
    p6: float = Field(..., description="6-hour flood probability")
    risk: RiskLevel
    flood_type: FloodType
    rf_current: float = Field(..., description="Current rainfall intensity in mm/h")
    rf_accum_1h: float
    rf_accum_3h: float
    rf_accum_6h: float
    priority_score: float
    confidence: float

class FloodMapResponse(BaseModel):
    timestamp: str
    scenario_id: str
    zone_data: Dict[str, CompactZoneDynamic] # Keyed by zone_id
    is_simulated: bool = True
    generated_at: str

# --- Comprehensive Zone Intelligence (Section 8) ---
class WeatherIntelligence(BaseModel):
    current_rainfall_mm_h: float
    rainfall_1h_mm: float
    rainfall_3h_mm: float
    rainfall_6h_mm: float
    rainfall_24h_mm: float
    temperature_c: float
    humidity_pct: float
    wind_speed_km_h: float
    pressure_hpa: float
    soil_moisture: float

class TerrainIntelligence(BaseModel):
    elevation_m: float
    slope_deg: float
    flow_accumulation: float
    dist_to_river_m: float
    dist_to_drain_m: float
    twi: float
    hand_m: float

class UrbanIntelligence(BaseModel):
    impervious_pct: float
    building_density: float
    road_density: float
    vegetation_pct: float
    drainage_density: float
    drain_capacity_index: float
    drain_blockage_pct: float

class ExposureIntelligence(BaseModel):
    population: int
    critical_facilities: List[str] # ["Hospital", "Metro Station", etc.]
    nearby_underpasses: int
    road_importance_score: float
    vulnerability_score: float

class PredictionHorizon(BaseModel):
    horizon_hours: int
    probability: float
    interval_low: float
    interval_high: float
    risk_level: RiskLevel

class ForecastDataPoint(BaseModel):
    hour: int # 1 to 6
    probability: float
    interval_low: float
    interval_high: float
    forecast_rain_mm_h: float

class ShapFeatureContribution(BaseModel):
    feature_name: str
    display_name: str
    feature_value: float
    contribution: float # Positive increases flood risk, negative decreases
    unit: str

class ExplanationIntelligence(BaseModel):
    top_factors: List[str]
    summary_sentence: str
    contributions: List[ShapFeatureContribution]
    model_name: str
    model_version: str

class ZoneIntelligenceResponse(BaseModel):
    zone_id: str
    name: str
    locality: str
    latitude: float
    longitude: float
    flood_type: FloodType
    risk_level: RiskLevel
    estimated_severity: float # 0.0 to 1.0 scale
    confidence: float # 0 to 100%
    priority_score: float
    prediction_timestamp: str
    model_name: str
    model_version: str
    is_simulated: bool = True
    
    weather: WeatherIntelligence
    terrain: TerrainIntelligence
    urban: UrbanIntelligence
    exposure: ExposureIntelligence
    predictions: List[PredictionHorizon]
    forecast_timeline: List[ForecastDataPoint]
    explanation: ExplanationIntelligence

# --- Alert Schemas (Section 17) ---
class AlertAuditEntry(BaseModel):
    timestamp: str
    action: str # "CREATED", "ACKNOWLEDGED", "RESOLVED", "ESCALATED"
    performed_by: str
    notes: Optional[str] = None

class CAPAlertPayload(BaseModel):
    identifier: str
    sender: str
    sent: str
    status: str = "Draft" # Simulation prototype
    msgType: str = "Alert"
    scope: str = "Public"
    event: str = "Urban Flood Early Warning"
    urgency: str
    severity: str
    certainty: str
    headline: str
    description: str
    areaDesc: str

class Alert(BaseModel):
    id: str
    timestamp: str
    zone_id: str
    zone_name: str
    flood_type: FloodType
    risk_level: RiskLevel
    probability: float
    interval_low: float
    interval_high: float
    confidence: float
    severity: float
    model_version: str
    top_factors: List[str]
    forecast_summary: str
    state: AlertState
    message_en: str
    message_hi: str
    cap: CAPAlertPayload
    audit_trail: List[AlertAuditEntry]
    is_simulated: bool = True

class AlertAcknowledgeRequest(BaseModel):
    user_id: str = "analyst_demo"
    notes: Optional[str] = "Operator acknowledged alert via operations dashboard."

# --- Prioritization Schemas (Section 16) ---
class PriorityItem(BaseModel):
    rank: int
    zone_id: str
    name: str
    locality: str
    flood_type: FloodType
    risk_level: RiskLevel
    priority_score: float
    hazard_score: float
    exposure_score: float
    vulnerability_score: float
    population_at_risk: int
    critical_facilities_count: int
    is_simulated: bool = True

class PrioritiesResponse(BaseModel):
    timestamp: str
    top_zones: List[PriorityItem]
    is_simulated: bool = True

# --- What-If Counterfactual Schemas (Section 7, 24) ---
class WhatIfRequest(BaseModel):
    rainfall_multiplier: float = Field(1.0, ge=0.0, le=3.0, description="e.g. 1.5 for +50% rain")
    drain_blockage_pct: float = Field(0.0, ge=0.0, le=100.0, description="0 to 100% blockage")
    selected_zone_id: Optional[str] = None

class WhatIfZoneDelta(BaseModel):
    zone_id: str
    original_prob: float
    simulated_prob: float
    delta_prob: float
    original_risk: RiskLevel
    simulated_risk: RiskLevel

class WhatIfResponse(BaseModel):
    rainfall_multiplier: float
    drain_blockage_pct: float
    selected_zone_delta: Optional[WhatIfZoneDelta] = None
    affected_zones_summary: Dict[str, Any]
    map_deltas: Dict[str, float] # zone_id -> delta probability
    is_simulated: bool = True

# --- Simulation Control Schemas (Section 6, 24) ---
class SimulationState(BaseModel):
    is_running: bool
    current_time: str
    scenario_id: str
    scenario_name: str
    speed: int
    elapsed_seconds: float
    total_duration_hours: float
    is_simulated: bool = True

class SimulationControlRequest(BaseModel):
    action: str # "play", "pause", "set_speed", "seek", "set_scenario"
    speed: Optional[int] = None
    seek_seconds: Optional[float] = None
    scenario_id: Optional[str] = None
