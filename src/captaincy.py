"""
src/captaincy.py — rank captaincy candidates from a chosen starting XI using
goal threat + next-fixture difficulty, rather than raw predicted average alone.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests
import pandas as pd
import config


def fetch_next_fixture_difficulty(gameweek):
    url = f"https://fantasy.premierleague.com/api/fixtures/?event={gameweek}"
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    fixtures = r.json()

    teams_url = "https://fantasy.premierleague.com/api/bootstrap-static/"
    teams_data = requests.get(teams_url, timeout=15).json()
    team_id_to_name = {t["id"]: t["name"] for t in teams_data["teams"]}

    difficulty_by_team = {}
    for fx in fixtures:
        home_id, away_id = fx["team_h"], fx["team_a"]
        difficulty_by_team[team_id_to_name[home_id]] = fx["team_h_difficulty"]
        difficulty_by_team[team_id_to_name[away_id]] = fx["team_a_difficulty"]
    return difficulty_by_team


def compute_captaincy_scores(squad_df, difficulty_by_team):
    df = squad_df[squad_df["role"].str.contains("Starting XI")].copy()
    df["fixture_difficulty"] = df["team"].map(difficulty_by_team)
    df["fixture_bonus"] = (3 - df["fixture_difficulty"].fillna(3)) * config.FIXTURE_BONUS_WEIGHT
    goal_threat = df["goals_scored_avg_last5"].fillna(0)
    df["captaincy_score"] = (
        df["predicted_points"] + goal_threat * config.GOAL_THREAT_WEIGHT + df["fixture_bonus"]
    )
    return df.sort_values("captaincy_score", ascending=False)


def get_captain_recommendation(squad_df, gameweek):
    difficulty_by_team = fetch_next_fixture_difficulty(gameweek)
    ranked = compute_captaincy_scores(squad_df, difficulty_by_team)
    return ranked


def apply_captaincy_to_squad(squad_df, ranked, squad_path):
    """Strip any existing (C)/(VC) tags and apply the captaincy-aware choice instead."""
    df = squad_df.copy()
    df["role"] = df["role"].str.replace(r"\s*\(C\)", "", regex=True)
    df["role"] = df["role"].str.replace(r"\s*\(VC\)", "", regex=True)

    captain_idx = ranked.index[0]
    vice_idx = ranked.index[1]
    df.loc[captain_idx, "role"] = df.loc[captain_idx, "role"] + " (C)"
    df.loc[vice_idx, "role"] = df.loc[vice_idx, "role"] + " (VC)"

    df.to_csv(squad_path, index=False)
    return df


if __name__ == "__main__":
    import sys as _sys
    if len(_sys.argv) > 1:
        gameweek = int(_sys.argv[1])
    else:
        from src.team_state import get_full_team_state
        gameweek = get_full_team_state()["current_gameweek"]

    squad_path = os.path.join(config.OUTPUTS_DIR, "squad_latest.csv")
    squad_df = pd.read_csv(squad_path)

    ranked = get_captain_recommendation(squad_df, gameweek)
    print(ranked[["web_name", "position", "team", "predicted_points",
                   "fixture_difficulty", "captaincy_score"]].to_string(index=False))

    top, second = ranked.iloc[0], ranked.iloc[1]
    print(f"\nSuggested Captain: {top['web_name']} (score {top['captaincy_score']:.2f})")
    print(f"Suggested Vice-Captain: {second['web_name']} (score {second['captaincy_score']:.2f})")

    updated_squad = apply_captaincy_to_squad(squad_df, ranked, squad_path)
    print(f"\nUpdated squad file saved with new captain/vice: {squad_path}")
