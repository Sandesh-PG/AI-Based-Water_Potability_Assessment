from __future__ import annotations

from typing import Any, Annotated

import pandas as pd
from fastapi import APIRouter, Query
from pydantic import BaseModel

from backend.data_loader import get_data

router = APIRouter(prefix="/stats", tags=["stats"])


class OverviewYearPoint(BaseModel):
    year: int
    avg_score: float | None
    safe_count: int
    unsafe_count: int


class OverviewStats(BaseModel):
    total_stations: int
    safe_count: int
    unsafe_count: int
    safe_percentage: float
    avg_pollution_score: float | None
    most_polluted_station: dict | None
    cleanest_station: dict | None
    most_common_violation: str | None
    yearly_trend: list[OverviewYearPoint]


PARAM_META = [
    ("bod_avg", "BOD", "mg/L", 3.0, "CPCB"),
    ("do_avg", "DO", "mg/L", 5.0, "CPCB"),
    ("ph_avg", "pH", "", None, "BIS"),
    ("nitrate_avg", "Nitrate", "mg/L", 10.0, "WHO"),
    ("fecal_coliform_avg", "Fecal Coliform", "MPN/100ml", 500.0, "WHO"),
    ("conductivity_avg", "Conductivity", "µS/cm", None, ""),
]


def _safe_float(val) -> float | None:
    try:
        f = float(val)
        return None if pd.isna(f) else float(round(f, 4))
    except Exception:
        return None


def _explode_violations(series: pd.Series) -> list[str]:
    items: list[str] = []
    for v in series.dropna().astype(str):
        parts = [p.strip() for p in v.split(",") if p.strip()]
        items.extend(parts)
    return items


def _compute_latest_stats(latest_per_station: pd.DataFrame) -> tuple[int, int, int, float, float | None, dict | None, dict | None, str | None]:
    if latest_per_station.empty:
        return 0, 0, 0, 0.0, None, None, None, None

    total_stations = int(latest_per_station["stn_code"].nunique())
    safe_count = int((latest_per_station["safety_label"] == "Safe").sum())
    unsafe_count = int((latest_per_station["safety_label"] == "Unsafe").sum())
    safe_percentage = round((safe_count / total_stations * 100), 1) if total_stations > 0 else 0.0

    avg_pollution_score = None
    if not latest_per_station["pollution_score"].dropna().empty:
        avg_pollution_score = float(round(latest_per_station["pollution_score"].dropna().mean(), 4))

    row_max = latest_per_station.loc[latest_per_station["pollution_score"].idxmax()]
    row_min = latest_per_station.loc[latest_per_station["pollution_score"].idxmin()]
    most_polluted_station = {
        "name": str(row_max.get("monitoring_location") or "").strip() or None,
        "score": _safe_float(row_max.get("pollution_score")),
        "year": int(row_max.get("year")) if pd.notna(row_max.get("year")) else None,
    }
    cleanest_station = {
        "name": str(row_min.get("monitoring_location") or "").strip() or None,
        "score": _safe_float(row_min.get("pollution_score")),
        "year": int(row_min.get("year")) if pd.notna(row_min.get("year")) else None,
    }

    violations = _explode_violations(latest_per_station.get("violated_params", pd.Series(dtype=object)))
    most_common_violation = None
    if violations:
        vc = pd.Series(violations).value_counts()
        if not vc.empty:
            most_common_violation = str(vc.idxmax())

    return total_stations, safe_count, unsafe_count, safe_percentage, avg_pollution_score, most_polluted_station, cleanest_station, most_common_violation


