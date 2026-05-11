"""Recalculate pollution scores using the updated 0-10 scale."""
import pandas as pd
from pathlib import Path
from ml.pipeline.pollution import compute_pollution_score

# Recalculate for all individual year files
geo_dir = Path("ml/data/geocoded")

for year_file in sorted(geo_dir.glob("karnataka_*_geocoded.csv")):
    if "train" in year_file.name:
        continue
    
    print(f"Processing {year_file.name}...")
    df = pd.read_csv(year_file)
    
    # Recalculate pollution scores
    df = compute_pollution_score(df)
    
    # Save back
    df.to_csv(year_file, index=False)
    print(f"  ✓ Updated pollution scores (0-10 scale)")

# Recalculate train dataset
print("\nRecalculating train dataset...")
train_file = geo_dir / "karnataka_train_2016_2022.csv"
df_train = pd.read_csv(train_file)
df_train = compute_pollution_score(df_train)
df_train.to_csv(train_file, index=False)
print("✓ Train dataset updated")

print("\nDone! All pollution scores now use 0-10 scale.")
print("Restart the backend and refresh the frontend to see changes.")
