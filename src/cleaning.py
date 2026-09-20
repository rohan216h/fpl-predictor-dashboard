"""
src/cleaning.py — Stage 2: clean the combined FPL gameweek data.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
import config

DROP_COLS = [
    "xP",
    "mng_clean_sheets", "mng_draw", "mng_goals_scored",
    "mng_loss", "mng_underdog_draw", "mng_underdog_win", "mng_win",
    "modified",
]

POSITION_MAP = {"GK": "GKP", "GKP": "GKP", "DEF": "DEF", "MID": "MID", "FWD": "FWD"}

# 2019-20 season is dropped entirely — missing position/team columns for that season.
DROPPED_SEASONS = ["2019-20"]


def clean(df: pd.DataFrame) -> pd.DataFrame:
    for season in DROPPED_SEASONS:
        df = df[df["season"] != season].copy()

    cols_to_drop = [c for c in DROP_COLS if c in df.columns]
    df = df.drop(columns=cols_to_drop)

    df["position"] = df["position"].map(POSITION_MAP)
    df = df.dropna(subset=["position"]).copy()

    df["kickoff_time"] = pd.to_datetime(df["kickoff_time"], errors="coerce")
    df = df.sort_values(["season", "GW", "kickoff_time"]).reset_index(drop=True)

    return df


if __name__ == "__main__":
    os.makedirs(config.PROCESSED_DATA_DIR, exist_ok=True)
    df = pd.read_csv(config.RAW_MERGED_GW_PATH, low_memory=False)
    print("Loaded:", df.shape)

    cleaned = clean(df)
    print("After cleaning:", cleaned.shape)

    # Duplicate check (double-gameweek verification)
    dup_mask = cleaned.duplicated(subset=["element", "season", "GW"], keep=False)
    dup_rows = cleaned[dup_mask]
    if dup_mask.sum() > 0:
        check = dup_rows.groupby(["element", "season", "GW"])["fixture"].nunique()
        print(f"Duplicate groups with SAME fixture (data errors): {(check == 1).sum()}")
        print(f"Duplicate groups with DIFFERENT fixtures (real DGWs): {(check > 1).sum()}")

    missing_pct = (cleaned.isna().mean() * 100).round(1).sort_values(ascending=False)
    print("\nMissing value % per column (only columns with any missing):")
    print(missing_pct[missing_pct > 0])

    cleaned.to_csv(config.CLEANED_PATH, index=False)
    print(f"\nSaved to {config.CLEANED_PATH}, shape {cleaned.shape}")
