"""
src/chip_strategy.py — Phase 5: chip-usage recommendations.

Triple Captain logic:
The chip adds ONE EXTRA multiplier on top of the normal captain doubling
(2x -> 3x), so its benefit equals one additional copy of your captain's
points that gameweek. It's a limited resource (once per season half), so it
should only be used when this week's best captain candidate is a genuine
outlier — not just the best of a normal week.

Threshold is grounded in real data: we look at the actual distribution of
the top predicted-scorer's points across every gameweek of a full historical
season, and set the bar at a high percentile (top ~15% of weeks) rather than
guessing a number.

Free Hit / Bench Boost / Wildcard logic: NOT YET BUILT (planned next).
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
import numpy as np
import config


def compute_triple_captain_threshold(percentile=85, test_season=None):
    """
    Looks at the best CAPTAINCY-ADJUSTED score (goal threat + real fixture
    difficulty — same formula as captaincy.py, not just raw predicted_points)
    each gameweek across a full historical season, and returns the score at
    the given percentile.
    """
    from src.model import load_data_with_order, walk_forward_backtest
    from sklearn.ensemble import RandomForestRegressor

    test_season = test_season or config.BACKTEST_TEST_SEASON
    df = load_data_with_order()
    results, mae, rmse = walk_forward_backtest(
        df, RandomForestRegressor, config.RF_PARAMS, "RF", test_season=test_season
    )

    # Pull the historical context needed for the same goal-threat + fixture
    # formula used live (captaincy.py's compute_captaincy_scores)
    context = df[df["season"] == test_season][
        ["element", "GW", "fixture_1_difficulty", "goals_scored_avg_last5"]
    ]
    merged = results.merge(context, on=["element", "GW"], how="left")

    fixture_bonus = (3 - merged["fixture_1_difficulty"].fillna(3)) * config.FIXTURE_BONUS_WEIGHT
    goal_threat = merged["goals_scored_avg_last5"].fillna(0) * config.GOAL_THREAT_WEIGHT
    merged["captaincy_score"] = merged["predicted_points"] + goal_threat + fixture_bonus

    best_per_gw = merged.groupby("GW")["captaincy_score"].max()
    threshold = np.percentile(best_per_gw, percentile)
    print(f"Best CAPTAINCY-ADJUSTED scores across {test_season} (GW1-38): "
          f"min={best_per_gw.min():.2f}, median={best_per_gw.median():.2f}, "
          f"max={best_per_gw.max():.2f}")
    print(f"{percentile}th percentile threshold: {threshold:.2f}")
    print(f"\nFull per-GW best-scores list (paste into config.HISTORICAL_BEST_CAPTAIN_SCORES):")
    print([round(v, 2) for v in best_per_gw.tolist()])
    return threshold


def get_dynamic_threshold(gameweek, half_length=19):
    """
    Since Triple Captain is a ONE-SHOT decision per season half, firing on
    the first week that merely clears a fixed bar risks missing a much
    better week later in the same half. This applies a classic
    optimal-stopping-style dynamic threshold: demand a very high percentile
    (95th — save it for something special) early in the half, gradually
    loosening to a lower percentile (60th — don't let it go to waste) by the
    last week of the half.
    """
    gw_in_half = ((gameweek - 1) % half_length) + 1  # 1..19 within whichever half
    progress = (gw_in_half - 1) / (half_length - 1)  # 0.0 at week 1, 1.0 at last week
    percentile_needed = 95 - (95 - 60) * progress
    return np.percentile(config.HISTORICAL_BEST_CAPTAIN_SCORES, percentile_needed)


def recommend_triple_captain(squad_df, gameweek, threshold=None):
    """
    squad_df: your squad with a 'predicted_points' column (e.g. from
    optimizer's saved squad_latest.csv). Compares against the same
    captaincy_score used to RANK candidates (goal threat + real fixture
    difficulty) — not raw predicted_points — for consistency with how the
    historical threshold itself was calibrated.
    """
    from src.captaincy import get_captain_recommendation

    threshold = threshold if threshold is not None else get_dynamic_threshold(gameweek)
    ranked = get_captain_recommendation(squad_df, gameweek)
    top = ranked.iloc[0]

    recommend = top["captaincy_score"] >= threshold
    return {
        "recommend": recommend,
        "candidate": top["web_name"],
        "predicted_points": top["predicted_points"],
        "captaincy_score": top["captaincy_score"],
        "threshold": threshold,
    }


if __name__ == "__main__":
    import sys as _sys
    if "calibrate" in _sys.argv:
        threshold = compute_triple_captain_threshold()
        print(f"\nSet config.TRIPLE_CAPTAIN_THRESHOLD = {threshold:.2f}")
    else:
        gw_arg = next((a for a in _sys.argv[1:] if a.isdigit()), None)
        if gw_arg:
            gameweek = int(gw_arg)
        else:
            from src.team_state import get_full_team_state
            gameweek = get_full_team_state()["current_gameweek"]

        squad_path = os.path.join(config.OUTPUTS_DIR, "squad_latest.csv")
        squad_df = pd.read_csv(squad_path)

        result = recommend_triple_captain(squad_df, gameweek)
        gw_in_half = ((gameweek - 1) % 19) + 1
        half_label = "first" if gameweek <= 19 else "second"
        print(f"Gameweek: {gameweek} (week {gw_in_half} of 19 in the {half_label} half)")
        print(f"Top candidate: {result['candidate']} "
              f"(predicted points: {result['predicted_points']:.2f}, "
              f"captaincy score (goal threat + fixture): {result['captaincy_score']:.2f})")
        print(f"Dynamic threshold for this point in the half: {result['threshold']:.2f}")
        if result["recommend"]:
            print(f"\nRECOMMENDATION: Use Triple Captain on {result['candidate']} this week.")
        else:
            print(f"\nRECOMMENDATION: Save Triple Captain — this week's best pick isn't an outlier.")
