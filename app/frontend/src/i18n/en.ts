export const en = {
  // Navigation & Branding
  brand_title: "FloodShield",
  brand_subtitle: "River Flood Early Warning System",
  basins_label: "Godavari & Mahanadi Basins",
  nav_dashboard: "Basin Dashboard",
  nav_alerts: "Early-Warning Feed",
  nav_model_info: "Model & Data",
  replay_badge: "REPLAY: past data, 2009-2012",
  lang_toggle: "English | हिन्दी",

  // Disclaimer
  cwc_disclaimer: "Notice: Flood alert status indicates predicted streamflow exceeding the gauge's own statistical high-flow threshold (q95), NOT an official Central Water Commission (CWC) declared flood stage. Simulated advisory only.",
  footer_attribution: "Weather data by Open-Meteo.com (CC BY 4.0)",
  footer_sources: "Streamflow observations: CAMELS-IND (India-WRIS) · River topology: HydroRIVERS",

  // Dashboard Controls
  date_label: "Forecast Date:",
  lead_day_label: "Lead Horizon:",
  nowcast: "Nowcast (+1d)",
  headline_day2: "+2 Days",
  headline_day3: "+3 Days",
  headline_day4: "+4 Days",

  // KPI Summary Cards
  kpi_gauges_monitored: "Gauges Monitored",
  kpi_warning_alerts: "WARNING (Above q95)",
  kpi_watch_alerts: "WATCH (q90 – q95)",
  kpi_next_peak: "Expected Peak Flow",
  kpi_peak_at: "Peak at",

  // Map & Gauge list
  map_title: "River Network Status Map",
  active_alerts_title: "Active Basin Alerts",
  no_alerts_message: "All gauges operating below watch threshold (Normal)",
  status_ok: "OK",
  status_watch: "WATCH",
  status_warning: "WARNING",
  gauge_id: "Gauge ID",
  river: "River",
  basin: "Basin",
  predicted_flow: "Predicted Flow",
  observed_flow: "Observed Flow",
  flood_threshold: "High-Flow Threshold (q95)",
  watch_threshold: "Watch Threshold (q90)",
  view_forecast: "View 4-Day Forecast →",

  // Single Gauge Page
  back_to_dashboard: "← Back to Dashboard",
  hydrograph_title: "4-Day Lead Streamflow Forecast",
  hydrograph_subtitle: "STG-Mamba predictions vs historical flood percentiles",
  lead_day_1: "Day 1 (Nowcast)",
  lead_day_2: "Day 2 (Headline)",
  lead_day_3: "Day 3 (Headline)",
  lead_day_4: "Day 4 (Headline)",
  observed_actual: "Observed Streamflow (Ground Truth)",
  no_observed_data: "No sensor observation recorded for this date",
  connected_reaches: "River Network Connectivity",
  upstream_gauges: "Upstream Inflow Gauges",
  downstream_gauges: "Downstream Outflow Gauges",
  no_upstream: "Headwater reach (no upstream gauges monitored)",
  no_downstream: "Terminal basin reach (drains to delta / Bay of Bengal)",

  // Alerts Feed Page
  alerts_feed_title: "Early-Warning Broadcast Feed",
  alerts_feed_subtitle: "Simulated CAP / SMS emergency bulletins for downstream water authorities",
  approx_time_label: "Expected Arrival:",
  approx_time_hint: "Approximate timing: Daily model cannot resolve exact hour",
  drafted_sms_title: "Drafted CAP / SMS Bulletin:",
  copy_message: "Copy Bulletin",
  copied: "Copied!",
  simulated_notice: "Simulated Dispatch: No messages are transmitted to public networks.",
  no_active_alerts: "No active flood warnings or watches for this date and lead horizon.",

  // Model Info Page
  model_info_title: "STG-Mamba Architecture & Validation Data",
  model_info_subtitle: "Technical documentation of the river forecasting engine and data lineage",
  forecaster_engine: "Primary Forecasting Engine",
  correction_stage_title: "Planned Residual Correction",
  training_window: "Training Period",
  validation_window: "Validation Replay Window",
  data_sources_title: "Data Sources & Lineage"
};

