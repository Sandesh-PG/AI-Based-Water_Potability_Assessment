"""Final enrichment pipeline for water quality dataset.

This script combines:
- Rule-based pollution scoring
- Safety/violation tagging
- Hybrid explanations (rule-based + RAG-enhanced measures)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

# Make project_root importable regardless of execution cwd.
# final_pipeline.py is under project_root/ml/pipeline, so parents[2] is project_root.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

import pandas as pd
from tqdm import tqdm

from pipeline.explanations import generate_explanation
from pipeline.pollution import compute_pollution_score, compute_safety_and_violations
from ml.models.forecast import forecast_pollution


def _serialize_list(value: object) -> str:
    """Serialize list-like explanation fields as compact JSON strings."""
    if isinstance(value, list):
        return json.dumps(value, ensure_ascii=False)
    return "[]"


def run_full_pipeline(input_csv: str, output_csv: str) -> pd.DataFrame:
    """Run full enrichment and save final dataset."""
    df = pd.read_csv(input_csv)

    df = compute_pollution_score(df)
    df = compute_safety_and_violations(df)

    causes_col: list[str] = []
    impacts_col: list[str] = []
    measures_col: list[str] = []

    for row in tqdm(
        df.itertuples(index=False),
        total=len(df),
        desc="Generating explanations",
    ):
        violated_params = getattr(row, "violated_params", "")
        water_body_type = getattr(row, "water_body_type", "")
        station_name = getattr(row, "monitoring_location", "")
        if not violated_params:
            causes_col.append("[]")
            impacts_col.append("[]")
            measures_col.append("[]")
            continue

        try:
            payload = generate_explanation(
                violated_params=violated_params,
                water_body_type=water_body_type,
                station_name=station_name,
            )
            causes_col.append(_serialize_list(payload.get("causes_of_pollution", [])))
            impacts_col.append(_serialize_list(payload.get("impacts", [])))
            measures_col.append(_serialize_list(payload.get("recommended_measures", [])))
        except Exception as e:
            print(f"Error occurred while generating explanation for row {row.Index}: {e}")
            # Keep pipeline resilient: skip explanation enrichment for bad rows.
            causes_col.append("[]")
            impacts_col.append("[]")
            measures_col.append("[]")

    df["causes"] = causes_col
    df["impacts"] = impacts_col
    df["measures"] = measures_col

    out_path = Path(output_csv)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False)

    return df


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run final enrichment pipeline")
    parser.add_argument("--input_csv", required=True, help="Input CSV path")
    parser.add_argument("--output_csv", required=True, help="Output CSV path")
    args = parser.parse_args()

    run_full_pipeline(args.input_csv, args.output_csv)
