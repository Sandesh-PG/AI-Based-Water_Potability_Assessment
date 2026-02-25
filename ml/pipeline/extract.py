"""
extract.py
----------
Extracts water quality data from NWMP PDFs and produces a clean CSV.

Supports the following water body types (file patterns):
  - Rivers (Med/Min):  Water_Quality_data_of_Med_Min_River_<YEAR>.pdf
  - River (Major):     WQuality_River-Data-<YEAR>.pdf
  - Coastal/Marine:    Water_creek_marine_seawater_beach_<YEAR>.pdf
  - Canals:            Water_Quality_Canals_<YEAR>.pdf
  - Drains/STPs/WTPs:  Water_Quality_Drains_STPs__WTPs_<YEAR>.pdf
  - Ponds/Tanks:       Water_pond_tanks_<YEAR>.pdf

Usage:
    python extract.py --year 2023 --state KARNATAKA --data_dir ml/data/raw --out_dir ml/data/processed

Output:
    ml/data/processed/karnataka_2023.csv
"""

import os
import re
import argparse
import pdfplumber
import pandas as pd
from pathlib import Path

# ─── Constants ────────────────────────────────────────────────────────────────

# Final column names after averaging min/max
FINAL_COLUMNS = [
    "stn_code",
    "monitoring_location",
    "water_body_type",
    "state",
    "year",
    "temperature_avg",
    "do_avg",           # Dissolved Oxygen
    "ph_avg",
    "conductivity_avg",
    "bod_avg",          # Biochemical Oxygen Demand
    "nitrate_avg",
    "fecal_coliform_avg",
    "total_coliform_avg",
    "fecal_streptococci_avg",
]

# Rows to skip — these are header/criteria rows embedded in the PDFs
SKIP_PATTERNS = [
    r"primary water quality criteria",
    r"monitoring location",
    r"state name",
    r"stn\s*code",
    r"temperature",
    r"dissolved oxygen",
    r"min\s+max",
    r"^\s*$",
]

