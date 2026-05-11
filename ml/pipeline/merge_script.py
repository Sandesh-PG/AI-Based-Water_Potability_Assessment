import pandas as pd
from pathlib import Path

def merge_train_datasets():
    geo_dir = Path(__file__).resolve().parents[1] / "data" / "geocoded"

    files = sorted(geo_dir.glob("karnataka_*_geocoded.csv"))

    dfs = []

    for f in files:
        if "2023" in f.name or "2024" in f.name:
            continue

        print("Adding:", f.name)
        dfs.append(pd.read_csv(f))

    if not dfs:
        print("No files found!")
        return

    merged_df = pd.concat(dfs, ignore_index=True)

    out_file = geo_dir / "karnataka_train_2016_2022.csv"
    merged_df.to_csv(out_file, index=False)

    print("\nMerged dataset saved to:", out_file)
    print("Shape:", merged_df.shape)


if __name__ == "__main__":
    merge_train_datasets()