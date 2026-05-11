from __future__ import annotations

import re
import shutil
import tempfile
from pathlib import Path
from typing import Annotated

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ml.pipeline.clean import clean as clean_csv
from ml.pipeline.extract import extract_from_pdf
from ml.pipeline.geocode import run_geocoding
from ml.pipeline.pollution import (
    REQUIRED_COLUMNS,
    compute_pollution_score,
    compute_safety_and_violations,
)

router = APIRouter(prefix="/batch", tags=["batch"])

PROJECT_ROOT = Path(__file__).resolve().parents[2]
GEOCODE_CACHE_FILE = PROJECT_ROOT / "ml" / "data" / "geocoded" / "geocode_cache.json"

VALID_FILENAME_PATTERNS = [
    r"WQuality_River-Data-{year}\.pdf",
    r"Water_Quality_data_of_Med_Min_River_{year}\.pdf",
    r"Water_creek_marine_seawater_beach_{year}\.pdf",
    r"Water_Quality_Canals_{year}\.pdf",
    r"Water_Quality_Drains_STPs_WTPs_{year}\.pdf",
    r"Water_pond_tanks_{year}\.pdf",
    r"NWMP_DATA_{year}\.pdf",
]


class BatchResult(BaseModel):
    stn_code: str | None
    monitoring_location: str | None
    water_body_type: str | None
    year: int | None
    safety_label: str
    pollution_score: float | None
    violated_params: str
    do_avg: float | None
    ph_avg: float | None
    bod_avg: float | None
    nitrate_avg: float | None
    fecal_coliform_avg: float | None
    latitude: float | None
    longitude: float | None


class BatchResponse(BaseModel):
    total_rows: int
    safe_count: int
    unsafe_count: int
    geocoded_count: int
    year: int
    results: list[BatchResult]


def _as_float(value) -> float | None:
    if value is None or pd.isna(value):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_str(value) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def _as_int(value) -> int | None:
    if value is None or pd.isna(value):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _ensure_required_columns(df: pd.DataFrame) -> pd.DataFrame:
    for column in REQUIRED_COLUMNS:
        if column not in df.columns:
            df[column] = pd.NA
    return df


def _validate_filenames(files: list[UploadFile], year: int) -> list[str]:
    valid_patterns = [re.compile(pattern.format(year=year), re.IGNORECASE) for pattern in VALID_FILENAME_PATTERNS]
    invalid_files: list[str] = []

    for uploaded_file in files:
        filename = Path(uploaded_file.filename or "").name
        if not filename or not any(pattern.fullmatch(filename) for pattern in valid_patterns):
            invalid_files.append(filename or "<missing filename>")

    return invalid_files


def _build_result_row(row: pd.Series) -> BatchResult:
    return BatchResult(
        stn_code=_as_str(row.get("stn_code")),
        monitoring_location=_as_str(row.get("monitoring_location")),
        water_body_type=_as_str(row.get("water_body_type")),
        year=_as_int(row.get("year")),
        safety_label=str(row.get("safety_label") or ""),
        pollution_score=_as_float(row.get("pollution_score")),
        violated_params=str(row.get("violated_params") or ""),
        do_avg=_as_float(row.get("do_avg")),
        ph_avg=_as_float(row.get("ph_avg")),
        bod_avg=_as_float(row.get("bod_avg")),
        nitrate_avg=_as_float(row.get("nitrate_avg")),
        fecal_coliform_avg=_as_float(row.get("fecal_coliform_avg")),
        latitude=_as_float(row.get("latitude")),
        longitude=_as_float(row.get("longitude")),
    )


@router.post(
    "/predict",
    responses={
        400: {"description": "Invalid filenames or malformed PDF input"},
        422: {"description": "No Karnataka data found in uploaded PDFs"},
        500: {"description": "Pipeline failure"},
    },
)
async def predict_batch(
    files: Annotated[list[UploadFile], File(...)],
    year: Annotated[int, Form(...)],
) -> BatchResponse:
    if not files:
        raise HTTPException(status_code=400, detail="At least one PDF file is required")

    invalid_files = _validate_filenames(files, year)
    if invalid_files:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "One or more filenames do not match the required NWMP naming convention",
                "invalid_filenames": invalid_files,
            },
        )

    temp_dir = Path(tempfile.mkdtemp(prefix="nwmp-batch-"))
    original_cache_file = None

    try:
        pdf_dir = temp_dir / "pdfs"
        pdf_dir.mkdir(parents=True, exist_ok=True)

        extracted_frames: list[pd.DataFrame] = []
        for uploaded_file in files:
            pdf_path = pdf_dir / Path(uploaded_file.filename or "upload.pdf").name
            pdf_path.write_bytes(await uploaded_file.read())

            try:
                extracted_df = extract_from_pdf(str(pdf_path), state_filter="KARNATAKA", year=year)
            except Exception as exc:  # pragma: no cover - defensive guard for pipeline failures
                raise HTTPException(
                    status_code=500,
                    detail=f"Extraction failed for {uploaded_file.filename or 'uploaded file'}: {exc}",
                ) from exc

            if not extracted_df.empty:
                extracted_frames.append(extracted_df)

        if not extracted_frames:
            raise HTTPException(status_code=422, detail="No Karnataka data found in the uploaded PDFs")

        extracted_df = pd.concat(extracted_frames, ignore_index=True)
        extracted_csv = temp_dir / "extracted.csv"
        cleaned_csv = temp_dir / "cleaned.csv"
        geocoded_csv = temp_dir / "geocoded.csv"

        extracted_df.to_csv(extracted_csv, index=False)

        clean_csv(str(extracted_csv), str(cleaned_csv))

        import ml.pipeline.geocode as geocode_module

        original_cache_file = geocode_module.CACHE_FILE
        geocode_module.CACHE_FILE = str(GEOCODE_CACHE_FILE)
        try:
            run_geocoding(str(cleaned_csv), str(geocoded_csv), "Karnataka")
        finally:
            geocode_module.CACHE_FILE = original_cache_file

        final_df = pd.read_csv(geocoded_csv)
        final_df = _ensure_required_columns(final_df.copy())

        final_df = compute_pollution_score(final_df)
        final_df = compute_safety_and_violations(final_df)
        final_df["pollution_score"] = pd.to_numeric(final_df["pollution_score"], errors="coerce").round(2)

        results = [_build_result_row(row) for _, row in final_df.iterrows()]
        safe_count = sum(1 for row in results if row.safety_label == "Safe")
        unsafe_count = sum(1 for row in results if row.safety_label == "Unsafe")
        geocoded_count = sum(1 for row in results if row.latitude is not None and row.longitude is not None)

        return BatchResponse(
            total_rows=len(results),
            safe_count=safe_count,
            unsafe_count=unsafe_count,
            geocoded_count=geocoded_count,
            year=year,
            results=results,
        )

    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive guard for unexpected pipeline failures
        raise HTTPException(status_code=500, detail=f"Pipeline failure: {exc}") from exc
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
