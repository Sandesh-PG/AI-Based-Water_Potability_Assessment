from __future__ import annotations

from typing import Annotated, Any

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.data_loader import get_data

router = APIRouter(prefix="/stations", tags=["stations"])
STATION_NOT_FOUND_MESSAGE = "Station not found"

PARAMETERS = [
    "do_avg",
    "ph_avg",
    "bod_avg",
    "nitrate_avg",
    "fecal_coliform_avg",
    "conductivity_avg",
    "pollution_score",
]


class ParameterTrend(BaseModel):
    year: int
    do_avg: float | None
    ph_avg: float | None
    bod_avg: float | None
    nitrate_avg: float | None
    fecal_coliform_avg: float | None
    conductivity_avg: float | None
    pollution_score: float | None


class TrendsResponse(BaseModel):
    station_id: str
    station_name: str | None
    water_body_type: str | None
    selected_year: int | None = None
    trends: list[ParameterTrend]
    summary: dict


COMPARE_PARAMS = [
    ("bod_avg", "BOD", "mg/L", 3.0),
    ("do_avg", "DO", "mg/L", 5.0),
    ("ph_avg", "pH", "", None),
    ("nitrate_avg", "Nitrate", "mg/L", 10.0),
    ("fecal_coliform_avg", "Fecal Coliform", "MPN/100ml", 500.0),
    ("pollution_score", "Pollution Score", "", None),
]


class StationCompare(BaseModel):
    station_id: str
    station_name: str | None
    water_body_type: str | None
    year: int | None
    safety_label: str | None
    pollution_score: float | None
    parameters: dict


class CompareResponse(BaseModel):
    station_a: StationCompare
    station_b: StationCompare
    winner: str
    parameter_comparison: list[dict]


class YearCompareResponse(BaseModel):
    station_id: str
    station_name: str | None
    year_a: int
    year_b: int
    parameter_comparison: list[dict]


def _safe_float(val) -> float | None:
    try:
        f = float(val)
        return None if pd.isna(f) else round(f, 3)
    except Exception:
        return None


def _trend_direction(first: float | None, latest: float | None, param: str) -> str:
    if first is None or latest is None:
        return "Stable"

    baseline = abs(first)
    threshold = 0.05 * baseline
    if baseline == 0:
        threshold = 0.0

    if abs(latest - first) < threshold:
        return "Stable"

    if param == "do_avg":
        return "Improving" if latest > first else "Worsening"

    return "Improving" if latest < first else "Worsening"


def _get_station_trends_data(station_id: str) -> tuple[pd.DataFrame, pd.Series]:
    df = get_data().copy()
    station_rows = df[df["stn_code"].astype(str).str.strip() == str(station_id).strip()].copy()

    if station_rows.empty:
        raise HTTPException(status_code=404, detail=STATION_NOT_FOUND_MESSAGE)

    station_rows["year"] = pd.to_numeric(station_rows["year"], errors="coerce")
    for col in PARAMETERS:
        station_rows[col] = pd.to_numeric(station_rows[col], errors="coerce")

    station_rows = station_rows.dropna(subset=["year"])

    if station_rows.empty:
        raise HTTPException(status_code=404, detail=STATION_NOT_FOUND_MESSAGE)

    all_grouped = (
        station_rows.groupby("year", as_index=False)[PARAMETERS]
        .mean(numeric_only=True)
        .sort_values("year", ascending=True)
    )

    first_row = station_rows.sort_values("year", ascending=True).iloc[0]
    return all_grouped, first_row


def _build_parameter_trends(grouped: pd.DataFrame) -> list[ParameterTrend]:
    return [
        ParameterTrend(
            year=int(row["year"]),
            do_avg=_safe_float(row.get("do_avg")),
            ph_avg=_safe_float(row.get("ph_avg")),
            bod_avg=_safe_float(row.get("bod_avg")),
            nitrate_avg=_safe_float(row.get("nitrate_avg")),
            fecal_coliform_avg=_safe_float(row.get("fecal_coliform_avg")),
            conductivity_avg=_safe_float(row.get("conductivity_avg")),
            pollution_score=_safe_float(row.get("pollution_score")),
        )
        for _, row in grouped.iterrows()
    ]


def _build_trends_summary(grouped: pd.DataFrame) -> dict[str, Any]:
    summary: dict[str, Any] = {}

    for param in PARAMETERS:
        values = grouped[param].dropna().tolist() if param in grouped.columns else []
        first = _safe_float(grouped.iloc[0][param]) if not grouped.empty else None
        latest = _safe_float(grouped.iloc[-1][param]) if not grouped.empty else None
        summary[param] = {
            "min": _safe_float(min(values)) if values else None,
            "max": _safe_float(max(values)) if values else None,
            "latest": latest,
            "trend": _trend_direction(first, latest, param),
        }

    return summary


