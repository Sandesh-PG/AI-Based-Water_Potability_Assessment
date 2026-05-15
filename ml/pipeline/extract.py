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

WATER_BODY_RIVER = "River"
WATER_BODY_CANAL = "Canal"
WATER_BODY_POND_TANK = "Pond/Tank"
WATER_BODY_COASTAL = "Coastal"
WATER_BODY_DRAIN = "Drain/STP/WTP"
WATER_BODY_OTHER = "Other"

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
    "total_dissolved_solids_avg",
    "fluoride_avg",
    "arsenic_avg",
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
    "med_min_river": WATER_BODY_RIVER,
    "river-data":    WATER_BODY_RIVER,
    "river":         WATER_BODY_RIVER,
    "creek_marine":  WATER_BODY_COASTAL,
    "marine":        WATER_BODY_COASTAL,
    "sea":           WATER_BODY_COASTAL,
    "coastal":       WATER_BODY_COASTAL,
    "beach":         WATER_BODY_COASTAL,
    "canals":        WATER_BODY_CANAL,
    "canal":         WATER_BODY_CANAL,
    "ground":        "Groundwater",
    "groundwater":   "Groundwater",
    "borewell":      "Groundwater",
    "drains":        WATER_BODY_DRAIN,
    "stp":           WATER_BODY_DRAIN,
    "wtp":           WATER_BODY_DRAIN,
    "pond":          WATER_BODY_POND_TANK,
    "tank":          WATER_BODY_POND_TANK,
}

RIVER_PARAMETER_NAMES = [
    "temperature_avg",
    "do_avg",
    "ph_avg",
    "conductivity_avg",
    "bod_avg",
    "nitrate_avg",
    "fecal_coliform_avg",
    "total_coliform_avg",
    "fecal_streptococci_avg",
]

GROUNDWATER_PARAMETER_NAMES = [
    "temperature_avg",
    "ph_avg",
    "conductivity_avg",
    "bod_avg",
    "nitrate_avg",
    "fecal_coliform_avg",
    "total_coliform_avg",
    "total_dissolved_solids_avg",
    "fluoride_avg",
    "arsenic_avg",
]


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


def detect_water_body_type(pdf_path: str, page_text: str | None = None, schema: str | None = None) -> str:
    """Detect water body type using schema first, then content hints, then filename fallback."""

    if schema == "groundwater":
        return "Groundwater"
    if schema == "coastal":
        return WATER_BODY_COASTAL

    text_rules = [
        (WATER_BODY_RIVER, ["river"]),
        (WATER_BODY_CANAL, ["canal"]),
        (WATER_BODY_POND_TANK, ["pond", "tank"]),
        (WATER_BODY_COASTAL, ["marine", "sea", "coastal", "beach"]),
        (WATER_BODY_DRAIN, ["drain", "stp", "wtp"]),
    ]

    # River schema pages can still represent canal / pond / drain variants in the
    # dataset, so keep content and filename hints active for this case.
    if schema == "river" or schema is None:
        detected = _match_water_body_keywords(page_text or "", text_rules)
        if detected:
            return detected

    name = pdf_path.lower()
    filename_rules = [
        (WATER_BODY_RIVER, ["river"]),
        (WATER_BODY_CANAL, ["canal"]),
        (WATER_BODY_POND_TANK, ["pond", "tank"]),
        (WATER_BODY_COASTAL, ["marine", "sea"]),
        (WATER_BODY_DRAIN, ["drain"]),
    ]
    detected = _match_water_body_keywords(name, filename_rules)
    if detected:
        return detected

    if schema == "river":
        return WATER_BODY_RIVER

    for key, label in FILE_TO_WATER_BODY.items():
        if key in name:
            return label

    return WATER_BODY_OTHER


def clean_location(text: str) -> str:
    """Clean up multi-line or messy location strings."""
    if not text:
        return ""
    return " ".join(str(text).split()).strip()


def _match_water_body_keywords(text: str, rules: list[tuple[str, list[str]]]) -> str | None:
    """Return the first matching water-body label for the given text."""
    lowered = (text or "").lower()
    if not lowered.strip():
        return None

    for label, keywords in rules:
        if any(keyword in lowered for keyword in keywords):
            return label

    return None


