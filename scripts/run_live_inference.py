"""Run the live inference pipeline once and write the forecast cache.

Not implemented yet. Plan: IMD real-time grids (observed) + GEOS-FP forecast
rain (not yet verified) -> STG-Mamba -> XGBoost correction -> JSON cache.
"""


def main() -> None:
    # TODO: Fetch IMD real-time and forecast rain, run the model, write JSON to the serving cache path.
    raise NotImplementedError("run_live_inference.py is not implemented yet")


if __name__ == "__main__":
    main()
