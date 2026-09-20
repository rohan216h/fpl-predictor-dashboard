"""
src/data_loading.py — Stage 1: pull historical FPL gameweek data.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
import config


def load_season_gw_data(season: str) -> pd.DataFrame:
    url = f"{config.BASE_DATA_URL}/{season}/gws/merged_gw.csv"
    df = pd.read_csv(url, encoding="utf-8", on_bad_lines="skip")
    df["season"] = season
    return df


def load_all_seasons(seasons=None) -> pd.DataFrame:
    seasons = seasons or config.HISTORICAL_SEASONS
    all_seasons = []
    for season in seasons:
        print(f"Loading {season} ...")
        try:
            df = load_season_gw_data(season)
            print(f"  -> {df.shape[0]} rows, {df.shape[1]} columns")
            all_seasons.append(df)
        except Exception as e:
            print(f"  FAILED for {season}: {e}")
    combined = pd.concat(all_seasons, ignore_index=True)
    return combined


if __name__ == "__main__":
    os.makedirs(config.RAW_DATA_DIR, exist_ok=True)
    combined = load_all_seasons()
    print("\nCombined shape:", combined.shape)
    print("Seasons included:", combined["season"].unique())
    combined.to_csv(config.RAW_MERGED_GW_PATH, index=False)
    print(f"\nSaved to {config.RAW_MERGED_GW_PATH}")
