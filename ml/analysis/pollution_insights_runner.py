"""Pre-generate pollution insights for unique violated_params + water_body_type combos."""

from __future__ import annotations

import json
import time
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

load_dotenv()

try:
    from .pollution_insights import generate_pollution_insights
except ImportError:
    from pollution_insights import generate_pollution_insights

ML_ROOT = Path(__file__).resolve().parents[1]
INPUT_CSV = ML_ROOT / "data/geocoded/karnataka_train_2016_2022.csv"
OUTPUT_JSON = ML_ROOT / "data/insights/combo_insights_cache.json"
SLEEP_SECONDS = 32


def main() -> None:
    df = pd.read_csv(INPUT_CSV)
    unsafe_df = df[df["safety_label"] == "Unsafe"]

    combos = (
        unsafe_df.groupby(["violated_params", "water_body_type"])
        .size()
        .reset_index()[["violated_params", "water_body_type"]]
    )

    print(f"Total unique combos: {len(combos)}")

    # Load existing cache if any (allows resume on interruption)
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT_JSON.exists():
        with OUTPUT_JSON.open() as f:
            cache: dict = json.load(f)
        print(f"Resuming — {len(cache)} combos already cached")
    else:
        cache = {}

    for i, row in enumerate(combos.itertuples(index=False), start=1):
        violated_params = str(row.violated_params).strip()
        water_body_type = str(row.water_body_type).strip()
        cache_key = f"{violated_params}__{water_body_type}"

        if cache_key in cache:
            print(f"[{i}/{len(combos)}] Skipping (cached): {cache_key}")
            continue

        print(f"[{i}/{len(combos)}] Generating: {cache_key}")

        try:
            insight = generate_pollution_insights(
                violated_params=violated_params,
                water_body_type=water_body_type,
                station_name=water_body_type,
            )
            cache[cache_key] = insight

            # Save after every successful call
            with OUTPUT_JSON.open("w") as f:
                json.dump(cache, f, indent=2, ensure_ascii=False)

            print(f"[{i}/{len(combos)}] Done. Waiting {SLEEP_SECONDS}s...")
            time.sleep(SLEEP_SECONDS)

        except Exception as exc:
            print(f"[{i}/{len(combos)}] Failed: {exc}")

    print(f"\nCache saved to: {OUTPUT_JSON}")
    print(f"Total cached: {len(cache)}/{len(combos)}")


if __name__ == "__main__":
    main()