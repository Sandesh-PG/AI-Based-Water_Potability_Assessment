from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query
import pandas as pd

from backend.data_loader import get_data

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("/")
def list_locations(
    year: Annotated[int | None, Query()] = None,
    water_body_type: Annotated[str | None, Query()] = None,
    safety_label: Annotated[str | None, Query()] = None,
) -> list[dict]:
    df = get_data().copy()

    # Normalize year for deterministic latest-record selection.
    df["year"] = pd.to_numeric(df.get("year", None), errors="coerce")

    # Apply non-year filters first to get the base filtered dataset
    base_df = df.copy()
    if water_body_type:
        base_df = base_df[base_df["water_body_type"] == water_body_type]
    if safety_label:
        base_df = base_df[base_df["safety_label"] == safety_label]

    # If year is specified, filter to that year; otherwise get latest per station across all years
    if year is not None:
        display_df = base_df[base_df["year"] == year]
    else:
        # Get latest record per station across all years
        display_df = (
            base_df.sort_values("year", ascending=True)
            .groupby("stn_code", as_index=False)
            .last()
        )

    display_df = display_df.dropna(subset=["latitude", "longitude"])

    # Build result with available_years metadata
    result_records = []
    for _, row in display_df.iterrows():
        stn_code = row["stn_code"]
        # Find all years available for this station in the base filtered dataset
        station_all_years = base_df[base_df["stn_code"] == stn_code]["year"].dropna().unique()
        available_years = sorted(int(y) for y in station_all_years)

        result_records.append({
            "id": stn_code,
            "location": row["monitoring_location"],
            "lat": row["latitude"],
            "lon": row["longitude"],
            "year": int(row["year"]),
            "water_body_type": row["water_body_type"],
            "pollution_score": row["pollution_score"],
            "safety_label": row["safety_label"],
            "available_years": available_years,
        })

    return result_records[:1000]