def _get_station_compare_row(station_id: str, year: int | None = None) -> pd.Series:
    df = get_data().copy()
    station_rows = df[df["stn_code"].astype(str).str.strip() == str(station_id).strip()].copy()

    if station_rows.empty:
        raise HTTPException(status_code=404, detail=STATION_NOT_FOUND_MESSAGE)

    station_rows["year"] = pd.to_numeric(station_rows["year"], errors="coerce")
    station_rows = station_rows.dropna(subset=["year"])

    if station_rows.empty:
        raise HTTPException(status_code=404, detail=STATION_NOT_FOUND_MESSAGE)

    if year is not None:
        year_rows = station_rows.loc[station_rows["year"] == year].copy()
        if not year_rows.empty:
            station_rows = year_rows

    station_rows = station_rows.sort_values("year", ascending=False, na_position="last")
    return station_rows.iloc[0]


def _compare_status(param: str, value: float | None, limit: float | None) -> str:
    if value is None or limit is None:
        return "ok"

    if param == "do_avg":
        return "violation" if value < limit else "ok"

    if param == "ph_avg":
        return "ok"

    return "violation" if value > limit else "ok"


def _build_station_compare(station_id: str, year: int | None = None) -> StationCompare:
    row = _get_station_compare_row(station_id, year)
    parameters = {
        param: _safe_float(row.get(param))
        for param, _, _, _ in COMPARE_PARAMS
    }

    return StationCompare(
        station_id=str(station_id),
        station_name=str(row.get("monitoring_location") or "").strip() or None,
        water_body_type=str(row.get("water_body_type") or "").strip() or None,
        year=int(row.get("year")) if pd.notna(row.get("year")) else None,
        safety_label=str(row.get("safety_label") or "").strip() or None,
        pollution_score=_safe_float(row.get("pollution_score")),
        parameters=parameters,
    )


def _build_parameter_comparison(station_a: StationCompare, station_b: StationCompare) -> list[dict]:
    comparison: list[dict] = []

    for param, label, unit, limit in COMPARE_PARAMS:
        a_value = station_a.parameters.get(param)
        b_value = station_b.parameters.get(param)
        comparison.append(
            {
                "param": param,
                "label": label,
                "unit": unit,
                "a_value": a_value,
                "b_value": b_value,
                "limit": limit,
                "a_status": _compare_status(param, a_value, limit),
                "b_status": _compare_status(param, b_value, limit),
            }
        )

    return comparison


def _compare_change(param: str, a_value: float | None, b_value: float | None) -> str:
    if a_value is None or b_value is None:
        return "N/A"

    baseline = abs(a_value)
    threshold = 0.05 * baseline
    if baseline == 0:
        threshold = 0.0

    if abs(b_value - a_value) < threshold:
        return "Stable"

    if param == "do_avg":
        return "Improved" if b_value > a_value else "Worsened"

    return "Improved" if b_value < a_value else "Worsened"


@router.get("/{station_id}/compare-years", responses={404: {"description": "Station not found"}})
def compare_years(
    station_id: str,
    year_a: Annotated[int, Query()],
    year_b: Annotated[int, Query()],
) -> YearCompareResponse:
    row_a = _get_station_compare_row(station_id, year_a)
    row_b = _get_station_compare_row(station_id, year_b)

    parameter_comparison: list[dict] = []
    for param, label, unit, limit in COMPARE_PARAMS:
        a_value = _safe_float(row_a.get(param))
        b_value = _safe_float(row_b.get(param))
        parameter_comparison.append(
            {
                "param": param,
                "label": label,
                "unit": unit,
                "a_value": a_value,
                "b_value": b_value,
                "limit": limit,
                "a_status": _compare_status(param, a_value, limit),
                "b_status": _compare_status(param, b_value, limit),
                "change": _compare_change(param, a_value, b_value),
            }
        )

    return YearCompareResponse(
        station_id=str(station_id),
        station_name=str(row_a.get("monitoring_location") or "").strip() or None,
        year_a=year_a,
        year_b=year_b,
        parameter_comparison=parameter_comparison,
    )


@router.get("/compare", responses={404: {"description": "Station not found"}})
def compare_stations(
    station_a: str,
    station_b: str,
    year: Annotated[int | None, Query()] = None,
) -> CompareResponse:
    station_a_data = _build_station_compare(station_a, year)
    station_b_data = _build_station_compare(station_b, year)

    a_score = station_a_data.pollution_score
    b_score = station_b_data.pollution_score
    if a_score is None and b_score is None:
        winner = station_a_data.station_id
    elif a_score is None:
        winner = station_b_data.station_id
    elif b_score is None:
        winner = station_a_data.station_id
    else:
        winner = station_a_data.station_id if a_score <= b_score else station_b_data.station_id

    return CompareResponse(
        station_a=station_a_data,
        station_b=station_b_data,
        winner=winner,
        parameter_comparison=_build_parameter_comparison(station_a_data, station_b_data),
    )


@router.get(
    "/{station_id}/trends",
    responses={404: {"description": "Station not found"}},
)
def get_trends(station_id: str, year: Annotated[int | None, Query()] = None) -> TrendsResponse:
    grouped, first_row = _get_station_trends_data(station_id)

    trends_grouped = grouped
    if year is not None:
        trends_grouped = grouped[grouped["year"] == year].copy()

    return TrendsResponse(
        station_id=str(station_id),
        station_name=str(first_row.get("monitoring_location") or "").strip() or None,
        water_body_type=str(first_row.get("water_body_type") or "").strip() or None,
        selected_year=year,
        trends=_build_parameter_trends(trends_grouped),
        summary=_build_trends_summary(grouped),
    )