def _pairwise_parameter_averages(values: list, parameter_names: list[str]) -> dict:
    """Convert a flat min/max value list into parameter averages."""
    row_data = {}
    expected_values = len(parameter_names) * 2

    if len(values) < expected_values:
        values = values + [None] * (expected_values - len(values))

    for index, parameter_name in enumerate(parameter_names):
        left = values[index * 2] if index * 2 < len(values) else None
        right = values[index * 2 + 1] if index * 2 + 1 < len(values) else None
        row_data[parameter_name] = avg(left, right)

    return row_data


def detect_schema(page_text: str, has_type_col: bool) -> str:
    """Detect the schema for a page using the page text.

    Page content drives the choice. File-name hints are only used as a fallback
    when the page text is too noisy to classify.
    """
    text = (page_text or "").upper()

    # Prefer explicit 'TYPE WATER BODY' indicator as coastal-style tables
    if "TYPE WATER BODY" in text:
        return "coastal"

    # Groundwater indicators (TDS, Arsenic, Fluoride, Borewell)
    groundwater_markers = [
        "ARSENIC",
        "FLUORIDE",
        "TDS",
        "TOTAL DISSOLVED SOLIDS",
        "GROUND WATER",
        "GROUNDWATER",
        "BOREWELL",
    ]
    if any(marker in text for marker in groundwater_markers):
        return "groundwater"

    # Coastal / creek markers
    coastal_markers = ["MARINE", "SEA", "COASTAL", "BEACH", "CREEK"]
    if any(marker in text for marker in coastal_markers):
        return "coastal"

    # Canal markers
    canal_markers = ["CANAL", "CANALS", "IRRIGATION", "BARRAGE"]
    if any(marker in text for marker in canal_markers):
        # Canal pages usually reuse river-style columns, so prefer river schema
        return "river"

    # Drain/STP markers
    drain_markers = ["DRAIN", "STP", "WTP", "SEWAGE", "EFFLUENT"]
    if any(marker in text for marker in drain_markers):
        return "coastal" if has_type_col else "river"

    # River markers (DO/BOD frequently present)
    river_markers = ["DISSOLVED OXYGEN", "WATER QUALITY", "RIVER", "BOD", "NITRATE"]
    if any(marker in text for marker in river_markers):
        return "river"

    # If a type column exists (coastal style tables), prefer coastal
    if has_type_col:
        return "coastal"

    # Default to river schema as the most common table layout
    return "river"


def river_schema_parser(row: list, water_body_type: str) -> dict | None:
    """Parse the standard river schema.

    River tables are expected to contain stn_code, location, state, followed by
    min/max pairs for the nine core parameters.
    """
    values = [c for c in row if c is not None]
    if len(values) < 5:
        return None

    stn_code = str(values[0]).strip()
    location = clean_location(values[1])
    state = str(values[2]).strip()
    params = values[3:]

    # Standard river tables store every parameter as (min, max) pairs in order.
    # Keep this mapping explicit to prevent index drift and column shifting.
    temperature_avg = avg(params[0], params[1]) if len(params) > 1 else None
    do_avg = avg(params[2], params[3]) if len(params) > 3 else None
    ph_avg = avg(params[4], params[5]) if len(params) > 5 else None
    conductivity_avg = avg(params[6], params[7]) if len(params) > 7 else None
    bod_avg = avg(params[8], params[9]) if len(params) > 9 else None
    nitrate_avg = avg(params[10], params[11]) if len(params) > 11 else None
    fecal_coliform_avg = avg(params[12], params[13]) if len(params) > 13 else None
    total_coliform_avg = avg(params[14], params[15]) if len(params) > 15 else None
    fecal_streptococci_avg = avg(params[16], params[17]) if len(params) > 17 else None

    row_data = {
        "stn_code": stn_code,
        "monitoring_location": location,
        "water_body_type": water_body_type,
        "state": state,
        "temperature_avg": temperature_avg,
        "do_avg": do_avg,
        "ph_avg": ph_avg,
        "conductivity_avg": conductivity_avg,
        "bod_avg": bod_avg,
        "nitrate_avg": nitrate_avg,
        "fecal_coliform_avg": fecal_coliform_avg,
        "total_coliform_avg": total_coliform_avg,
        "fecal_streptococci_avg": fecal_streptococci_avg,
    }
    return row_data


