"""Live pipeline (not implemented).

IMD real-time rain/tmax/tmin (observed past window) + NASA GEOS-FP forecast
rain (future covariate; source not yet verified) -> catchment averages ->
training-period normalisers -> STG-Mamba (4-day horizon) -> XGBoost residual
correction -> per-gauge daily flow and threshold alerts.
"""

# TODO: Average each gridded field over the CAMELS-IND catchment polygons exactly as in training.
# TODO: Reuse the saved training normalisers and inverse transform; never refit them on live data.
# TODO: Run on MPS with logged CPU fallback.
