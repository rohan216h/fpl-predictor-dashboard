"""
run_weekly.py — Phase 6: one command for the full weekly recommendation.

Run this BEFORE each gameweek deadline:
    python run_weekly.py

It uses your REAL current squad (from the FPL API via team_state.py), then:
  1. Recommends transfers (or banking), using the LP transfer engine
  2. Shows the recommended starting XI + bench for the squad AFTER those transfers
  3. Ranks captain / vice-captain (goal threat + real fixture difficulty)
  4. Checks whether Triple Captain is worth using this week (if still available)

Not yet covered: Free Hit, Bench Boost, Wildcard (logic not built).

Known limitation: the API can't see changes you've made on the FPL site for a
gameweek that hasn't been played yet (e.g. a lineup or captain you already
set), so the squad is read as of your last played gameweek.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
import config
from src.team_state import get_full_team_state
from src.predict import get_predictions_for_all_players
from src.transfer_engine import recommend_transfers
from src.captaincy import compute_captaincy_scores, fetch_next_fixture_difficulty
from src.chip_strategy import get_dynamic_threshold

POSITION_ORDER = {"GKP": 0, "DEF": 1, "MID": 2, "FWD": 3}


def fmt(p):
    return f"{p['web_name']} ({p['position']}, {p['team']}, £{p['price']:.1f}m)"


def main():
    state = get_full_team_state()
    gw = state["current_gameweek"]
    free_transfers = state["free_transfers_available"]

    print("=" * 60)
    print(f"WEEKLY REPORT — {state['team_name']} — GAMEWEEK {gw}")
    print("=" * 60)
    print(f"Bank: £{state['bank']:.1f}m | Free transfers: {free_transfers}")
    print(f"Chips available this half: {state['chips_available']}")

    predictions = get_predictions_for_all_players()

    # ---- 1. Transfers ----
    best_option, history = recommend_transfers(predictions, state, gw)

    print("\n--- 1. TRANSFERS ---")
    for h in history:
        print(f"  {h['transfers']} transfer(s): gain={h['gain']:.2f}, net benefit={h['net_benefit']:.2f}")
    print(f"\nRecommendation: {best_option['transfers']} transfer(s)")
    if best_option["transfers"] == 0:
        print(f"  BANK your free transfer(s) — nothing clears the minimum gain bar "
              f"({config.MIN_GAIN_TO_ACT} points).")
    else:
        print("  OUT:")
        for p in best_option["out_players"]:
            print(f"    {fmt(p)}")
        print("  IN:")
        for p in best_option["in_players"]:
            print(f"    {fmt(p)}")
        extra = max(0, best_option["transfers"] - free_transfers)
        if extra > 0:
            print(f"  ({extra} hit(s) taken, -{extra * config.TRANSFER_HIT_COST} points)")

    # ---- 2. Lineup (for the squad AFTER the recommended transfers) ----
    result = best_option["result"]
    pool = result["pool"]
    squad = pool.loc[result["squad_ids"]].copy()
    start_ids = set(result["start_ids"])
    squad["role"] = ["Starting XI" if i in start_ids else "Bench" for i in squad.index]
    squad["pos_order"] = squad["position"].map(POSITION_ORDER)

    xi = squad[squad["role"] == "Starting XI"].sort_values(["pos_order", "transfer_score"], ascending=[True, False])
    bench = squad[squad["role"] == "Bench"]
    bench_outfield = bench[bench["position"] != "GKP"].sort_values("transfer_score", ascending=False)
    bench_gk = bench[bench["position"] == "GKP"]

    n_def = (xi["position"] == "DEF").sum()
    n_mid = (xi["position"] == "MID").sum()
    n_fwd = (xi["position"] == "FWD").sum()

    print(f"\n--- 2. RECOMMENDED LINEUP ({n_def}-{n_mid}-{n_fwd}) ---")
    for _, p in xi.iterrows():
        print(f"  {fmt(p)}")
    print("  Bench (in order):")
    for i, (_, p) in enumerate(pd.concat([bench_outfield, bench_gk]).iterrows(), start=1):
        print(f"    {i}. {fmt(p)}")

    # ---- 3. Captaincy ----
    difficulty = fetch_next_fixture_difficulty(gw)
    ranked = compute_captaincy_scores(squad, difficulty)
    captain, vice = ranked.iloc[0], ranked.iloc[1]

    print("\n--- 3. CAPTAINCY ---")
    print(f"  Captain:      {captain['web_name']} (score {captain['captaincy_score']:.2f}, "
          f"fixture difficulty {captain['fixture_difficulty']})")
    print(f"  Vice-captain: {vice['web_name']} (score {vice['captaincy_score']:.2f}, "
          f"fixture difficulty {vice['fixture_difficulty']})")

    # ---- 4. Triple Captain ----
    print("\n--- 4. TRIPLE CAPTAIN ---")
    if "3xc" not in state["chips_available"]:
        print("  Already used this half.")
    else:
        threshold = get_dynamic_threshold(gw)
        gw_in_half = ((gw - 1) % 19) + 1
        print(f"  Week {gw_in_half} of 19 in this half. Dynamic threshold: {threshold:.2f}")
        print(f"  Best candidate: {captain['web_name']} (captaincy score {captain['captaincy_score']:.2f})")
        if captain["captaincy_score"] >= threshold:
            print(f"  RECOMMENDATION: USE Triple Captain on {captain['web_name']} this week.")
        else:
            print("  RECOMMENDATION: SAVE it — this week's best pick isn't an outlier.")

    print("\n(Free Hit / Bench Boost / Wildcard: no decision logic built yet — not evaluated.)")
    print("Remember: make transfers on the FPL site FIRST, then set the lineup and captain.")


if __name__ == "__main__":
    main()
