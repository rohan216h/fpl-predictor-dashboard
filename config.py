"""
Central configuration for the FPL prediction & squad optimization project.
All paths, budgets, thresholds, and tunable weights live here so nothing is
hardcoded inside the pipeline scripts.
"""

import os

# --- Paths ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DATA_DIR = os.path.join(BASE_DIR, "data", "raw")
PROCESSED_DATA_DIR = os.path.join(BASE_DIR, "data", "processed")
OUTPUTS_DIR = os.path.join(BASE_DIR, "data", "outputs")

RAW_MERGED_GW_PATH = os.path.join(RAW_DATA_DIR, "raw_merged_gw.csv")
CLEANED_PATH = os.path.join(PROCESSED_DATA_DIR, "cleaned_merged_gw.csv")
FEATURES_PATH = os.path.join(PROCESSED_DATA_DIR, "features.csv")

# --- Seasons ---
# Update this list each summer once a new season's data becomes available in
# the vaastav/Fantasy-Premier-League repo.
HISTORICAL_SEASONS = ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
BASE_DATA_URL = "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data"

# --- FPL account ---
FPL_ENTRY_ID = 8313728  # Rohan's team ID

# --- Squad rules ---
SQUAD_POS_LIMITS = {"GKP": 2, "DEF": 5, "MID": 5, "FWD": 3}
STARTING_LIMITS = {"GKP": (1, 1), "DEF": (3, 5), "MID": (2, 5), "FWD": (1, 3)}
MAX_PER_TEAM = 3

# --- Feature engineering ---
ROLLING_WINDOWS = [3, 5]
SUM_STATS = [
    "total_points", "minutes", "goals_scored", "assists", "bps",
    "ict_index", "bonus", "clean_sheets", "goals_conceded",
    "yellow_cards", "red_cards", "saves",
    "defensive_contribution", "tackles", "recoveries", "clearances_blocks_interceptions",
]
ROLLING_STATS = [
    "total_points", "minutes", "goals_scored", "assists", "bps", "ict_index", "bonus",
    "defensive_contribution", "clean_sheets",
]
FEATURE_COLS = [
    "total_points_avg_last3", "total_points_avg_last5",
    "minutes_avg_last3", "minutes_avg_last5",
    "goals_scored_avg_last3", "goals_scored_avg_last5",
    "assists_avg_last3", "assists_avg_last5",
    "bps_avg_last3", "bps_avg_last5",
    "ict_index_avg_last3", "ict_index_avg_last5",
    "bonus_avg_last3", "bonus_avg_last5",
    "defensive_contribution_avg_last3", "defensive_contribution_avg_last5",
    "clean_sheets_avg_last3", "clean_sheets_avg_last5",
    "team_clean_sheet_rate_last5",
    "points_season_avg_so_far",
    "fixture_1_difficulty",
    "num_fixtures_this_gw",
    "value",
    "price_change_since_start",
    "price_change_last_gw",
]
TARGET_COL = "total_points"

# --- Live prediction (squad-building) settings ---
# When predicting for SQUAD CONSTRUCTION (wildcard/initial pick — a long-term
# commitment), we deliberately do NOT use the player's actual next-fixture
# difficulty. Optimizing squad choice around one upcoming match risks picking
# players for a lucky single fixture rather than genuine season-long quality.
# Real per-gameweek fixture data is reserved for short-term decisions instead:
# captaincy (src/captaincy.py) and chip timing (src/chip_strategy.py — Free
# Hit / Bench Boost / double-gameweek awareness).
# These neutral values approximate a "typical" gameweek for that purpose.
NEUTRAL_FIXTURE_DIFFICULTY = 3  # middle of the 1-5 scale
NEUTRAL_NUM_FIXTURES = 1        # a normal (non-DGW, non-blank) gameweek

# --- Season recency weighting ---
# Without this, a 2020-21 gameweek and a 2025-26 gameweek count identically
# when the model learns its patterns. This applies exponential decay so more
# recent seasons carry more weight — sensible in general, and especially
# important now that 2025-26 introduced the new defensive-contribution
# scoring rule that didn't exist in earlier seasons.
SEASON_RECENCY_DECAY = 0.75  # each season further back is weighted this much less

