"""Generate per-state deduplicated manifests of monitoring locations.

Writes CSV files to `ml/pipeline/manifests/<state>_unique_locations.csv`
with columns: `stn_code`, `monitoring_location`.
Also writes `ml/pipeline/manifests_summary.json` with counts.
"""
import json
from pathlib import Path
import pandas as pd


def state_from_stem(stem: str) -> str:
    # stem example: 'karnataka_2022_clean' -> state part 'karnataka'
    parts = stem.split("_")
    if parts[-1] == 'clean':
        parts = parts[:-1]
    if parts and parts[-1].isdigit():
        parts = parts[:-1]
    return "_".join(parts)


def main():
    processed = Path("ml/data/processed")
    out_dir = Path("ml/pipeline/manifests")
    out_dir.mkdir(parents=True, exist_ok=True)

    state_map = {}

    for f in sorted(processed.glob("*_clean.csv")):
        stem = f.stem
        state_key = state_from_stem(stem)
        if not state_key:
            continue
        df = pd.read_csv(f)
        cols = df.columns
        # prefer `stn_code` if present
        stn_col = 'stn_code' if 'stn_code' in cols else None
        loc_col = 'monitoring_location' if 'monitoring_location' in cols else None
        if loc_col is None:
            continue

        entries = []
        for _, r in df.iterrows():
            loc = str(r[loc_col]).strip()
            stn = str(r[stn_col]).strip() if stn_col else ''
            if not loc or loc.lower() in ('nan', 'none'):
                continue
            entries.append((loc, stn))

        if state_key not in state_map:
            state_map[state_key] = {}

        d = state_map[state_key]
        for loc, stn in entries:
            key = loc.strip().lower()
            if key not in d:
                d[key] = {'monitoring_location': loc, 'stn_code': stn}

    summary = {}
    total = 0
    for state, d in state_map.items():
        rows = list(d.values())
        total += len(rows)
        out_file = out_dir / f"{state}_unique_locations.csv"
        pd.DataFrame(rows).to_csv(out_file, index=False)
        summary[state] = len(rows)

    summary_path = out_dir / 'manifests_summary.json'
    summary_data = {'per_state_counts': summary, 'total_unique': total}
    summary_path.write_text(json.dumps(summary_data, indent=2))
    print(f"Wrote {len(summary)} manifests, total unique locations: {total}")


if __name__ == '__main__':
    main()
