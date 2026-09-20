"""
Debug: print the raw API fields team_state.py uses to compute team value,
so we can see exactly where the £99.8m vs real £99.6m discrepancy comes from.
"""

import sys
sys.path.append(".")

from src.team_state import (
    fetch_entry_summary, fetch_current_picks, get_latest_completed_gameweek, fetch_bootstrap
)

bootstrap = fetch_bootstrap()
latest_gw = get_latest_completed_gameweek(bootstrap)
print(f"Latest completed gameweek per API: {latest_gw}")

summary = fetch_entry_summary()
print(f"\nsummary['last_deadline_value']: {summary.get('last_deadline_value')}")
print(f"summary['last_deadline_bank']: {summary.get('last_deadline_bank')}")

picks_data = fetch_current_picks(gameweek=latest_gw)
entry_history = picks_data.get("entry_history", {})
print(f"\nentry_history (full, for GW{latest_gw}):")
for k, v in entry_history.items():
    print(f"  {k}: {v}")
