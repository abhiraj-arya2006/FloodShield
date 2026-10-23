# Dataset sources

> **Nothing has been downloaded or verified yet.** Everything below is taken from
> the providers' documentation and must be checked once the data is in hand.

## 1. CAMELS-IND

- **Provider:** CAMELS-IND authors (ESSD publication); hosted on Zenodo.
- **URL / DOI:** dataset https://doi.org/10.5281/zenodo.14005378 ;
  paper https://doi.org/10.5194/essd-17-461-2025
- **Provides:** observed daily streamflow (sourced from India-WRIS), gauge
  locations, 211 static catchment attributes, catchment boundaries.
- **Files to use:** `CAMELS_IND_Catchments_Streamflow_Sufficient.zip` (the
  "streamflow sufficient" subset) and `00_CAMELS_IND_Data_Description.pdf`
  (units and file layout).
- **Type:** observed (streamflow). The dataset also ships meteorological
  forcings, which we do **not** use (see design note below).
- **Gauge IDs:** 5 digits; the first 2 digits are the CWC basin code. The codes
  for Godavari and Mahanadi still need to be confirmed from the description PDF.
- **Licence / attribution:** for academic/research use; cite the paper and
  dataset DOI. Check the exact licence on the Zenodo record.
- **Time coverage:** 1980 to 2020.
- **Download:** manual (see `scripts/download_data.py`).
- **Known limitations:**
  - Ends in 2020, so there is no recent observed flow for validating live forecasts.
  - Many gauges have gaps; per-gauge availability in the two basins is unverified.
  - Large dams and reservoirs regulate flows in both Godavari and Mahanadi
    (e.g. Hirakud on the Mahanadi), so observed flow is not purely natural
    and a weather-driven model will not capture reservoir operations.

## 2. HydroRIVERS

- **Provider:** HydroSHEDS (WWF and partners).
- **URL:** https://www.hydrosheds.org/products/hydrorivers
- **Provides:** vector river network lines with downstream-segment topology,
  used to derive upstream to downstream edges between gauges.
- **Type:** derived static dataset (from HydroSHEDS elevation data), not a time series.
- **Licence / attribution:** HydroSHEDS licence; attribution required. Check
  current terms on the website before use.
- **Time coverage:** static (no time dimension).
- **Download:** manual.
- **Known limitations:** gauge coordinates must be snapped to the network;
  snapping errors or coarse resolution can create wrong or missing edges, so the
  graph needs validation (`src/floodshield/graph/validation.py`).

## 3. Open-Meteo Historical Weather (Archive) API

- **Provider:** Open-Meteo.
- **URL:** https://open-meteo.com/en/docs/historical-weather-api
- **Provides:** historical daily weather at each gauge location (training inputs).
- **Type:** reanalysis (ERA5-based).
- **Licence / attribution:** data CC BY 4.0; free for non-commercial use;
  no API key. Attribution: "Weather data by Open-Meteo.com".
- **Time coverage:** multi-decadal, covering the 1980 to 2020 CAMELS-IND
  period (verify for the chosen variables).
- **Known limitations:** reanalysis at a grid point is not a gauge or catchment
  average; respect API rate limits and cache responses.

## 4. Open-Meteo Forecast API

- **Provider:** Open-Meteo.
- **URL:** https://open-meteo.com/en/docs
- **Provides:** recent past + forecast weather at gauge locations for live predictions.
- **Type:** numerical weather model forecast.
- **Licence / attribution:** same as above (CC BY 4.0, non-commercial, no key);
  attribution required in the frontend.
- **Time coverage:** recent days plus a short forecast window (verify limits).
- **Known limitations:** training uses reanalysis while live uses forecasts,
  so a small training/live input mismatch is expected. Variable names must be
  checked to exist identically in both APIs.

## Design note

Training weather comes from the Open-Meteo archive rather than CAMELS-IND's own
forcings, so training and live inputs come from the same source family. The
model does not take past observed flow as input, so no live gauge feed is needed.

## Considered, not used

| Source | Reason |
|--------|--------|
| NASA GPM IMERG | Needs Earthdata login and raster processing; no matching live forecast from the same source. |
| Copernicus ERA5-Land (direct download) | CDS account plus NetCDF/GRIB handling; Open-Meteo already serves ERA5-family data as point JSON. |
| GloFAS | Simulated discharge from another model, not observations; unsuitable as a target. |
| India-WRIS (direct download) | CAMELS-IND already packages India-WRIS streamflow in a curated, documented form. |
| Global Flood Database | Satellite flood-extent events, not daily streamflow at gauges. |
