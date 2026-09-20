"""
Manual dry-run of the transfer engine using your ACTUAL known GW4 squad and
GW5 details (bank, free transfers), bypassing team_state.py since the FPL
API hasn't marked GW4 as finished yet. Once GW4 finishes, use the real
`python -m src.transfer_engine` instead — this script is just to test the
engine's logic works correctly in the meantime.
"""

import sys
sys.path.append(".")

from src.predict import get_predictions_for_all_players
from src.transfer_engine import recommend_transfers

# Your actual squad going into GW5 (web_name, team) — team included because
# web_name alone isn't unique (e.g. two different "Thomas" players exist).
SQUAD = [
    ("Raya", "Arsenal"),
    ("Verbruggen", "Brighton"),
    ("Thomas", "Coventry City"),
    ("Egan", "Hull City"),
    ("O'Shea", "Ipswich Town"),
    ("Davis", "Ipswich Town"),
    ("Muharemović", "Leeds"),
    ("Saka", "Arsenal"),
    ("Scott", "Bournemouth"),
    ("Janelt", "Brentford"),
    ("Szoboszlai", "Liverpool"),
    ("Gibbs-White", "Nott'm Forest"),
    ("João Pedro", "Chelsea"),
    ("Isak", "Liverpool"),
    ("Haaland", "Man City"),
]

BANK = 0.4
FREE_TRANSFERS = 3
GAMEWEEK = 5

print("Fetching live predictions...")
predictions = get_predictions_for_all_players()

# Match on (web_name, team) pairs so common surnames don't collide
squad_keys = set(SQUAD)
predictions["_key"] = list(zip(predictions["web_name"], predictions["team"]))
matched = predictions[predictions["_key"].isin(squad_keys)]

print(f"\nMatched {len(matched)} / {len(SQUAD)} squad players:")
print(matched[["web_name", "position", "team", "price"]].to_string(index=False))

if len(matched) != len(SQUAD):
    matched_keys = set(matched["_key"])
    missing = [k for k in SQUAD if k not in matched_keys]
    print(f"\nWARNING: couldn't match: {missing} — check spelling/team vs live API")
    sys.exit(1)

# Build a fake team_state dict matching what transfer_engine.py expects
fake_team_state = {
    "bank": BANK,
    "free_transfers_available": FREE_TRANSFERS,
    "current_squad_picks": [{"element": fid} for fid in matched["fpl_id"].tolist()],
}

best_option, history = recommend_transfers(predictions, fake_team_state, GAMEWEEK)

print("\n=== All options considered ===")
for h in history:
    print(f"  {h['transfers']} transfer(s): gain={h['gain']:.2f}, net benefit={h['net_benefit']:.2f}")

print(f"\n=== RECOMMENDATION: {best_option['transfers']} transfer(s) ===")
if best_option["transfers"] == 0:
    print("Bank your free transfer — no transfer is worth making this week.")
else:
    print("  OUT:")
    for p in best_option["out_players"]:
        print(f"    {p['web_name']} ({p['position']}, {p['team']}, £{p['price']:.1f}m)")
    print("  IN:")
    for p in best_option["in_players"]:
        print(f"    {p['web_name']} ({p['position']}, {p['team']}, £{p['price']:.1f}m)")
    extra = max(0, best_option["transfers"] - FREE_TRANSFERS)
    if extra > 0:
        print(f"  ({extra} hit(s) taken, -{extra * 4} points)")
