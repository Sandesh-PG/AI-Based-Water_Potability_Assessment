"""Rule-based pollution scoring utilities.

This module provides a deterministic pollution score computation based on
water-quality parameter threshold violations.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

SAFE_LIMITS = {
    "ph_min": 6.5,
    "ph_max": 8.5,
    "do_min": 5.0,
    "bod_max": 3.0,
    "nitrate_max": 10.0,
    "fecal_coliform_max": 500.0,
}

REQUIRED_COLUMNS = [
    "ph_avg",
    "do_avg",
    "bod_avg",
    "nitrate_avg",
    "fecal_coliform_avg",
]


def _ph_contribution(value: float | int | None) -> float | None:
    """Return normalized pH pollution contribution, or None if missing."""
    if pd.isna(value):
        return None
    if value < SAFE_LIMITS["ph_min"]:
        return float((SAFE_LIMITS["ph_min"] - value) / SAFE_LIMITS["ph_min"])
    if value > SAFE_LIMITS["ph_max"]:
        return float(min(abs(value - SAFE_LIMITS["ph_max"]) / SAFE_LIMITS["ph_max"], 1.0))
    return 0.0


def _min_threshold_contribution(value: float | int | None, min_value: float) -> float | None:
    """Return normalized contribution for parameters with a minimum safe limit."""
    if pd.isna(value):
        return None
    if value >= min_value:
        return 0.0
    if min_value == 0:
        return 0.0
    return float(min((min_value - value) / min_value, 1.0))


def _max_threshold_contribution(value: float | int | None, max_value: float) -> float | None:
    """Return normalized contribution for parameters with a maximum safe limit."""
    if pd.isna(value):
        return None
    if value <= max_value:
        return 0.0
    if max_value == 0:
        return 0.0
    return float(min((value - max_value) / max_value, 1.0))


def _row_pollution_score(row: pd.Series) -> float:
    """Compute pollution score for one row on a 0-100 scale."""
    contributions = [
        _ph_contribution(row.get("ph_avg")),
        _min_threshold_contribution(row.get("do_avg"), SAFE_LIMITS["do_min"]),
        _max_threshold_contribution(row.get("bod_avg"), SAFE_LIMITS["bod_max"]),
        _max_threshold_contribution(row.get("nitrate_avg"), SAFE_LIMITS["nitrate_max"]),
        _max_threshold_contribution(
            row.get("fecal_coliform_avg"),
            SAFE_LIMITS["fecal_coliform_max"],
        ),
    ]

    valid = [score for score in contributions if score is not None]
    if not valid:
        return np.nan

    return float(np.mean(valid) * 100.0)


def compute_pollution_score(df: pd.DataFrame) -> pd.DataFrame:
    """Add pollution_score (0-100) to a dataframe and return the same dataframe.

    Requirements:
    - Input dataframe should contain columns in REQUIRED_COLUMNS.
    - Missing parameter values are ignored in averaging.
    - If all parameters are missing for a row, pollution_score is NaN.
    """
    missing_columns = [col for col in REQUIRED_COLUMNS if col not in df.columns]
    if missing_columns:
        missing = ", ".join(missing_columns)
        raise ValueError(f"Missing required columns: {missing}")

    # Coerce required columns to numeric to keep outputs deterministic and safe.
    for col in REQUIRED_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["pollution_score"] = df.apply(_row_pollution_score, axis=1)
    df["pollution_score"] = pd.to_numeric(df["pollution_score"], errors="coerce")

    return df
