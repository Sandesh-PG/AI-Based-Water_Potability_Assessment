from __future__ import annotations

from io import StringIO
from typing import Annotated, Any

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile

from ml.pipeline.pollution import REQUIRED_COLUMNS, compute_pollution_score, compute_safety_and_violations

router = APIRouter(prefix="/batch", tags=["batch"])


@router.post(
    "/predict",
    responses={
        400: {
            "description": "Invalid CSV upload or malformed content",
        },
    },
)
async def predict_batch(file: Annotated[UploadFile, File(...)]) -> list[dict[str, Any]]:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a valid CSV file")

    try:
        raw_bytes = await file.read()
        raw_text = raw_bytes.decode("utf-8-sig")
        df = pd.read_csv(StringIO(raw_text))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid CSV") from exc

    if df.empty:
        return []

    for col in REQUIRED_COLUMNS:
        if col not in df.columns:
            df[col] = pd.NA

    try:
        scored = compute_pollution_score(df.copy())
        enriched = compute_safety_and_violations(scored)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Batch prediction failed: {exc}") from exc

    enriched["pollution_score"] = pd.to_numeric(enriched["pollution_score"], errors="coerce").round(2)

    payload = enriched.where(pd.notna(enriched), None).to_dict(orient="records")
    return payload
