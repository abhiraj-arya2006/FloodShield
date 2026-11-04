from abc import ABC, abstractmethod
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import pandas as pd
import yaml
from fastapi import HTTPException

from app.backend.schemas import (
    GaugeItem, GaugesResponse,
    EdgeItem, EdgesResponse,
    DatesResponse,
    GaugeForecastRow, ForecastResponse,
    SingleGaugeLeadDay, SingleGaugeForecastResponse,
    AlertItem, AlertsResponse,
    ModelInfoResponse, DataSourceInfo,
    HealthResponse
)

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT_DIR / "app" / "backend" / "data"
CONFIGS_DIR = ROOT_DIR / "configs"


class DataSource(ABC):
    @abstractmethod
    def get_health(self) -> HealthResponse:
        pass

    @abstractmethod
    def get_gauges(self) -> GaugesResponse:
        pass

    @abstractmethod
    def get_edges(self) -> EdgesResponse:
        pass

    @abstractmethod
    def get_dates(self) -> DatesResponse:
        pass

    @abstractmethod
    def get_forecast(self, date: str, lead_day: int) -> ForecastResponse:
        pass

    @abstractmethod
    def get_gauge_forecast(self, gauge_id: str, date: str) -> SingleGaugeForecastResponse:
        pass

    @abstractmethod
    def get_alerts(self, date: str, lead_day: int) -> AlertsResponse:
        pass

    @abstractmethod
    def get_model_info(self) -> ModelInfoResponse:
        pass


