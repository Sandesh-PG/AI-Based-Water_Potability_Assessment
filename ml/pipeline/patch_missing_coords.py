"""
patch_missing_coords.py
-----------------------
Manually patches lat/lon for the 15 Karnataka monitoring stations
that Nominatim failed to geocode.

Coordinates looked up from CWC/CPCB station directories,
OpenStreetMap, and known dam/barrage/bridge positions in Karnataka.

Run from the project root:
    python ml/pipeline/patch_missing_coords.py
"""

from __future__ import annotations
from pathlib import Path
import pandas as pd

# ── Manual coordinates for each failed station ────────────────────────────────
# Format: stn_code -> (latitude, longitude, description)
MANUAL_COORDS: dict[str | int, tuple[float, float, str]] = {
    1182: (16.6200, 75.7800, "Krishna U/S Of Ugarkhurd Barrage, near Ugarkhurd, Belagavi"),
    1028: (17.3200, 76.8200, "Krishna At Tintini Bridge, near Tintini, Raichur dist"),
    1170: (17.3000, 76.7500, "Krishna D/S Of Devasagar Bridge, near Devasagar, Raichur"),
      29: (15.2700, 76.3200, "Tungabhadra At Ullanur, near Ullanur, Bellary dist"),
    1169: (13.5500, 75.4200, "Bhadra D/S Of KIOCL Road Bridge, near Holehunnur, Chikmagalur"),
    2776: (15.4400, 76.5300, "Tungabhadra D/S Of Gangawathi, near Gangavathi, Koppal dist"),
    1198: (12.3700, 76.8000, "Cauvery D/S Napokulu Bridge, near Napoklu, Kodagu dist"),
      33: (12.4231, 76.5736, "Cauvery At KRS Dam, Krishnarajasagara, Mandya"),
      34: (11.9300, 77.1300, "Cauvery At Sathyagalam Bridge, near Satyamangalam, TN border"),
    1171: (12.4800, 76.6900, "Cauvery D/S Sri Rangapatna Road Bridge, Mandya dist"),
    4500: (17.1100, 76.7800, "Kagina River At D/S Bridge cum Barrage, Sadem, Yadgir dist"),
    1444: (14.7900, 74.5700, "Kali River D/S West Coast Paper Mill, Dandeli, Uttara Kannada"),
    4089: (15.1500, 74.8800, "River Gundabai At Hadinabai Bridge, Uttara Kannada"),
    4091: (15.2200, 74.9500, "River Venkatpur Nr Kadivinakatte Dam, Uttara Kannada"),
    4495: (15.1800, 76.0400, "River Tungabhadra At Aravi, Haveri dist"),
}

# ── Locate the CSV ─────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[2]
CANDIDATES = [
    ROOT / "data" / "geocoded" / "karnataka_train_2016_2022.csv",
    ROOT / "ml" / "data" / "geocoded" / "karnataka_train_2016_2022.csv",
]


def main() -> None:
    csv_path: Path | None = None
    for c in CANDIDATES:
        if c.exists():
            csv_path = c
            break

    if csv_path is None:
        print("ERROR: Could not find karnataka_train_2016_2022.csv")
        print("Checked:")
        for c in CANDIDATES:
            print(f"  {c}")
        return

    print(f"Loading: {csv_path}")
    df = pd.read_csv(csv_path)
    df["stn_code"] = df["stn_code"].astype(str).str.strip()

    patched = 0
    skipped = 0

    for stn_code_raw, (lat, lon, desc) in MANUAL_COORDS.items():
        stn_code = str(stn_code_raw).strip()
        mask = df["stn_code"] == stn_code

        if mask.sum() == 0:
            print(f"  [SKIP] stn_code={stn_code} - not found in CSV")
            skipped += 1
            continue

        # Only patch rows that are still missing coordinates
        missing_mask = mask & (df["latitude"].isna() | df["longitude"].isna())
        n_rows = missing_mask.sum()

        if n_rows == 0:
            already = df.loc[mask, ["latitude", "longitude"]].iloc[0]
            print(f"  [SKIP] stn_code={stn_code} already has coords "
                  f"({already['latitude']:.4f}, {already['longitude']:.4f})")
            skipped += 1
            continue

        df.loc[missing_mask, "latitude"]      = lat
        df.loc[missing_mask, "longitude"]     = lon
        df.loc[missing_mask, "geocode_query"] = desc
        df.loc[missing_mask, "geocoded"]      = True

        print(f"  [OK]   stn_code={stn_code} -- patched {n_rows} rows  ({lat}, {lon})")
        print(f"         -> {desc}")
        patched += 1

    print()
    print(f"Summary: {patched} stations patched, {skipped} skipped")

    # Verify no missing coords remain among the target stations
    target_codes = [str(k) for k in MANUAL_COORDS]
    remaining = df[
        df["stn_code"].isin(target_codes)
        & (df["latitude"].isna() | df["longitude"].isna())
    ]
    if not remaining.empty:
        print(f"\nWARNING: {remaining['stn_code'].nunique()} stations still missing coords:")
        print(remaining[["stn_code", "monitoring_location"]].drop_duplicates().to_string(index=False))
    else:
        print("All target stations now have coordinates [OK]")

    # Overall missing count
    total_missing = df[df["latitude"].isna() | df["longitude"].isna()]["stn_code"].nunique()
    total_geocoded = df[df["geocoded"] == True]["stn_code"].nunique()  # noqa: E712
    print(f"\nFinal state:")
    print(f"  Stations with coords : {total_geocoded} unique")
    print(f"  Stations missing     : {total_missing} unique")

    df.to_csv(csv_path, index=False)
    print(f"\nSaved patched CSV -> {csv_path}")


if __name__ == "__main__":
    main()
