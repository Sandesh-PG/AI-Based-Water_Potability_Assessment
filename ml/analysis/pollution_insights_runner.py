"""Run pollution insights generation for unsafe stations."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd
import re
import time

time.sleep(30) 

try:
    from .pollution_insights import generate_pollution_insights
except ImportError:
    from pollution_insights import generate_pollution_insights


DEFAULT_INPUT_RELATIVE_PATH = "data/geocoded/karnataka_train_2016_2022.csv"
DEFAULT_OUTPUT_RELATIVE_PATH = "data/insights/pollution_insights_results.json"


def _ml_root() -> Path:
    # This file is under ml/analysis, so the ml root is one level up.
    return Path(__file__).resolve().parents[1]


def _to_string(value: object, fallback: str = "") -> str:
    if pd.isna(value):
        return fallback
    return str(value).strip()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate pollution insights for unsafe water quality stations."
    )
    parser.add_argument(
        "--top_n",
        type=int,
        default=10,
        help="Maximum number of unsafe stations to process (default: 10)",
    )
    args = parser.parse_args()

    if args.top_n <= 0:
        raise ValueError("--top_n must be a positive integer")

    ml_root = _ml_root()
    input_csv = ml_root / DEFAULT_INPUT_RELATIVE_PATH
    output_json = ml_root / DEFAULT_OUTPUT_RELATIVE_PATH

    if not input_csv.exists():
        raise FileNotFoundError(f"Input CSV not found: {input_csv}")

    df = pd.read_csv(input_csv)

    unsafe_df = df[df["safety_label"].astype(str).str.lower() == "unsafe"].copy()
    unsafe_df = unsafe_df.head(args.top_n)

    total = len(unsafe_df)
    print(f"Unsafe stations selected: {total}")

    results: list[dict] = []

    for index, row in enumerate(unsafe_df.itertuples(index=False), start=1):
        station_name = _to_string(getattr(row, "monitoring_location", ""), fallback="Unknown Station")
        water_body_type = _to_string(getattr(row, "water_body_type", ""), fallback="Unknown")
        violated_params = _to_string(getattr(row, "violated_params", ""), fallback="")

        print(f"[{index}/{total}] Processing station: {station_name}")

        try:
            insight = generate_pollution_insights(
                violated_params=violated_params,
                water_body_type=water_body_type,
                station_name=station_name,
            )
            results.append(insight)
        except Exception as exc:
            wait_match = re.search(r"try again in (\d+\.?\d*)s", str(exc))
            if wait_match:
                wait_time = float(wait_match.group(1)) + 2
                print(f"Rate limited. Waiting {wait_time:.0f}s...")
                time.sleep(wait_time)
                # Retry once
                try:
                    insight = generate_pollution_insights(
                        violated_params=violated_params,
                        water_body_type=water_body_type,
                        station_name=station_name,
                    )
                    results.append(insight)
                    continue
                except Exception as retry_exc:
                    exc = retry_exc
            results.append(
                {
                    "station_name": station_name,
                    "water_body_type": water_body_type,
                    "violated_params": [
                        item.strip() for item in violated_params.split(",") if item.strip()
                    ],
                    "causes_of_pollution": [],
                    "recommended_measures": [],
                    "retrieved_context_count": 0,
                    "error": str(exc),
                }
            )
            print(f"[{index}/{total}] Failed: {exc}")

    output_json.parent.mkdir(parents=True, exist_ok=True)
    with output_json.open("w", encoding="utf-8") as handle:
        json.dump(results, handle, indent=2, ensure_ascii=False)

    print(f"Saved {len(results)} insight records to {output_json}")


if __name__ == "__main__":
    main()
