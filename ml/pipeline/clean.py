"""
clean.py
--------
Cleans the extracted water quality CSV and prepares it for geocoding and ML.

What this script does:
  1. Fills missing stn_code values using location-based hash
  2. Flags each station as Safe / Unsafe based on BIS/EPA thresholds
  3. Caps extreme outlier values (for ML stability) without deleting rows
  4. Adds a pollution_score (0-100) for heatmap intensity
  5. Saves cleaned CSV ready for geocode.py and model training

BIS Thresholds (Primary Water Quality Criteria, E(P) Rules 1986):
  - DO           >= 5.0 mg/L
  - pH           6.5 - 8.5
  - BOD          < 3.0 mg/L
  - Fecal Col.   < 500 MPN/100ml
  - Total Col.   < 2500 MPN/100ml

Usage:
    python clean.py --input data/processed/karnataka_2023.csv
                    --output data/processed/karnataka_2023_clean.csv
"""

import argparse
import hashlib
import pandas as pd
import numpy as np
from pathlib import Path

# ─── BIS Thresholds ───────────────────────────────────────────────────────────

THRESHOLDS = {
    "do_avg":               {"min": 5.0,  "max": None},
    "ph_avg":               {"min": 6.5,  "max": 8.5},
    "bod_avg":              {"min": None, "max": 3.0},
    "fecal_coliform_avg":   {"min": None, "max": 500.0},
    "total_coliform_avg":   {"min": None, "max": 2500.0},
}