# Map PDF file name patterns to water body type labels
FILE_TO_WATER_BODY = {
    "med_min_river": "River (Medium/Minor)",
    "river-data":    "River (Major)",
    "creek_marine":  "Coastal/Marine/Beach",
    "canals":        "Canal",
    "drains":        "Drain/STP/WTP",
    "pond":          "Pond/Tank",
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def should_skip_row(row: list) -> bool:
    """Return True if this row is a header/metadata row, not actual data."""
    text = " ".join(str(c).lower() for c in row if c)
    for pattern in SKIP_PATTERNS:
        if re.search(pattern, text):
            return True
    return False


def safe_float(value) -> float | None:
    """Convert a value to float safely, return None on failure."""
    try:
        if value is None or str(value).strip() in ("", "-", "N/A"):
            return None
        return float(str(value).strip())
    except (ValueError, TypeError):
        return None


def avg(a, b) -> float | None:
    """Return average of two values. If both missing, return None."""
    fa, fb = safe_float(a), safe_float(b)
    if fa is None and fb is None:
        return None
    if fa is None:
        return fb
    if fb is None:
        return fa
    return round((fa + fb) / 2, 4)


def detect_water_body_type(pdf_path: str) -> str:
    """Guess water body type from filename."""
    name = os.path.basename(pdf_path).lower()
    for key, label in FILE_TO_WATER_BODY.items():
        if key in name:
            return label
    return "Unknown"


def clean_location(text: str) -> str:
    """Clean up multi-line or messy location strings."""
    if not text:
        return ""
    return " ".join(str(text).split()).strip()


# ─── Core Extractor ───────────────────────────────────────────────────────────

def extract_rows_from_page(page, state_filter: str, water_body_type: str, has_type_col: bool) -> list[dict]:
    """
    Extract data rows from a single PDF page.

    has_type_col: True for coastal PDF which has an extra 'Type Water Body' column.
    """
    tables = page.extract_tables()
    rows_out = []

    for table in tables:
        for row in table:
            if not row or should_skip_row(row):
                continue

            # Filter to only the requested state
            row_text = " ".join(str(c).upper() for c in row if c)
            if state_filter.upper() not in row_text:
                continue

            try:
                if has_type_col:
                    # Coastal PDF: stn_code, location, type, state, T_min, T_max, DO_min, DO_max...
                    # Row has 3 None gaps between each pair (min, None, None, max pattern)
                    # Filter out None values to get actual data values
                    values = [c for c in row if c is not None]
                    if len(values) < 6:
                        continue

                    stn_code        = str(values[0]).strip()
                    location        = clean_location(values[1])
                    wbt             = str(values[2]).strip()   # e.g. SEA, BEACH, CREEK
                    state           = str(values[3]).strip()

                    # Parameters are in pairs after state: T_min, T_max, DO_min, DO_max ...
                    params = values[4:]

                    row_data = {
                        "stn_code":             stn_code,
                        "monitoring_location":  location,
                        "water_body_type":      wbt if wbt else water_body_type,
                        "state":                state,
                        "temperature_avg":      avg(params[0],  params[1])  if len(params) > 1  else None,
                        "do_avg":               avg(params[2],  params[3])  if len(params) > 3  else None,
                        "ph_avg":               avg(params[4],  params[5])  if len(params) > 5  else None,
                        "conductivity_avg":     avg(params[6],  params[7])  if len(params) > 7  else None,
                        "bod_avg":              avg(params[8],  params[9])  if len(params) > 9  else None,
                        "nitrate_avg":          avg(params[10], params[11]) if len(params) > 11 else None,
                        "fecal_coliform_avg":   avg(params[12], params[13]) if len(params) > 13 else None,
                        "total_coliform_avg":   avg(params[14], params[15]) if len(params) > 15 else None,
                        "fecal_streptococci_avg": avg(params[16], params[17]) if len(params) > 17 else None,
                    }

                else:
                    # Standard PDFs: stn_code, location, state, T_min, T_max, DO_min, DO_max...
                    values = [c for c in row if c is not None]
                    if len(values) < 5:
                        continue

                    stn_code = str(values[0]).strip()
                    location = clean_location(values[1])
                    state    = str(values[2]).strip()
                    params   = values[3:]

                    row_data = {
                        "stn_code":             stn_code,
                        "monitoring_location":  location,
                        "water_body_type":      water_body_type,
                        "state":                state,
                        "temperature_avg":      avg(params[0],  params[1])  if len(params) > 1  else None,
                        "do_avg":               avg(params[2],  params[3])  if len(params) > 3  else None,
                        "ph_avg":               avg(params[4],  params[5])  if len(params) > 5  else None,
                        "conductivity_avg":     avg(params[6],  params[7])  if len(params) > 7  else None,
                        "bod_avg":              avg(params[8],  params[9])  if len(params) > 9  else None,
                        "nitrate_avg":          avg(params[10], params[11]) if len(params) > 11 else None,
                        "fecal_coliform_avg":   avg(params[12], params[13]) if len(params) > 13 else None,
                        "total_coliform_avg":   avg(params[14], params[15]) if len(params) > 15 else None,
                        "fecal_streptococci_avg": avg(params[16], params[17]) if len(params) > 17 else None,
                    }

                # Skip rows where location or state is clearly wrong
                if not location or state_filter.upper() not in row_data["state"].upper():
                    continue

                rows_out.append(row_data)

            except (IndexError, Exception) as e:
                # Skip malformed rows silently
                continue

    return rows_out


def extract_from_pdf(pdf_path: str, state_filter: str, year: int) -> pd.DataFrame:
    """Extract all matching rows from a single PDF file."""
    water_body_type = detect_water_body_type(pdf_path)

    # Coastal PDF has an extra 'Type Water Body' column
    has_type_col = "creek_marine" in os.path.basename(pdf_path).lower()

    print(f"  Processing: {os.path.basename(pdf_path)} [{water_body_type}]")

    all_rows = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if state_filter.upper() not in text.upper():
                continue  # Skip pages that don't mention the state at all
            rows = extract_rows_from_page(page, state_filter, water_body_type, has_type_col)
            all_rows.extend(rows)

    if not all_rows:
        print(f"    → No {state_filter} data found.")
        return pd.DataFrame()

    df = pd.DataFrame(all_rows)
    df["year"] = year
    print(f"    → {len(df)} rows extracted.")
    return df


# ─── Main Pipeline ────────────────────────────────────────────────────────────

def run_extraction(year: int, state: str, data_dir: str, out_dir: str):
    """
    Main entry point. Scans all PDFs for a given year, extracts state data,
    merges them, and saves to a CSV.
    """
    raw_dir = Path(data_dir) / str(year)

    if not raw_dir.exists():
        raise FileNotFoundError(f"Raw data directory not found: {raw_dir}")

    pdf_files = sorted(raw_dir.glob("*.pdf"))
    if not pdf_files:
        # Also check for .html files (some datasets come as HTML)
        pdf_files = sorted(raw_dir.glob("*.html"))

    if not pdf_files:
        raise FileNotFoundError(f"No PDF files found in {raw_dir}")

    print(f"\n{'='*60}")
    print(f"Extracting {state} data for year {year}")
    print(f"Found {len(pdf_files)} files in {raw_dir}")
    print(f"{'='*60}")

    all_dfs = []
    for pdf_path in pdf_files:
        df = extract_from_pdf(str(pdf_path), state, year)
        if not df.empty:
            all_dfs.append(df)

    if not all_dfs:
        print(f"\n⚠  No data found for {state} in {year}.")
        return

    # Merge all water body types
    merged_df = pd.concat(all_dfs, ignore_index=True)

    # Reorder columns
    existing_cols = [c for c in FINAL_COLUMNS if c in merged_df.columns]
    merged_df = merged_df[existing_cols]

    # Drop completely empty parameter rows (all params are None)
    param_cols = [c for c in existing_cols if c.endswith("_avg")]
    merged_df = merged_df.dropna(subset=param_cols, how="all")

    # Save output
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    out_file = out_path / f"{state.lower()}_{year}.csv"
    merged_df.to_csv(out_file, index=False)

    print(f"\n{'='*60}")
    print(f"✓ Done! Total rows: {len(merged_df)}")
    print(f"✓ Saved to: {out_file}")
    print(f"{'='*60}\n")

    # Quick summary
    print("Water body breakdown:")
    print(merged_df["water_body_type"].value_counts().to_string())
    print("\nSample output:")
    print(merged_df.head(5).to_string(index=False))

    return merged_df


# ─── CLI ──────────────────────────────────────────────────────────────────────

def run_for_all_years(state: str, data_dir: str, out_dir: str, exclude_years=None):
    """
    Automatically run extraction for all year folders in raw data directory.
    """
    raw_root = Path(data_dir)
    exclude_years = set(exclude_years or [])

    year_dirs = sorted([
        int(p.name) for p in raw_root.iterdir()
        if p.is_dir() and p.name.isdigit()
    ])

    print(f"\nFound year folders: {year_dirs}")

    for year in year_dirs:
        if year in exclude_years:
            print(f"Skipping excluded year: {year}")
            continue

        run_extraction(year, state, data_dir, out_dir)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract NWMP water quality data")

    parser.add_argument("--year", type=int, default=None,
                        help="Single year to extract (optional)")

    parser.add_argument("--state", type=str, default="KARNATAKA",
                        help="State to filter")

    parser.add_argument("--data_dir", type=str, default="ml/data/raw",
                        help="Root raw data directory")

    parser.add_argument("--out_dir", type=str, default="ml/data/processed",
                        help="Output directory")

    parser.add_argument("--exclude_years", nargs="*", type=int, default=[],
                        help="Years to skip (e.g. 2023)")

    args = parser.parse_args()

    if args.year:
        run_extraction(args.year, args.state, args.data_dir, args.out_dir)
    else:
        run_for_all_years(args.state, args.data_dir, args.out_dir, args.exclude_years)