def groundwater_schema_parser(row: list, water_body_type: str) -> dict | None:
    """Parse the groundwater schema.

    Groundwater pages add extra parameters such as TDS, Fluoride, and Arsenic.
    The parser preserves the page order and maps parameter pairs sequentially so
    the later columns do not shift into the river schema positions.
    """
    values = [c for c in row if c is not None]
    if len(values) < 6:
        return None

    stn_code = str(values[0]).strip()
    location = clean_location(values[1])
    state = str(values[2]).strip()
    params = values[3:]

    row_data = {
        "stn_code": stn_code,
        "monitoring_location": location,
        "water_body_type": water_body_type,
        "state": state,
    }
    row_data.update(_pairwise_parameter_averages(params, GROUNDWATER_PARAMETER_NAMES))
    return row_data


def coastal_schema_parser(row: list, water_body_type: str) -> dict | None:
    """Parse the coastal schema, which includes an explicit water-body column."""
    values = [c for c in row if c is not None]
    if len(values) < 6:
        return None

    stn_code = str(values[0]).strip()
    location = clean_location(values[1])
    wbt = str(values[2]).strip()
    state = str(values[3]).strip()
    params = values[4:]

    row_data = {
        "stn_code": stn_code,
        "monitoring_location": location,
        "water_body_type": wbt if wbt else water_body_type,
        "state": state,
    }
    row_data.update(_pairwise_parameter_averages(params, RIVER_PARAMETER_NAMES))
    return row_data


def _row_contains_state(row: list, state_filter: str) -> bool:
    """Return True when the extracted row text contains the requested state."""
    row_text = " ".join(str(c).upper() for c in row if c)
    return state_filter.upper() in row_text


def parse_row_by_schema(schema: str, row: list, water_body_type: str) -> dict | None:
    """Dispatch a table row to the parser that matches the detected schema."""
    if schema == "coastal":
        return coastal_schema_parser(row, water_body_type)
    if schema == "groundwater":
        return groundwater_schema_parser(row, water_body_type)
    return river_schema_parser(row, water_body_type)


def _parse_valid_row(row: list, state_filter: str, schema: str, water_body_type: str) -> dict | None:
    """Return a parsed row only when it passes the shared row filters."""
    if not row or should_skip_row(row):
        return None
    if not _row_contains_state(row, state_filter):
        return None

    row_data = parse_row_by_schema(schema, row, water_body_type)
    if row_data is None:
        return None
    if not row_data["monitoring_location"]:
        return None
    if state_filter.upper() not in row_data["state"].upper():
        return None

    ph_value = row_data.get("ph_avg")
    if ph_value is not None and ph_value > 14:
        print(
            f"      Skipping invalid row {row_data.get('stn_code', 'UNKNOWN')} "
            f"({schema}): pH={ph_value}"
        )
        return None

    return row_data


def _extract_rows_from_table(table: list, state_filter: str, schema: str, water_body_type: str) -> list[dict]:
    """Parse all valid rows from a single extracted table."""
    rows_out: list[dict] = []

    for row in table:
        try:
            row_data = _parse_valid_row(row, state_filter, schema, water_body_type)
            if row_data is not None:
                rows_out.append(row_data)
        except (IndexError, TypeError, ValueError):
            # Skip malformed rows silently.
            continue

    return rows_out


# ─── Core Extractor ───────────────────────────────────────────────────────────

def extract_rows_from_page(page, state_filter: str, water_body_type: str, schema: str) -> list[dict]:
    """
    Extract data rows from a single PDF page.
    """
    tables = page.extract_tables()
    rows_out = []

    for table in tables:
        rows_out.extend(_extract_rows_from_table(table, state_filter, schema, water_body_type))

    return rows_out


def extract_from_pdf(pdf_path: str, state_filter: str, year: int) -> pd.DataFrame:
    """Extract all matching rows from a single PDF file."""
    default_water_body_type = detect_water_body_type(pdf_path)

    # Filename hints are kept only as a fallback for noisy pages.
    has_type_col = "creek_marine" in os.path.basename(pdf_path).lower()

    print(f"  Processing: {os.path.basename(pdf_path)} [{default_water_body_type}]")

    all_rows = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            if state_filter.upper() not in text.upper():
                continue  # Skip pages that don't mention the state at all

            schema = detect_schema(text, has_type_col)
            water_body_type = detect_water_body_type(pdf_path, text, schema)
            pdf_name = os.path.basename(pdf_path)
            print(f"    {pdf_name} -> detected water body: {water_body_type}")
            print(f"    Page {page_number}: Detected schema = {schema}")
            rows = extract_rows_from_page(page, state_filter, water_body_type, schema)
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