class ReplaySource(DataSource):
    def __init__(self):
        self.gauges_path = DATA_DIR / "gauges.json"
        self.edges_path = DATA_DIR / "edges.json"
        self.parquet_path = DATA_DIR / "replay_predictions.parquet"
        self.thresholds_path = CONFIGS_DIR / "flow_thresholds.csv"
        self.policy_path = CONFIGS_DIR / "river_alert_policy.yaml"
        self.model_info_path = CONFIGS_DIR / "model_info.yaml"

        # Load metadata
        with open(self.gauges_path, "r", encoding="utf-8") as f:
            self._gauges_list = json.load(f)
        self._gauges_by_id: Dict[str, dict] = {str(g["gauge_id"]): g for g in self._gauges_list}

        with open(self.edges_path, "r", encoding="utf-8") as f:
            self._edges_list = json.load(f)

        # Load policy
        with open(self.policy_path, "r", encoding="utf-8") as f:
            self.policy = yaml.safe_load(f)
        self.alert_margin = float(self.policy.get("alert_margin", 0.0))

        # Load thresholds csv if exists to override/supplement
        if self.thresholds_path.exists():
            thresh_df = pd.read_csv(self.thresholds_path, dtype={"gauge_id": str})
            for _, r in thresh_df.iterrows():
                gid = str(r["gauge_id"])
                if gid in self._gauges_by_id:
                    self._gauges_by_id[gid]["q90_m3s"] = float(r["q90_m3s"])
                    self._gauges_by_id[gid]["q95_m3s"] = float(r["q95_m3s"])

        # The levels that raise alerts: the team's final rule is flow >= q95 * (1 - alert_margin).
        for g in self._gauges_list:
            g["warning_m3s"] = round(g["q95_m3s"] * (1.0 - self.alert_margin), 2)
            g["watch_m3s"] = round(g["q90_m3s"] * (1.0 - self.alert_margin), 2)

        # What produced the forecasts, written by scripts/import_model_predictions.py.
        meta_path = DATA_DIR / "replay_meta.json"
        self._meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}

        # Load model info
        with open(self.model_info_path, "r", encoding="utf-8") as f:
            self._model_info_raw = yaml.safe_load(f)

        # Lazy / Cached DataFrame
        self._df: Optional[pd.DataFrame] = None
        self._available_dates: Optional[List[str]] = None

    def _get_df(self) -> pd.DataFrame:
        if self._df is None:
            if not self.parquet_path.exists():
                raise HTTPException(
                    status_code=500,
                    detail=f"Replay data file missing: {self.parquet_path}. Run scripts/import_model_predictions.py first."
                )
            df = pd.read_parquet(self.parquet_path)
            df["gauge_id"] = df["gauge_id"].astype(str)
            self._df = df
            self._available_dates = sorted(df["date"].unique().tolist())
        return self._df

    def _determine_status(self, predicted: float, q90: float, q95: float) -> Tuple[str, float]:
        """Calculates status based on config threshold + optional alert_margin."""
        warn_th = q95 * (1.0 - self.alert_margin)
        watch_th = q90 * (1.0 - self.alert_margin)

        if predicted >= warn_th:
            return "WARNING", warn_th
        elif predicted >= watch_th:
            return "WATCH", watch_th
        return "OK", watch_th

    def get_health(self) -> HealthResponse:
        return HealthResponse(
            status="healthy",
            mode="replay",
            data_period="2009-2018",
            predictions=self._meta.get("predictions", "unknown"),
            alert_margin=self.alert_margin,
            total_gauges=len(self._gauges_list),
            timestamp=datetime.now(timezone.utc).isoformat()
        )

    def get_gauges(self) -> GaugesResponse:
        items = [GaugeItem(**g) for g in self._gauges_list]
        return GaugesResponse(total_gauges=len(items), gauges=items)

    def get_edges(self) -> EdgesResponse:
        items = [EdgeItem(**e) for e in self._edges_list]
        return EdgesResponse(total_edges=len(items), edges=items)

    def get_dates(self) -> DatesResponse:
        self._get_df()
        return DatesResponse(
            dates=self._available_dates,
            data_period="2009-2012 (Held-out validation window)",
            min_date=self._available_dates[0],
            max_date=self._available_dates[-1],
            total_dates=len(self._available_dates)
        )

    def get_forecast(self, date: str, lead_day: int) -> ForecastResponse:
        if lead_day not in [1, 2, 3, 4]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid lead_day {lead_day}. Supported lead days are 1, 2, 3, 4."
            )

        df = self._get_df()
        sub = df[(df["date"] == date) & (df["lead_day"] == lead_day)]
        if sub.empty:
            raise HTTPException(
                status_code=404,
                detail=f"No forecast found for date '{date}' and lead_day {lead_day}. Available range: {self._available_dates[0]} to {self._available_dates[-1]}."
            )

        records_map = {r["gauge_id"]: r for r in sub.to_dict(orient="records")}
        rows: List[GaugeForecastRow] = []
        warning_cnt = 0
        watch_cnt = 0
        ok_cnt = 0

        headline_type = "nowcast" if lead_day == 1 else "headline"

        for gid, g in self._gauges_by_id.items():
            rec = records_map.get(gid)
            if not rec:
                continue

            pred_val = float(rec["predicted_m3s"])
            obs_val = float(rec["observed_m3s"]) if pd.notna(rec.get("observed_m3s")) else None
            mask_val = bool(rec["mask"])
            status, _ = self._determine_status(pred_val, g["q90_m3s"], g["q95_m3s"])

            if status == "WARNING":
                warning_cnt += 1
            elif status == "WATCH":
                watch_cnt += 1
            else:
                ok_cnt += 1

            rows.append(
                GaugeForecastRow(
                    gauge_id=gid,
                    name=g["name"],
                    river=g["river"],
                    basin=g["basin"],
                    ghi_lat=g["ghi_lat"],
                    ghi_lon=g["ghi_lon"],
                    lead_day=lead_day,
                    headline_type=headline_type,
                    predicted_m3s=pred_val,
                    q90_m3s=g["q90_m3s"],
                    q95_m3s=g["q95_m3s"],
                    watch_m3s=g["watch_m3s"],
                    warning_m3s=g["warning_m3s"],
                    status=status,
                    observed_m3s=obs_val,
                    mask=mask_val
                )
            )

        return ForecastResponse(
            date=date,
            lead_day=lead_day,
            mode="replay",
            headline_type=headline_type,
            total_gauges=len(rows),
            warning_count=warning_cnt,
            watch_count=watch_cnt,
            ok_count=ok_cnt,
            gauges=rows
        )

    def get_gauge_forecast(self, gauge_id: str, date: str) -> SingleGaugeForecastResponse:
        gid = str(gauge_id)
        if gid not in self._gauges_by_id:
            raise HTTPException(
                status_code=404,
                detail=f"Gauge ID '{gauge_id}' not found. Please provide a valid 5-character string ID (e.g. '01001')."
            )

        g = self._gauges_by_id[gid]
        df = self._get_df()
        sub = df[(df["gauge_id"] == gid) & (df["date"] == date)].sort_values("lead_day")
        if sub.empty:
            raise HTTPException(
                status_code=404,
                detail=f"No forecast record found for gauge '{gauge_id}' on date '{date}'."
            )

        lead_days_list: List[SingleGaugeLeadDay] = []
        observed_val: Optional[float] = None
        mask_val: bool = False

        for _, row in sub.iterrows():
            ld = int(row["lead_day"])
            pred = float(row["predicted_m3s"])
            status, _ = self._determine_status(pred, g["q90_m3s"], g["q95_m3s"])
            headline_type = "nowcast" if ld == 1 else "headline"

            lead_days_list.append(
                SingleGaugeLeadDay(
                    lead_day=ld,
                    headline_type=headline_type,
                    predicted_m3s=pred,
                    status=status
                )
            )
            if observed_val is None and pd.notna(row["observed_m3s"]):
                observed_val = float(row["observed_m3s"])
                mask_val = bool(row["mask"])

        return SingleGaugeForecastResponse(
            gauge_id=gid,
            name=g["name"],
            river=g["river"],
            basin=g["basin"],
            ghi_lat=g["ghi_lat"],
            ghi_lon=g["ghi_lon"],
            date=date,
            q90_m3s=g["q90_m3s"],
            q95_m3s=g["q95_m3s"],
            lead_days=lead_days_list,
            observed_m3s=observed_val,
            mask=mask_val,
            mode="replay"
        )

    def get_alerts(self, date: str, lead_day: int) -> AlertsResponse:
        forecast_res = self.get_forecast(date=date, lead_day=lead_day)
        alert_items: List[AlertItem] = []
        warning_cnt = 0
        watch_cnt = 0


        for g in forecast_res.gauges:
            if g.status in ["WATCH", "WARNING"]:
                # The level that actually raised this alert, including the alert margin.
                th = g.warning_m3s if g.status == "WARNING" else g.watch_m3s
                exceedance = round(((g.predicted_m3s - th) / th) * 100, 1)

                if g.status == "WARNING":
                    warning_cnt += 1
                else:
                    watch_cnt += 1

                # A daily model gives a lead day, never an hour.
                draft = (
                    f"FloodShield research advisory: {g.status} at {g.name} ({g.river}, {g.basin} basin) for {date}. "
                    f"Forecast flow {g.predicted_m3s:,.0f} m3/s against a {th:,.0f} m3/s level, forecast {lead_day} day(s) ahead. "
                    "Not an official flood warning."
                )

                alert_items.append(
                    AlertItem(
                        gauge_id=g.gauge_id,
                        name=g.name,
                        river=g.river,
                        basin=g.basin,
                        ghi_lat=g.ghi_lat,
                        ghi_lon=g.ghi_lon,
                        lead_day=lead_day,
                        status=g.status,
                        predicted_m3s=g.predicted_m3s,
                        threshold_m3s=th,
                        q90_m3s=g.q90_m3s,
                        q95_m3s=g.q95_m3s,
                        exceedance_pct=exceedance,
                        observed_m3s=g.observed_m3s,
                        flood_day=None if g.observed_m3s is None else g.observed_m3s > g.q95_m3s,
                        drafted_message=draft
                    )
                )

        return AlertsResponse(
            date=date,
            lead_day=lead_day,
            mode="replay",
            total_alerts=len(alert_items),
            warning_count=warning_cnt,
            watch_count=watch_cnt,
            alerts=alert_items
        )

    def get_model_info(self) -> ModelInfoResponse:
        raw = self._model_info_raw
        sources = [DataSourceInfo(**s) for s in raw.get("data_sources", [])]
        return ModelInfoResponse(
            model_name=raw.get("model_name", "STG-Mamba"),
            version=raw.get("version", "Phase 2"),
            description=raw.get("description", ""),
            forecaster=raw.get("forecaster", ""),
            correction_stage=raw.get("correction_stage", ""),
            training_years=raw.get("training_years", ""),
            validation_years=raw.get("validation_years", ""),
            time_step=raw.get("time_step", "Daily"),
            forecast_horizons=raw.get("forecast_horizons", ""),
            data_sources=sources,
            disclaimer=raw.get("disclaimer", "")
        )


