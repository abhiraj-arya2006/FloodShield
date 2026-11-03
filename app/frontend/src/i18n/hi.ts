import { en } from './en';

export const hi: typeof en = {
  // Navigation & Branding
  brand_title: "फ्लडशील्ड",
  brand_subtitle: "नदी बाढ़ पूर्व चेतावनी प्रणाली",
  basins_label: "गोदावरी और महानदी बेसिन",
  nav_dashboard: "बेसिन डैशबोर्ड",
  nav_alerts: "पूर्व चेतावनी फीड",
  nav_model_info: "मॉडल एवं डेटा",
  replay_badge: "पुनरावृत्ति (रीप्ले): ऐतिहासिक डेटा, 2009-2012",
  lang_toggle: "English | हिन्दी",

  // Disclaimer
  cwc_disclaimer: "सूचना: बाढ़ चेतावनी गेज के अपने ऐतिहासिक उच्च-प्रवाह स्तर (q95) पर आधारित है, यह केंद्रीय जल आयोग (CWC) का आधिकारिक स्तर नहीं है। केवल अनुकरण (सिमुलेशन) उद्देश्य हेतु।",
  footer_attribution: "मौसम डेटा साभार: Open-Meteo.com (CC BY 4.0)",
  footer_sources: "जल प्रवाह अवलोकन: CAMELS-IND (India-WRIS) · नदी नेटवर्क: HydroRIVERS",

  // Dashboard Controls
  date_label: "पूर्वानुमान तिथि:",
  lead_day_label: "अग्रिम अवधि:",
  nowcast: "तात्कालिक अनुमान (+1 दिन)",
  headline_day2: "+2 दिन (मुख्य)",
  headline_day3: "+3 दिन (मुख्य)",
  headline_day4: "+4 दिन (मुख्य)",

  // KPI Summary Cards
  kpi_gauges_monitored: "निगरानी किए गए गेज",
  kpi_warning_alerts: "चेतावनी (q95 से अधिक)",
  kpi_watch_alerts: "सतर्कता (q90 – q95)",
  kpi_next_peak: "अधिकतम अनुमानित प्रवाह",
  kpi_peak_at: "चरम प्रवाह स्थल",

  // Map & Gauge list
  map_title: "नदी नेटवर्क स्थिति मानचित्र",
  active_alerts_title: "सक्रिय बेसिन चेतावनियाँ",
  no_alerts_message: "सभी गेज सतर्कता सीमा से नीचे सामान्य रूप से प्रवाहित हैं",
  status_ok: "सामान्य (OK)",
  status_watch: "सतर्कता (WATCH)",
  status_warning: "चेतावनी (WARNING)",
  gauge_id: "गेज पहचान",
  river: "नदी",
  basin: "बेसिन",
  predicted_flow: "अनुमानित प्रवाह",
  observed_flow: "वास्तविक प्रवाह",
  flood_threshold: "उच्च प्रवाह सीमा (q95)",
  watch_threshold: "सतर्कता सीमा (q90)",
  view_forecast: "4-दिवसीय पूर्वानुमान देखें →",

  // Single Gauge Page
  back_to_dashboard: "← डैशबोर्ड पर वापस जाएं",
  hydrograph_title: "4-दिवसीय नदी प्रवाह पूर्वानुमान",
  hydrograph_subtitle: "STG-Mamba पूर्वानुमान बनाम ऐतिहासिक बाढ़ प्रतिशतक",
  lead_day_1: "दिन 1 (नाउकास्ट)",
  lead_day_2: "दिन 2 (मुख्य)",
  lead_day_3: "दिन 3 (मुख्य)",
  lead_day_4: "दिन 4 (मुख्य)",
  observed_actual: "वास्तविक मापा गया प्रवाह (ग्राउंड ट्रुथ)",
  no_observed_data: "इस तिथि के लिए कोई सेंसर अवलोकन दर्ज नहीं है",
  connected_reaches: "नदी नेटवर्क कनेक्टिविटी",
  upstream_gauges: "अपस्ट्रीम (ऊपरी) गेज",
  downstream_gauges: "डाउनस्ट्रीम (निचले) गेज",
  no_upstream: "मूल जलधारा (कोई ऊपरी गेज नहीं)",
  no_downstream: "अंतिम बेसिन निकास (बंगाल की खाड़ी की ओर)",

  // Alerts Feed Page
  alerts_feed_title: "पूर्व चेतावनी प्रसारण फीड",
  alerts_feed_subtitle: "आपदा प्रबंधन अधिकारियों के लिए तैयार किया गया CAP / SMS बुलेटिन",
  approx_time_label: "अपेक्षित समय:",
  approx_time_hint: "अनुमानित समय: दैनिक मॉडल सटीक घंटे का निर्धारण नहीं कर सकता",
  drafted_sms_title: "प्रारूपित CAP / SMS बुलेटिन संदेश:",
  copy_message: "संदेश कॉपी करें",
  copied: "कॉपी किया गया!",
  simulated_notice: "अनुकरण सूचना: यह केवल एक डेमो है, कोई भी संदेश वास्तविक नेटवर्क पर नहीं भेजा जाता है।",
  no_active_alerts: "इस तिथि और समयावधि के लिए कोई सक्रिय बाढ़ चेतावनी नहीं है।",

  // Model Info Page
  model_info_title: "STG-Mamba आर्किटेक्चर एवं सत्यापन डेटा",
  model_info_subtitle: "पूर्वानुमान इंजन और डेटा स्रोतों का तकनीकी विवरण",
  forecaster_engine: "प्राथमिक पूर्वानुमान इंजन",
  correction_stage_title: "प्रस्तावित अवशिष्ट सुधार चरण",
  training_window: "प्रशिक्षण अवधि",
  validation_window: "सत्यापन पुनरावृत्ति अवधि",
  data_sources_title: "डेटा स्रोत और संदर्भ"
};
