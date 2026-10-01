import pytest
from app.calculations import (
    AthleteParams,
    calculate_acwr,
    calculate_banister_trimp,
    calculate_hr_zones,
)


def test_banister_trimp_summary_fallback():
    athlete = AthleteParams(rest_hr=60, max_hr=190, gender="male")
    # 60 minutes at 150 bpm
    trimp = calculate_banister_trimp(
        duration_seconds=3600,
        avg_hr=150.0,
        athlete=athlete,
    )
    assert trimp > 0
    assert 60.0 < trimp < 150.0


def test_banister_trimp_stream_vectorized():
    athlete = AthleteParams(rest_hr=60, max_hr=190, gender="male")
    times = [0, 60, 120, 180, 240, 300]
    hrs = [120, 135, 150, 160, 170, 175]

    trimp = calculate_banister_trimp(
        duration_seconds=300,
        avg_hr=151.0,
        athlete=athlete,
        time_stream=times,
        hr_stream=hrs,
    )
    assert trimp > 0
    assert isinstance(trimp, float)


def test_hr_zones_distribution():
    max_hr = 200
    # Z1: <120, Z2: 120-140, Z3: 140-160, Z4: 160-180, Z5: >=180
    times = [0, 10, 20, 30, 40, 50]
    hrs = [100, 110, 130, 150, 170, 190]

    zones = calculate_hr_zones(max_hr, times, hrs)
    assert zones.zone1_seconds == 10
    assert zones.zone2_seconds == 10
    assert zones.zone3_seconds == 10
    assert zones.zone4_seconds == 10
    assert zones.zone5_seconds == 10
    assert sum(zones.zone_percentages) == 100


def test_acwr_calculation_sweet_spot():
    # Constant 50 TRIMP daily load across 28 days
    loads = [50.0] * 28
    res = calculate_acwr(loads)

    assert res.acute_load_7d == 50.0
    assert res.chronic_load_28d == 50.0
    assert res.acwr == 1.0
    assert res.status == "sweet_spot"


def test_acwr_calculation_danger_zone():
    # Acute spike: 20 TRIMP per day for first 21 days, then 100 TRIMP per day for last 7 days
    loads = [20.0] * 21 + [100.0] * 7
    res = calculate_acwr(loads)

    assert res.acute_load_7d == 100.0
    # chronic = (21 * 20 + 7 * 100) / 28 = (420 + 700) / 28 = 40.0
    assert res.chronic_load_28d == 40.0
    # acwr = 100 / 40 = 2.5
    assert res.acwr == 2.5
    assert res.status == "danger"