class LiveSource(DataSource):
    """Stub live source raising 501 Not Implemented until live pipeline is activated."""

    def _not_implemented(self):
        raise HTTPException(
            status_code=501,
            detail="Live inference pipeline is planned for Phase 3. Live forecasts are not yet implemented. Please switch data_mode to 'replay' in configs/river_alert_policy.yaml."
        )

    def get_health(self) -> HealthResponse:
        return HealthResponse(
            status="not_implemented",
            mode="live",
            data_period="live",
            total_gauges=0,
            timestamp=datetime.now(timezone.utc).isoformat()
        )

    def get_gauges(self) -> GaugesResponse:
        self._not_implemented()

    def get_edges(self) -> EdgesResponse:
        self._not_implemented()

    def get_dates(self) -> DatesResponse:
        self._not_implemented()

    def get_forecast(self, date: str, lead_day: int) -> ForecastResponse:
        self._not_implemented()

    def get_gauge_forecast(self, gauge_id: str, date: str) -> SingleGaugeForecastResponse:
        self._not_implemented()

    def get_alerts(self, date: str, lead_day: int) -> AlertsResponse:
        self._not_implemented()

    def get_model_info(self) -> ModelInfoResponse:
        self._not_implemented()


_cached_source: Optional[DataSource] = None

def get_data_source() -> DataSource:
    global _cached_source
    if _cached_source is None:
        policy_path = CONFIGS_DIR / "river_alert_policy.yaml"
        mode = "replay"
        if policy_path.exists():
            with open(policy_path, "r", encoding="utf-8") as f:
                policy = yaml.safe_load(f)
                mode = policy.get("data_mode", "replay").lower()

        if mode == "live":
            _cached_source = LiveSource()
        else:
            _cached_source = ReplaySource()

    return _cached_source

