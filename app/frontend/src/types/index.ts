export type AlertStatus = 'OK' | 'WATCH' | 'WARNING';

export interface GaugeItem {
  gauge_id: string;
  name: string;
  river: string;
  basin: string;
  ghi_lat: number;
  ghi_lon: number;
  q90_m3s: number;
  q95_m3s: number;
  watch_m3s: number;
  warning_m3s: number;
}

export interface GaugesResponse {
  total_gauges: number;
  gauges: GaugeItem[];
}

export interface EdgeItem {
  from_gauge_id: string;
  to_gauge_id: string;
  river_distance_km: number;
}

export interface EdgesResponse {
  total_edges: number;
  edges: EdgeItem[];
}

export interface DatesResponse {
  dates: string[];
  data_period: string;
  min_date: string;
  max_date: string;
  total_dates: number;
}

export interface GaugeForecastRow {
  gauge_id: string;
  name: string;
  river: string;
  basin: string;
  ghi_lat: number;
  ghi_lon: number;
  lead_day: number;
  headline_type: 'nowcast' | 'headline';
  predicted_m3s: number;
  q90_m3s: number;
  q95_m3s: number;
  watch_m3s: number;
  warning_m3s: number;
  status: AlertStatus;
  observed_m3s: number | null;
  mask: boolean;
}

export interface ForecastResponse {
  date: string;
  lead_day: number;
  mode: string;
  headline_type: 'nowcast' | 'headline';
  total_gauges: number;
  warning_count: number;
  watch_count: number;
  ok_count: number;
  gauges: GaugeForecastRow[];
}

export interface SingleGaugeLeadDay {
  lead_day: number;
  headline_type: 'nowcast' | 'headline';
  predicted_m3s: number;
  status: AlertStatus;
}

export interface SingleGaugeForecastResponse {
  gauge_id: string;
  name: string;
  river: string;
  basin: string;
  ghi_lat: number;
  ghi_lon: number;
  date: string;
  q90_m3s: number;
  q95_m3s: number;
  lead_days: SingleGaugeLeadDay[];
  observed_m3s: number | null;
  mask: boolean;
  mode: string;
}

export interface AlertItem {
  gauge_id: string;
  name: string;
  river: string;
  basin: string;
  ghi_lat: number;
  ghi_lon: number;
  lead_day: number;
  status: 'WATCH' | 'WARNING';
  predicted_m3s: number;
  threshold_m3s: number;
  q90_m3s: number;
  q95_m3s: number;
  exceedance_pct: number;
  observed_m3s: number | null;
  flood_day: boolean | null;
  drafted_message: string;
}

export interface AlertsResponse {
  date: string;
  lead_day: number;
  mode: string;
  total_alerts: number;
  warning_count: number;
  watch_count: number;
  alerts: AlertItem[];
}

export interface DataSourceInfo {
  name: string;
  role: string;
  citation: string;
}

export interface ModelInfoResponse {
  model_name: string;
  version: string;
  description: string;
  forecaster: string;
  correction_stage: string;
  training_years: string;
  validation_years: string;
  time_step: string;
  forecast_horizons: string;
  data_sources: DataSourceInfo[];
  disclaimer: string;
}

export interface HealthResponse {
  status: string;
  mode: string;
  data_period: string;
  predictions: string;
  alert_margin: number;
  total_gauges: number;
  timestamp: string;
}