# Caps for outlier handling (99th percentile logic applied, but these are hard caps)
# Keeps data realistic for ML without deleting genuine pollution signals
OUTLIER_CAPS = {
    "bod_avg":              500.0,
    "fecal_coliform_avg":   1_000_000.0,
    "total_coliform_avg":   5_000_000.0,
    "conductivity_avg":     50_000.0,
    "nitrate_avg":          100.0,
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def generate_stn_code(location: str) -> str:
    """Generate a unique station code from location name if missing."""
    h = hashlib.md5(location.encode()).hexdigest()[:6].upper()
    return f"GEN-{h}"


def classify_safety(row: pd.Series) -> str:
    """
    Classify a row as Safe or Unsafe based on BIS thresholds.
    A station is Unsafe if ANY parameter violates its threshold.
    """
    for param, limits in THRESHOLDS.items():
        val = row.get(param)
        if pd.isna(val):
            continue
        if limits["min"] is not None and val < limits["min"]:
            return "Unsafe"
        if limits["max"] is not None and val > limits["max"]:
            return "Unsafe"
    return "Safe"


def compute_pollution_score(row: pd.Series) -> float:
    """
    Compute a 0-100 pollution score for heatmap intensity.
    Higher = more polluted.

    Logic: each parameter contributes a normalized violation score.
    """
    scores = []

    # DO: lower is worse (min threshold 5.0, dead water ~0)
    if not pd.isna(row.get("do_avg")):
        do_score = max(0, (5.0 - row["do_avg"]) / 5.0) * 100
        scores.append(do_score)

    # BOD: higher is worse (threshold 3.0, cap at 100 for scoring)
    if not pd.isna(row.get("bod_avg")):
        bod_score = min(100, (row["bod_avg"] / 3.0) * 33.3)
        scores.append(bod_score)

    # pH: deviation from 6.5-8.5 range
    if not pd.isna(row.get("ph_avg")):
        ph = row["ph_avg"]
        if ph < 6.5:
            ph_score = ((6.5 - ph) / 6.5) * 100
        elif ph > 8.5:
            ph_score = ((ph - 8.5) / 8.5) * 100
        else:
            ph_score = 0
        scores.append(ph_score)

    # Fecal Coliform: higher is worse (threshold 500)
    if not pd.isna(row.get("fecal_coliform_avg")):
        fc_score = min(100, (row["fecal_coliform_avg"] / 500.0) * 10)
        scores.append(fc_score)

    # Total Coliform: higher is worse (threshold 2500)
    if not pd.isna(row.get("total_coliform_avg")):
        tc_score = min(100, (row["total_coliform_avg"] / 2500.0) * 10)
        scores.append(tc_score)

    if not scores:
        return 0.0

    return round(min(100.0, float(np.mean(scores))), 2)


def identify_violated_params(row: pd.Series) -> str:
    """Return comma-separated list of parameters that violate thresholds."""
    violated = []
    labels = {
        "do_avg":             "Low DO",
        "ph_avg":             "pH Out of Range",
        "bod_avg":            "High BOD",
        "fecal_coliform_avg": "High Fecal Coliform",
        "total_coliform_avg": "High Total Coliform",
    }
    for param, limits in THRESHOLDS.items():
        val = row.get(param)
        if pd.isna(val):
            continue
        if limits["min"] is not None and val < limits["min"]:
            violated.append(labels[param])
        if limits["max"] is not None and val > limits["max"]:
            violated.append(labels[param])
    return ", ".join(violated) if violated else "None"


# ─── Main Cleaner ─────────────────────────────────────────────────────────────

def clean(input_path: str, output_path: str):
    df = pd.read_csv(input_path)
    original_count = len(df)
    print(f"\n{'='*60}")
    print(f"Cleaning: {input_path}")
    print(f"Rows loaded: {original_count}")
    print(f"{'='*60}")

    # ── Step 1: Fill missing stn_code ─────────────────────────────────────────
    missing_stn = df["stn_code"].isna().sum()
    df["stn_code"] = df.apply(
        lambda r: generate_stn_code(r["monitoring_location"])
        if pd.isna(r["stn_code"]) else str(int(r["stn_code"]))
        if str(r["stn_code"]).endswith(".0") else str(r["stn_code"]),
        axis=1
    )
    print(f"\n✓ Step 1: Filled {missing_stn} missing stn_code values")

    # ── Step 2: Clean location strings ────────────────────────────────────────
    df["monitoring_location"] = df["monitoring_location"].str.strip().str.title()
    print(f"✓ Step 2: Cleaned location strings")

    # ── Step 3: Cap extreme outliers ──────────────────────────────────────────
    capped = {}
    for col, cap in OUTLIER_CAPS.items():
        if col in df.columns:
            over = (df[col] > cap).sum()
            if over > 0:
                df[col] = df[col].clip(upper=cap)
                capped[col] = over
    if capped:
        for col, count in capped.items():
            print(f"✓ Step 3: Capped {count} outlier(s) in {col} at {OUTLIER_CAPS[col]}")
    else:
        print(f"✓ Step 3: No outliers needed capping")

    # ── Step 4: Classify Safe / Unsafe ────────────────────────────────────────
    df["safety_label"] = df.apply(classify_safety, axis=1)
    safe_count   = (df["safety_label"] == "Safe").sum()
    unsafe_count = (df["safety_label"] == "Unsafe").sum()
    print(f"✓ Step 4: Classified → Safe: {safe_count}, Unsafe: {unsafe_count}")

    # ── Step 5: Pollution score for heatmap ───────────────────────────────────
    df["pollution_score"] = df.apply(compute_pollution_score, axis=1)
    print(f"✓ Step 5: Pollution scores computed (range: {df['pollution_score'].min():.1f} - {df['pollution_score'].max():.1f})")

    # ── Step 6: Tag violated parameters ──────────────────────────────────────
    df["violated_params"] = df.apply(identify_violated_params, axis=1)
    print(f"✓ Step 6: Violation tags added")

    # ── Step 7: Final column order ────────────────────────────────────────────
    col_order = [
        "stn_code", "monitoring_location", "water_body_type", "state", "year",
        "safety_label", "pollution_score", "violated_params",
        "temperature_avg", "do_avg", "ph_avg", "conductivity_avg",
        "bod_avg", "nitrate_avg", "fecal_coliform_avg",
        "total_coliform_avg", "fecal_streptococci_avg",
    ]
    df = df[[c for c in col_order if c in df.columns]]

    # ── Save ──────────────────────────────────────────────────────────────────
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)

    print(f"\n{'='*60}")
    print(f"✓ Saved to: {output_path}")
    print(f"✓ Final rows: {len(df)}")
    print(f"{'='*60}")

    # Summary
    print("\nTop 5 most polluted stations:")
    top5 = df.nlargest(5, "pollution_score")[
        ["monitoring_location", "pollution_score", "safety_label", "violated_params"]
    ]
    for _, r in top5.iterrows():
        print(f"  [{r['pollution_score']:5.1f}] {r['monitoring_location'][:55]}")
        print(f"         Violations: {r['violated_params']}")

    print("\nWater body safety breakdown:")
    print(df.groupby(["water_body_type", "safety_label"]).size().to_string())

    return df



def run_clean_for_all_years(input_dir: str, output_dir: str, exclude_years=None):
    """
    Automatically clean all Karnataka CSVs in processed folder.
    """
    from pathlib import Path
    exclude_years = set(exclude_years or [])

    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    files = sorted(input_path.glob("karnataka_*.csv"))

    for file in files:
        year = int(file.stem.split("_")[1])

        if year in exclude_years:
            print(f"Skipping year {year}")
            continue

        out_file = output_path / f"karnataka_{year}_clean.csv"

        print(f"\nCleaning {file.name} → {out_file.name}")

        clean(str(file), str(out_file))  # your existing function

        

# ─── CLI ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Clean NWMP datasets")

    parser.add_argument("--input", type=str, default=None,
                        help="Single input CSV (optional)")

    parser.add_argument("--output", type=str, default=None,
                        help="Output CSV path")

    parser.add_argument("--input_dir", type=str, default="data/processed",
                        help="Directory containing yearly CSVs")

    parser.add_argument("--output_dir", type=str, default="data/processed",
                        help="Directory for cleaned outputs")

    parser.add_argument("--exclude_years", nargs="*", type=int, default=[],
                        help="Years to skip (e.g. 2023)")

    args = parser.parse_args()

    if args.input:
        clean(args.input, args.output)
    else:
        run_clean_for_all_years(args.input_dir, args.output_dir, args.exclude_years)