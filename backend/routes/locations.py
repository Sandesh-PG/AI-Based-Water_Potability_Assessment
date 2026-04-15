from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from backend.data_loader import get_data

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("/")
def list_locations(
    year: Annotated[int | None, Query()] = None,
    water_body_type: Annotated[str | None, Query()] = None,
    safety_label: Annotated[str | None, Query()] = None,
) -> list[dict]:
    df = get_data().copy()

    if year is not None:
        df = df[df["year"] == year]

    if water_body_type:
        df = df[df["water_body_type"] == water_body_type]

    if safety_label:
        df = df[df["safety_label"] == safety_label]

    df = df.dropna(subset=["latitude", "longitude"])
    df = df.head(1000)

    df = df[
        [
            "stn_code",
            "monitoring_location",
            "latitude",
            "longitude",
            "year",
            "water_body_type",
            "pollution_score",
            "safety_label",
        ]
    ].rename(
        columns={
            "stn_code": "id",
            "monitoring_location": "location",
            "latitude": "lat",
            "longitude": "lon",
        }
    )

    return df.to_dict(orient="records")
