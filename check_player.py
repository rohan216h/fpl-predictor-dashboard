"""
One-off check: why is a specific player missing/present/odd in the squad?
Prints their raw predicted_points, rotation_risk, zero_games_flag, status,
and their FULL NAME vs whatever historical name got matched via fallback —
this catches name-collision bugs in the past-season fallback join.
"""

import sys
sys.path.append(".")

from src.predict import get_predictions_for_all_players, fetch_live_players, get_past_season_fallback

PLAYER_NAME = sys.argv[1] if len(sys.argv) > 1 else "Haaland"

predictions = get_predictions_for_all_players(verbose=False)
row = predictions[predictions["web_name"].str.contains(PLAYER_NAME, case=False, na=False)]

cols = ["web_name", "full_name", "position", "team", "price", "predicted_points",
        "games_played_current", "weight_current_season", "avg_minutes_per_game_current",
        "blended_avg_minutes", "rotation_risk", "zero_games_flag", "status"]
print(row[cols].to_string(index=False))

print("\n--- Checking fallback name match ---")
live_players = fetch_live_players()
fallback = get_past_season_fallback()
match = live_players[live_players["web_name"].str.contains(PLAYER_NAME, case=False, na=False)]
for _, p in match.iterrows():
    print(f"\nLive player: full_name='{p['full_name']}'")
    fb_match = fallback[fallback["name"] == p["full_name"]]
    if len(fb_match) > 0:
        print(f"  Matched historical 'name': '{fb_match.iloc[0]['name']}' -> "
              f"points_season_avg_so_far={fb_match.iloc[0]['points_season_avg_so_far']:.2f}")
    else:
        print("  No exact historical name match found (would use price-based proxy)")

