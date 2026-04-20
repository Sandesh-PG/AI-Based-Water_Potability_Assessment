from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.data_loader import get_data

router = APIRouter(prefix="/stations", tags=["stations"])

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
    trends: list[ParameterTrend]
    summary: dict


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
        raise HTTPException(status_code=404, detail="Station not found")

    station_rows["year"] = pd.to_numeric(station_rows["year"], errors="coerce")
    for col in PARAMETERS:
        station_rows[col] = pd.to_numeric(station_rows[col], errors="coerce")

    station_rows = station_rows.dropna(subset=["year"])

    if station_rows.empty:
        raise HTTPException(status_code=404, detail="Station not found")

    grouped = (
        station_rows.groupby("year", as_index=False)[PARAMETERS]
        .mean(numeric_only=True)
        .sort_values("year", ascending=True)
    )

    first_row = station_rows.sort_values("year", ascending=True).iloc[0]
    return grouped, first_row


@router.get(
    "/{station_id}/trends",
    responses={404: {"description": "Station not found"}},
)
def station_trends(station_id: str) -> TrendsResponse:
    grouped, first_row = _get_station_trends_data(station_id)

    trends = [
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

    return TrendsResponse(
        station_id=str(station_id),
        station_name=str(first_row.get("monitoring_location") or "").strip() or None,
        water_body_type=str(first_row.get("water_body_type") or "").strip() or None,
        trends=trends,
        summary=summary,
    )
