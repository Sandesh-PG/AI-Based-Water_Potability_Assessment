from __future__ import annotations

from pathlib import Path

import pandas as pd

# Global cache; data is loaded once and reused for subsequent API calls.
df: pd.DataFrame | None = None

PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Preferred path from requirement, plus fallback for current repository layout.
DATA_FILE_CANDIDATES = [
	PROJECT_ROOT / "data" / "geocoded" / "karnataka_train_2016_2022.csv",
	PROJECT_ROOT / "ml" / "data" / "geocoded" / "karnataka_train_2016_2022.csv",
]


def _resolve_data_file() -> Path:
	for candidate in DATA_FILE_CANDIDATES:
		if candidate.exists():
			return candidate

	joined = "\n".join(str(path) for path in DATA_FILE_CANDIDATES)
	raise FileNotFoundError(
		"Dataset file not found. Checked:\n"
		f"{joined}"
	)


def get_data() -> pd.DataFrame:
	"""Return cached dataframe, loading it from disk on first call."""
	global df

	if df is None:
		csv_path = _resolve_data_file()
		df = pd.read_csv(csv_path)
		print(f"[data_loader] Loaded dataset from {csv_path} (rows={len(df)})")

	return df


def append_to_cache(new_df: pd.DataFrame) -> int:
	"""Merge new_df into the running in-memory cache (no disk write).

	The added rows are visible to all API endpoints for the lifetime of this
	server process.  When the server restarts the cache is cold and only the
	original CSV is loaded — so the data is automatically discarded.

	Returns the number of rows actually appended.
	"""
	global df
	base = get_data()          # ensure the base data is loaded first
	df = pd.concat([base, new_df], ignore_index=True)
	print(f"[data_loader] In-memory append: +{len(new_df)} rows "
	      f"(total={len(df)}, ephemeral — resets on restart)")
	return len(new_df)

# coords patched: 15 stations now geocoded (2026-06-16)