def _compute_yearly_trend(df_nonull_year: pd.DataFrame) -> list[dict[str, Any]]:
    if df_nonull_year.empty:
        return []

    per_station_year = df_nonull_year.groupby(["year", "stn_code"], as_index=False).last()
    by_year = per_station_year.groupby("year", as_index=False)
    yearly_trend: list[dict[str, Any]] = []
    for _, gy in by_year:
        yr = int(gy.iloc[0]["year"])
        avg_score = gy["pollution_score"].dropna()
        avg_score_val = float(round(avg_score.mean(), 4)) if not avg_score.empty else None
        safe_cnt = int((gy["safety_label"] == "Safe").sum())
        unsafe_cnt = int((gy["safety_label"] == "Unsafe").sum())
        yearly_trend.append({"year": yr, "avg_score": avg_score_val, "safe_count": safe_cnt, "unsafe_count": unsafe_cnt})

    return sorted(yearly_trend, key=lambda x: x["year"])


@router.get("/overview")
def overview(year: Annotated[int | None, Query()] = None) -> OverviewStats:
    df = get_data().copy()
    df["year"] = pd.to_numeric(df.get("year", None), errors="coerce")
    df["pollution_score"] = pd.to_numeric(df.get("pollution_score", None), errors="coerce")

    if year is not None:
        df = df[df["year"] == int(year)].copy()

    df_nonull_year = df.dropna(subset=["year"]) if not df.empty else df
    latest_per_station = (
        df_nonull_year.sort_values("year", ascending=True)
        .groupby("stn_code", as_index=False)
        .last()
    )

    (
        total_stations,
        safe_count,
        unsafe_count,
        safe_percentage,
        avg_pollution_score,
        most_polluted_station,
        cleanest_station,
        most_common_violation,
    ) = _compute_latest_stats(latest_per_station)

    yearly_trend = _compute_yearly_trend(df_nonull_year)

    return OverviewStats(
        total_stations=total_stations,
        safe_count=safe_count,
        unsafe_count=unsafe_count,
        safe_percentage=safe_percentage,
        avg_pollution_score=avg_pollution_score,
        most_polluted_station=most_polluted_station,
        cleanest_station=cleanest_station,
        most_common_violation=most_common_violation,
        yearly_trend=[OverviewYearPoint(**y) for y in yearly_trend],
    )


class ParameterStats(BaseModel):
    parameter: str
    label: str
    avg_value: float | None
    min_value: float | None
    max_value: float | None
    violation_count: int
    violation_percentage: float
    unit: str
    limit: float | None
    limit_source: str


def _compute_param(df: pd.DataFrame, param: str, label: str, unit: str, limit: float | None, limit_source: str) -> ParameterStats:
    series = pd.to_numeric(df.get(param, pd.Series(dtype=float)), errors="coerce").dropna()
    avg_v = float(round(series.mean(), 4)) if not series.empty else None
    min_v = float(round(series.min(), 4)) if not series.empty else None
    max_v = float(round(series.max(), 4)) if not series.empty else None
    total_non_null = int(series.count())
    violation_count = 0
    if limit is not None and total_non_null > 0:
        if param == "do_avg":
            violation_count = int((series < float(limit)).sum())
        elif param == "ph_avg":
            violation_count = 0
        else:
            violation_count = int((series > float(limit)).sum())

    violation_percentage = round((violation_count / total_non_null * 100), 1) if total_non_null > 0 else 0.0

    return ParameterStats(
        parameter=param,
        label=label,
        avg_value=avg_v,
        min_value=min_v,
        max_value=max_v,
        violation_count=violation_count,
        violation_percentage=violation_percentage,
        unit=unit,
        limit=limit,
        limit_source=limit_source,
    )


@router.get("/parameters")
def parameter_stats(year: Annotated[int | None, Query()] = None, water_body_type: Annotated[str | None, Query()] = None) -> list[ParameterStats]:
    df = get_data().copy()
    if year is not None:
        df["year"] = pd.to_numeric(df.get("year", None), errors="coerce")
        df = df[df["year"] == int(year)].copy()

    if water_body_type:
        df = df[df.get("water_body_type", "").astype(str).str.strip().str.lower() == str(water_body_type).strip().lower()].copy()

    results: list[ParameterStats] = []
    for param, label, unit, limit, limit_source in PARAM_META:
        results.append(_compute_param(df, param, label, unit, limit, limit_source))

    return results