# --- Model / backtest ---
BACKTEST_TEST_SEASON = "2024-25"
RF_PARAMS = {"n_estimators": 200, "max_depth": 10, "random_state": 42, "n_jobs": -1}
XGB_PARAMS = {"n_estimators": 200, "max_depth": 6, "learning_rate": 0.05, "random_state": 42, "n_jobs": -1}
RIDGE_PARAMS = {"alpha": 1.0}

# --- Squad building / blending ---
MIN_AVG_MINUTES = 20            # below this per-game average -> rotation risk (current/baseline)
MIN_AVG_MINUTES_STRICT = 60     # stricter alternative threshold — kept for diagnostics reference only

# TESTED AND REJECTED (not used by default): rewarding squad-wide reliability
# and/or predicted points in the optimizer objective, to get a stronger bench.
# Validated via src/diagnostics.py's run_bench_weight_optimization() across 3
# historical seasons (2022-23, 2023-24, 2024-25) using REALIZED points, not
# predicted. Result: 2 of 3 seasons favored NO bonus at all; the aggregated
# "best" combo (reliability=1.0, points=0) beat doing nothing by only ~0.16%
# — within noise given the ~3.4% spread across the whole grid. Not a robust
# improvement, so left disabled. Kept here (and in optimizer.py's function
# signature) for reference/re-testing, not applied in normal squad builds.
BENCH_RELIABILITY_WEIGHT = 0.5
BENCH_POINTS_WEIGHT = 0.3

# Shrinkage-style blending for live squad-building: weight_current = n / (n + k)
# where n = minutes-weighted effective games played this season (total
# minutes / 90). Empirically validated via leakage-safe walk-forward testing
# across all historical season transitions (src/diagnostics.py's shrinkage
# test) — k=0.1 beat the old games/5 formula (MAE 1.2511 vs 1.2603), and the
# improvement was robust across a range of small k values, not a fluke.
# Unlike the old formula, this never fully discards last season's data, even
# once a player has played many games.
SHRINKAGE_K = 0.1

# Actual current squad value/budget for live squad-building — update this
# each time the real team value changes (check the FPL site or team_state.py).
CURRENT_BUDGET = 99.5

# --- Captaincy ---
GOAL_THREAT_WEIGHT = 1.5
FIXTURE_BONUS_WEIGHT = 0.4

# --- Transfer engine (Phase 4) ---
TRANSFER_FIXTURE_WEIGHT = 0.2   # light nudge for a good immediate fixture on top of
                                 # fixture-neutral long-term quality (much lighter than
                                 # captaincy's weight, since this isn't a one-week decision)
TRANSFER_GOAL_THREAT_WEIGHT = 0.75  # same ratio to TRANSFER_FIXTURE_WEIGHT as captaincy.py's
                                     # GOAL_THREAT_WEIGHT (1.5) is to FIXTURE_BONUS_WEIGHT (0.4)
TRANSFER_HIT_COST = 4            # points lost per transfer beyond your free ones
MAX_TRANSFERS_CONSIDERED = 5     # cap on how many transfers the engine will evaluate at once
MIN_GAIN_TO_ACT = 1.0            # minimum total predicted-point gain required to recommend
                                  # ANY transfers at all, even free ones — banked transfers
                                  # have real option value (flexibility, emergencies) beyond
                                  # their raw point cost, so a marginal gain isn't automatically
                                  # worth spending them on

# --- Chip strategy (Phase 5) ---
# Calibrated via `python -m src.chip_strategy calibrate` on 2024-25 backtest.
# Stores every gameweek's best predicted-scorer score, so get_dynamic_threshold()
# can compute ANY percentile at decision time (needed because the required bar
# changes depending on how far into the season-half we are — see chip_strategy.py).
# PLACEHOLDER — rerun calibrate and paste the printed list here.
HISTORICAL_BEST_CAPTAIN_SCORES = [8.09, 9.75, 9.73, 15.01, 14.97, 12.77, 10.68, 8.53, 6.81, 7.63, 7.65, 7.79, 8.11, 8.66, 6.76, 8.59, 9.02, 7.33, 7.89, 9.63, 9.29, 8.79, 7.49, 8.94, 19.65, 7.28, 9.65, 9.0, 6.23, 10.99, 8.08, 9.9, 10.24, 5.5, 5.92, 6.82, 5.91, 6.06]
