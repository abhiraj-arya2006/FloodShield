"""Tests for CAMELS-IND forcing parsing and plausibility checks (tiny in-memory data)."""

import numpy as np
import pandas as pd
import pytest

from floodshield.data.camels_ind_loader import load_forcings, split_header_units
from floodshield.data.forcing_checks import column_summary, plausibility_checks

HEADER = ("year,month,day,prcp(mm/day),tmax(C),tmin(C),tavg(C),srad_lw(w/m2),srad_sw(w/m2),"
          "wind_u(m/s),wind_v(m/s),wind(m/s),rel_hum(%),pet(mm/day),pet_gleam(mm/day),"
          "aet_gleam(mm/day),evap_canopy(mm/day),evap_surface(mm/day),sm_lvl1(kg/m2),"
          "sm_lvl2(kg/m2),sm_lvl3(kg/m2),sm_lvl4(kg/m2)")


def test_split_header_units_reads_units_from_header():
    assert split_header_units(["prcp(mm/day)", "rel_hum(%)", "srad_sw(w/m2)"]) == {
        "prcp": "mm/day", "rel_hum": "%", "srad_sw": "w/m2"}


def test_split_header_units_refuses_header_without_unit():
    with pytest.raises(ValueError, match="without a unit"):
        split_header_units(["prcp"])


def test_load_forcings_pads_id_and_keeps_missing(tmp_path):
    d = tmp_path / "catchment_mean_forcings"
    d.mkdir()
    row = "0.0,30,20,25,380,280,1,0,1,50,,3,2,0.1,0.5,10,70,170,530"
    (d / "03002.csv").write_text(f"{HEADER}\n1980,1,1,{row}\n1980,1,2,{row}\n")
    df, units = load_forcings(tmp_path, "3002")
    assert isinstance(df.index, pd.DatetimeIndex) and len(df) == 2
    assert units["prcp"] == "mm/day" and units["sm_lvl4"] == "kg/m2"
    assert df["pet"].isna().all()          # blank stays NaN, nothing filled


def good_day(**overrides):
    row = {"prcp": 1.0, "tmax": 30.0, "tmin": 20.0, "tavg": 25.0, "srad_lw": 380.0,
           "srad_sw": 280.0, "wind_u": 3.0, "wind_v": 4.0, "wind": 5.0, "rel_hum": 50.0,
           "pet": 4.0, "pet_gleam": 3.0, "aet_gleam": 2.0, "evap_canopy": 0.1,
           "evap_surface": 0.5, "sm_lvl1": 10.0, "sm_lvl2": 70.0, "sm_lvl3": 170.0,
           "sm_lvl4": 530.0}
    row.update(overrides)
    return row


def frame(*rows):
    return pd.DataFrame(list(rows), index=pd.date_range("2000-01-01", periods=len(rows)))


def test_clean_day_has_no_violations():
    assert sum(plausibility_checks(frame(good_day())).values()) == 0


def test_each_violation_is_counted_not_fixed():
    df = frame(
        good_day(prcp=-1.0),
        good_day(tmax=19.0, tavg=19.5),        # tmax < tmin
        good_day(tmin=0.0, tavg=15.0),         # exact-zero tmin (bad source value)
        good_day(wind=6.0),                    # not sqrt(u^2 + v^2) = 5
        good_day(rel_hum=101.0),
        good_day(sm_lvl1=100.5),               # above 0.1 m * 1000 kg/m2
        good_day(evap_canopy=-0.2),
        good_day(tavg=26.0),                   # not (tmax + tmin) / 2
    )
    before = df.copy()
    c = plausibility_checks(df)
    pd.testing.assert_frame_equal(df, before)  # input untouched
    assert c["prcp_negative"] == 1
    assert c["tmax_below_tmin"] == 1
    assert c["tmin_exactly_zero"] == 1
    assert c["wind_not_norm_of_u_v"] == 1
    assert c["rel_hum_outside_0_100"] == 1
    assert c["sm_lvl1_above_100kgm2"] == 1
    assert c["evap_canopy_negative"] == 1
    assert c["tavg_not_mean_of_tmax_tmin"] == 1


def test_nan_is_not_a_violation_and_summary_reports_missing():
    df = frame(good_day(prcp=np.nan, tmax=np.nan), good_day())
    assert plausibility_checks(df)["prcp_negative"] == 0
    s = column_summary(df, {"prcp": "mm/day"})
    assert s.loc["prcp", "missing_pct"] == 50.0
    assert s.loc["prcp", "unit"] == "mm/day"
    assert s.loc["prcp", "source"].startswith("IMD")
