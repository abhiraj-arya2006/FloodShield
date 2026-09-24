export type FloodType = 'PLUVIAL' | 'FLUVIAL' | 'COMPOUND';
export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type AlertState = 'ISSUED' | 'ESCALATED' | 'DOWNGRADED' | 'ACKNOWLEDGED' | 'RESOLVED' | 'EXPIRED';

export interface ZoneGeometry {
  type: 'Polygon';
  coordinates: number[][][]; // GeoJSON [[[lon, lat], ...]]
}

export interface ZoneStatic {
  zone_id: string;
  name: string;
  locality: string;
  centroid_lat: number;
  centroid_lon: number;
  geometry: ZoneGeometry;
  elevation_m: number;
  slope_deg: number;
  flow_accumulation: number;
  dist_to_river_m: number;
  dist_to_drain_m: number;
  twi: number;
  hand_m: number;
  impervious_ratio: number;
  building_density: number;
  road_density: number;
  vegetation_ratio: number;
  drainage_density_km_km2: number;
  population: number;
  critical_facilities_count: number;
  road_importance_score: number;
  is_simulated: boolean;
}

export interface ZonesListResponse {
  total_zones: number;
  crs: string;
  zones: ZoneStatic[];
  is_simulated: boolean;
  generated_at: string;
}

export interface CompactZoneDynamic {
  p1: number;
  p1_low: number;
  p1_high: number;
  p3: number;
  p6: number;
  risk: RiskLevel;
  flood_type: FloodType;
  rf_current: number;
  rf_accum_1h: number;
  rf_accum_3h: number;
  rf_accum_6h: number;
  priority_score: number;
  confidence: number;
}

export interface FloodMapResponse {
  timestamp: string;
  scenario_id: string;
  zone_data: Record<string, CompactZoneDynamic>;
  is_simulated: boolean;
  generated_at: string;
}

export interface WeatherIntelligence {
  current_rainfall_mm_h: number;
  rainfall_1h_mm: number;
  rainfall_3h_mm: number;
  rainfall_6h_mm: number;
  rainfall_24h_mm: number;
  temperature_c: number;
  humidity_pct: number;
  wind_speed_km_h: number;
  pressure_hpa: number;
  soil_moisture: number;
}

export interface TerrainIntelligence {
  elevation_m: number;
  slope_deg: number;
  flow_accumulation: number;
  dist_to_river_m: number;
  dist_to_drain_m: number;
  twi: number;
  hand_m: number;
}

export interface UrbanIntelligence {
  impervious_pct: number;
  building_density: number;
  road_density: number;
  vegetation_pct: number;
  drainage_density: number;
  drain_capacity_index: number;
  drain_blockage_pct: number;
}

export interface ExposureIntelligence {
  population: number;
  critical_facilities: string[];
  nearby_underpasses: number;
  road_importance_score: number;
  vulnerability_score: number;
}

export interface PredictionHorizon {
  horizon_hours: number;
  probability: number;
  interval_low: number;
  interval_high: number;
  risk_level: RiskLevel;
}

export interface ForecastDataPoint {
  hour: number;
  probability: number;
  interval_low: number;
  interval_high: number;
  forecast_rain_mm_h: number;
}

export interface ShapFeatureContribution {
  feature_name: string;
  display_name: string;
  feature_value: number;
  contribution: number;
  unit: string;
}

export interface ExplanationIntelligence {
  top_factors: string[];
  summary_sentence: string;
  contributions: ShapFeatureContribution[];
  model_name: string;
  model_version: string;
}

export interface ZoneIntelligenceResponse {
  zone_id: string;
  name: string;
  locality: string;
  latitude: number;
  longitude: number;
  flood_type: FloodType;
  risk_level: RiskLevel;
  estimated_severity: number;
  confidence: number;
  priority_score: number;
  prediction_timestamp: string;
  model_name: string;
  model_version: string;
  is_simulated: boolean;
  weather: WeatherIntelligence;
  terrain: TerrainIntelligence;
  urban: UrbanIntelligence;
  exposure: ExposureIntelligence;
  predictions: PredictionHorizon[];
  forecast_timeline: ForecastDataPoint[];
  explanation: ExplanationIntelligence;
}

export interface AlertAuditEntry {
  timestamp: string;
  action: string;
  performed_by: string;
  notes?: string;
}

export interface Alert {
  id: string;
  timestamp: string;
  zone_id: string;
  zone_name: string;
  flood_type: FloodType;
  risk_level: RiskLevel;
  probability: number;
  interval_low: number;
  interval_high: number;
  confidence: number;
  severity: number;
  model_version: string;
  top_factors: string[];
  forecast_summary: string;
  state: AlertState;
  message_en: string;
  message_hi: string;
  cap?: any;
  audit_trail: AlertAuditEntry[];
  is_simulated: boolean;
}

export interface PriorityItem {
  rank: number;
  zone_id: string;
  name: string;
  locality: string;
  flood_type: FloodType;
  risk_level: RiskLevel;
  priority_score: number;
  hazard_score: number;
  exposure_score: number;
  vulnerability_score: number;
  population_at_risk: number;
  critical_facilities_count: number;
  is_simulated: boolean;
}

export interface PrioritiesResponse {
  timestamp: string;
  top_zones: PriorityItem[];
  is_simulated: boolean;
}

export interface WhatIfRequest {
  rainfall_multiplier: number;
  drain_blockage_pct: number;
  selected_zone_id?: string;
}

export interface WhatIfZoneDelta {
  zone_id: string;
  original_prob: number;
  simulated_prob: number;
  delta_prob: number;
  original_risk: RiskLevel;
  simulated_risk: RiskLevel;
}

export interface WhatIfResponse {
  rainfall_multiplier: number;
  drain_blockage_pct: number;
  selected_zone_delta?: WhatIfZoneDelta;
  affected_zones_summary: {
    avg_probability_increase: number;
    max_probability_increase: number;
    critical_zones_baseline: number;
    critical_zones_simulated: number;
    net_critical_increase: number;
  };
  map_deltas: Record<string, number>;
  is_simulated: boolean;
}

export interface SimulationState {
  is_running: boolean;
  current_time: string;
  scenario_id: string;
  scenario_name: string;
  speed: number;
  elapsed_seconds: number;
  total_duration_hours: number;
  is_simulated: boolean;
}

export interface ScenarioItem {
  id: string;
  name: string;
  category: string;
  description: string;
  duration_hours: number;
  base_rainfall_mm_h: number;
}

export type MapLayerType =
  | 'flood_probability'
  | 'rainfall_intensity'
  | 'elevation'
  | 'slope'
  | 'drainage_density'
  | 'impervious_surface'
  | 'historical_flood_frequency'
  | 'satellite_flood_extent'
  | 'priority_score'
  | 'exposure';
