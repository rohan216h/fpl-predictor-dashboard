"""
src/feature_engineering.py — Stage 3: fixture difficulty, DGW-safe gameweek
aggregation, and leakage-verified rolling form features.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
import config

CARRY_FIRST_COLS = ["name", "position", "team", "value", "selected", "season"]


def load_fixtures(seasons=None):
    seasons = seasons or config.HISTORICAL_SEASONS
    all_fx = []
    for season in seasons:
        url = f"{config.BASE_DATA_URL}/{season}/fixtures.csv"
        fx = pd.read_csv(url)
        fx["season"] = season
        all_fx.append(fx)
    fixtures = pd.concat(all_fx, ignore_index=True)
    keep_cols = ["id", "season", "team_h_difficulty", "team_a_difficulty"]
    fixtures = fixtures[keep_cols].rename(columns={"id": "fixture"})
    return fixtures


def merge_fixture_difficulty(df, fixtures):
    df = df.merge(fixtures, on=["fixture", "season"], how="left")
    df["fixture_difficulty"] = df["team_a_difficulty"].where(
        df["was_home"] == True, df["team_h_difficulty"]
    )
    df = df.drop(columns=["team_h_difficulty", "team_a_difficulty"])
    return df


def aggregate_to_gameweek_level(df):
    """Collapse multiple fixture-rows (double gameweeks) into one row per player-GW."""
    df = df.sort_values(["element", "season", "GW", "kickoff_time"]).reset_index(drop=True)
    df["fixture_rank"] = df.groupby(["element", "season", "GW"]).cumcount() + 1

    difficulty_wide = df.pivot_table(
        index=["element", "season", "GW"], columns="fixture_rank",
        values="fixture_difficulty", aggfunc="first",
    )
    difficulty_wide.columns = [f"fixture_{int(c)}_difficulty" for c in difficulty_wide.columns]
    difficulty_wide = difficulty_wide.reset_index()

    sum_cols = [c for c in config.SUM_STATS if c in df.columns]
    summed = df.groupby(["element", "season", "GW"], as_index=False)[sum_cols].sum()

    carry_cols = [c for c in CARRY_FIRST_COLS if c in df.columns and c != "season"]
    carried = df.groupby(["element", "season", "GW"], as_index=False)[carry_cols].first()

    counts = df.groupby(["element", "season", "GW"], as_index=False).size()
    counts = counts.rename(columns={"size": "num_fixtures_this_gw"})

    kickoff = df.groupby(["element", "season", "GW"], as_index=False)["kickoff_time"].min()

    gw_df = summed.merge(carried, on=["element", "season", "GW"])
    gw_df = gw_df.merge(counts, on=["element", "season", "GW"])
    gw_df = gw_df.merge(kickoff, on=["element", "season", "GW"])
    gw_df = gw_df.merge(difficulty_wide, on=["element", "season", "GW"], how="left")

    if "fixture_2_difficulty" not in gw_df.columns:
        gw_df["fixture_2_difficulty"] = pd.NA

    gw_df = gw_df.sort_values(["element", "season", "GW", "kickoff_time"]).reset_index(drop=True)

    # Price change features: how has this player's price moved so far —
    # both since the season started (sustained momentum) and since last
    # gameweek (immediate momentum). Both use only already-known prices,
    # no leakage risk.
    gw_df["price_change_since_start"] = gw_df["value"] - gw_df.groupby(
        ["element", "season"]
    )["value"].transform("first")
    gw_df["price_change_last_gw"] = gw_df.groupby(
        ["element", "season"]
    )["value"].diff().fillna(0)

    return gw_df


def add_rolling_features(df):
    df = df.sort_values(["element", "season", "GW", "kickoff_time"]).reset_index(drop=True)
    # Grouped by element AND season so form resets at each season boundary
    group = df.groupby(["element", "season"], group_keys=False)

    for stat in config.ROLLING_STATS:
        for window in config.ROLLING_WINDOWS:
            col_name = f"{stat}_avg_last{window}"
            df[col_name] = group[stat].transform(
                lambda s: s.shift(1).rolling(window, min_periods=1).mean()
            )

    df["points_season_avg_so_far"] = df.groupby(["element", "season"], group_keys=False)[
        "total_points"
    ].transform(lambda s: s.shift(1).expanding(min_periods=1).mean())

    return df


def leakage_check(df, n_samples=200, tolerance=1e-6):
    """Independent recomputation check — raises AssertionError on any mismatch."""
    checkable = df.dropna(subset=["total_points_avg_last3"])
    variance_by_player = df.groupby("element")["total_points"].var()
    high_variance_players = variance_by_player[variance_by_player > 0].index
    sample_pool = checkable[checkable["element"].isin(high_variance_players)]
    sample = sample_pool.sample(n=min(n_samples, len(sample_pool)), random_state=42)

    mismatches = []
    for _, row in sample.iterrows():
        player_id, season, gw = row["element"], row["season"], row["GW"]
        pipeline_value = row["total_points_avg_last3"]
        history = df[
            (df["element"] == player_id) & (df["season"] == season) & (df["GW"] < gw)
        ].sort_values("GW")
        manual_value = history["total_points"].tail(3).mean()
        if abs(pipeline_value - manual_value) > tolerance:
            mismatches.append({"element": player_id, "season": season, "GW": gw})

    if mismatches:
        raise AssertionError(f"Leakage check failed on {len(mismatches)}/{len(sample)} rows.")
    print(f"Leakage check PASSED: {len(sample)}/{len(sample)} rows verified.")


def add_team_clean_sheet_rate(df):
    """
    Team-level defensive strength signal: rolling clean-sheet rate for the
    player's TEAM, not just their own individual stat. Uses DEF/GKP rows as
    the most reliable full-match indicator of the team's actual defensive
    result, then applies it to every player on that team (all positions).
    Shift-based, no leakage.
    """
    def_gkp = df[df["position"].isin(["DEF", "GKP"])]
    team_cs = def_gkp.groupby(["team", "season", "GW"], as_index=False)["clean_sheets"].max()
    team_cs = team_cs.sort_values(["team", "season", "GW"])
    team_cs["team_clean_sheet_rate_last5"] = team_cs.groupby(["team", "season"])["clean_sheets"].transform(
        lambda s: s.shift(1).rolling(5, min_periods=1).mean()
    )
    df = df.merge(
        team_cs[["team", "season", "GW", "team_clean_sheet_rate_last5"]],
        on=["team", "season", "GW"], how="left",
    )
    df["team_clean_sheet_rate_last5"] = df["team_clean_sheet_rate_last5"].fillna(0)
    return df


def build_features(cleaned_df):
    fixtures = load_fixtures()
    df = merge_fixture_difficulty(cleaned_df, fixtures)
    gw_df = aggregate_to_gameweek_level(df)
    gw_df = add_rolling_features(gw_df)
    gw_df = add_team_clean_sheet_rate(gw_df)
    leakage_check(gw_df)
    return gw_df


if __name__ == "__main__":
    df = pd.read_csv(config.CLEANED_PATH, low_memory=False)
    print("Loaded cleaned data:", df.shape)

    features = build_features(df)
    print("Final feature set:", features.shape)

    features.to_csv(config.FEATURES_PATH, index=False)
    print(f"Saved to {config.FEATURES_PATH}")
