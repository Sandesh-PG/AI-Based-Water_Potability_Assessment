"""
geocode.py
----------
Converts monitoring location names to lat/long coordinates using Nominatim
(OpenStreetMap) — free, no API key required.

What this script does:
  1. Reads the cleaned CSV (output of clean.py)
  2. For each row, tries to geocode the monitoring_location
  3. Falls back to simpler location strings if full name fails
  4. Saves CSV with lat/lng columns added
  5. Generates a summary of geocoding success/failure

Usage:
    python geocode.py --input data/processed/karnataka_2023_clean.csv
                      --output data/geocoded/karnataka_2023_geocoded.csv
                      --state Karnataka

NOTE:
    Nominatim has a 1 request/second rate limit.
    For 129 rows this will take ~3-4 minutes. Don't interrupt it.
    Results are cached so re-runs are instant.
"""

import re
import time
import json
import argparse
import pandas as pd
from pathlib import Path
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from tqdm import tqdm

# ─── Config ───────────────────────────────────────────────────────────────────

CACHE_FILE    = "data/geocoded/geocode_cache.json"
REQUEST_DELAY = 1.1   # seconds between requests (Nominatim limit = 1/sec)
MAX_RETRIES   = 3
TIMEOUT       = 10


# ─── Location String Cleaner ──────────────────────────────────────────────────

def clean_for_geocoding(location: str, state: str) -> list:
    """
    Generate a list of progressively simpler search strings to try.
    Returns a list — geocoder will try each until one succeeds.
    """
    location = str(location).strip()

    # Remove common prefixes that confuse geocoders
    simplified = location.lower()
    simplified = re.sub(
        r"^(river|r\.|rsvr|reservoir|lake|canal|drain|nallah|nala|creek)\s+",
        "", simplified, flags=re.IGNORECASE
    )

    # Remove positional/directional qualifiers
    simplified = re.sub(
        r"\b(u/s|d/s|upstream|downstream|near|at|of|before|after|"
        r"confluence|bridge|barrage|dam|intake|point|jackwell|"
        r"water supply|water works|pumping station|road|highway|"
        r"national highway|nh-?\d+|sh-?\d+|bdg\.?|brdg\.?)\b",
        "", simplified, flags=re.IGNORECASE
    )

    simplified = re.sub(r"[,\-\(\)]+", " ", simplified)
    simplified = re.sub(r"\s+", " ", simplified).strip()

    attempts = []

    if simplified:
        attempts.append(f"{simplified}, {state}, India")

    attempts.append(f"{location}, {state}, India")

    words = [w for w in simplified.split() if len(w) > 3]
    if words:
        attempts.append(f"{words[-1]}, {state}, India")
        if len(words) >= 2:
            attempts.append(f"{words[-2]} {words[-1]}, {state}, India")

    # Deduplicate
    seen, unique = set(), []
    for a in attempts:
        if a not in seen:
            seen.add(a)
            unique.append(a)

    return unique


# ─── Geocoder ─────────────────────────────────────────────────────────────────

def load_cache(cache_file: str) -> dict:
    if Path(cache_file).exists():
        with open(cache_file, "r") as f:
            return json.load(f)
    return {}


def save_cache(cache: dict, cache_file: str):
    Path(cache_file).parent.mkdir(parents=True, exist_ok=True)
    with open(cache_file, "w") as f:
        json.dump(cache, f, indent=2)


def geocode_location(geolocator, location: str, state: str, cache: dict) -> tuple:
    """
    Geocode a single location. Returns (lat, lng, matched_query, success).
    Uses cache to avoid repeat API calls.
    """
    cache_key = f"{location}|{state}"
    if cache_key in cache:
        cached = cache[cache_key]
        return cached["lat"], cached["lng"], cached["query"], cached["success"]

    attempts = clean_for_geocoding(location, state)

    for query in attempts:
        for attempt in range(MAX_RETRIES):
            try:
                time.sleep(REQUEST_DELAY)
                result = geolocator.geocode(query, timeout=TIMEOUT)
                if result:
                    lat, lng = result.latitude, result.longitude
                    cache[cache_key] = {
                        "lat": lat, "lng": lng,
                        "query": query, "success": True
                    }
                    save_cache(cache, CACHE_FILE)
                    return lat, lng, query, True
                break
            except GeocoderTimedOut:
                if attempt < MAX_RETRIES - 1:
                    time.sleep(2)
                    continue
            except GeocoderServiceError:
                time.sleep(3)
                continue

    # All attempts failed
    cache[cache_key] = {
        "lat": None, "lng": None,
        "query": attempts[0] if attempts else "", "success": False
    }
    save_cache(cache, CACHE_FILE)
    return None, None, "", False


# ─── Main ─────────────────────────────────────────────────────────────────────

def run_geocoding(input_path: str, output_path: str, state: str):
    df = pd.read_csv(input_path)
    print(f"\n{'='*60}")
    print(f"Geocoding {len(df)} locations for {state}")
    print(f"Estimated time: ~{len(df) * REQUEST_DELAY / 60:.1f} minutes")
    print(f"Results are cached — re-runs will be instant")
    print(f"{'='*60}\n")

    cache = load_cache(CACHE_FILE)
    cached_count = sum(
        1 for row in df.itertuples()
        if f"{row.monitoring_location}|{state}" in cache
    )
    if cached_count > 0:
        print(f"Found {cached_count} cached results — skipping API calls for those\n")

    geolocator = Nominatim(user_agent="water_quality_monitor_nwmp")

    lats, lngs, queries, successes = [], [], [], []

    for _, row in tqdm(df.iterrows(), total=len(df), desc="Geocoding"):
        lat, lng, query, success = geocode_location(
            geolocator, row["monitoring_location"], state, cache
        )
        lats.append(lat)
        lngs.append(lng)
        queries.append(query)
        successes.append(success)

    df["latitude"]      = lats
    df["longitude"]     = lngs
    df["geocode_query"] = queries
    df["geocoded"]      = successes

    # Summary
    success_count = sum(successes)
    fail_count    = len(successes) - success_count

    print(f"\n{'='*60}")
    print(f"Geocoding complete")
    print(f"  Success : {success_count}/{len(df)} ({success_count/len(df)*100:.1f}%)")
    print(f"  Failed  : {fail_count}")
    print(f"{'='*60}")

    if fail_count > 0:
        print(f"\nFailed locations (manually add coordinates if needed):")
        failed = df[~df["geocoded"]][["stn_code", "monitoring_location"]]
        for _, r in failed.iterrows():
            print(f"  [{r['stn_code']}] {r['monitoring_location'][:65]}")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"\nSaved to: {output_path}")

    return df


# ─── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Geocode water quality monitoring locations")
    parser.add_argument("--input",  type=str,
                        default="data/processed/karnataka_2023_clean.csv",
                        help="Input cleaned CSV")
    parser.add_argument("--output", type=str,
                        default="data/geocoded/karnataka_2023_geocoded.csv",
                        help="Output geocoded CSV path")
    parser.add_argument("--state",  type=str,
                        default="Karnataka",
                        help="State name for geocoding context")
    args = parser.parse_args()
    run_geocoding(args.input, args.output, args.state)