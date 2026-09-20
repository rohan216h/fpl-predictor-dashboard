"""
src/team_state.py — Phase 2: track current squad, bank, free transfers, and
chip availability from the live FPL entry.

FPL chip rules assumed (2025-26+ ruleset):
  - Free transfers: start at 1 (from GW2 onward), +1 each gameweek you don't
    use them all, capped at 5. Using a chip (Wildcard/Free Hit) that
    gameweek does NOT consume your banked free transfers.
  - Each of Wildcard, Free Hit, Bench Boost, Triple Captain is available
    ONCE per season half (GW1-19 and GW20-38), so up to 2 uses each per
    season, one per half.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests
import config

MAX_FREE_TRANSFERS = 5
CHIP_TYPES = ["wildcard", "freehit", "bboost", "3xc"]
FIRST_HALF_LAST_GW = 19  # gameweeks 1-19 = first half, 20-38 = second half


def fetch_entry_summary(entry_id=None):
    entry_id = entry_id or config.FPL_ENTRY_ID
    url = f"https://fantasy.premierleague.com/api/entry/{entry_id}/"
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    return r.json()


def fetch_entry_history(entry_id=None):
    entry_id = entry_id or config.FPL_ENTRY_ID
    url = f"https://fantasy.premierleague.com/api/entry/{entry_id}/history/"
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    return r.json()


def fetch_current_picks(entry_id=None, gameweek=None):
    entry_id = entry_id or config.FPL_ENTRY_ID
    url = f"https://fantasy.premierleague.com/api/entry/{entry_id}/event/{gameweek}/picks/"
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    return r.json()


def fetch_bootstrap():
    url = "https://fantasy.premierleague.com/api/bootstrap-static/"
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    return r.json()


def get_latest_completed_gameweek(bootstrap=None):
    bootstrap = bootstrap or fetch_bootstrap()
    finished = [e for e in bootstrap["events"] if e["finished"]]
    if not finished:
        return None
    return max(e["id"] for e in finished)


def get_chips_used(entry_id=None, history=None):
    history = history or fetch_entry_history(entry_id)
    return [{"name": chip["name"], "gameweek": chip["event"]} for chip in history.get("chips", [])]


def get_chips_available(chips_used, current_gw):
    """Each chip type is usable once per half — figure out what's still available."""
    half = "first" if current_gw <= FIRST_HALF_LAST_GW else "second"
    used_this_half = set()
    for chip in chips_used:
        chip_half = "first" if chip["gameweek"] <= FIRST_HALF_LAST_GW else "second"
        if chip_half == half:
            used_this_half.add(chip["name"])
    return [c for c in CHIP_TYPES if c not in used_this_half]


def compute_free_transfers(entry_id=None, current_gw=None, history=None):
    """
    Reconstruct free-transfer count by walking through gameweek history.
    FPL doesn't expose this directly via the API.
    """
    history = history or fetch_entry_history(entry_id)
    chips_used = {c["event"]: c["name"] for c in history.get("chips", [])}
    current_season_gws = sorted(history.get("current", []), key=lambda x: x["event"])

    free_transfers = 1  # baseline going into GW2 (GW1 has no "free transfer" concept)
    for gw_data in current_season_gws:
        gw = gw_data["event"]
        if gw >= current_gw:
            break
        if gw == 1:
            continue  # GW1 is unlimited/initial squad selection, not part of the FT formula

        transfers_made = gw_data.get("event_transfers", 0)
        chip_active = chips_used.get(gw)

        if chip_active in ("wildcard", "freehit"):
            # Chip week: FT count is frozen — carries forward UNCHANGED.
            # It doesn't get consumed (transfers that week are free/unlimited),
            # but it also doesn't earn the usual +1 for that gameweek.
            pass
        else:
            leftover = max(0, free_transfers - transfers_made)
            free_transfers = min(MAX_FREE_TRANSFERS, leftover + 1)

    return free_transfers


def get_full_team_state(entry_id=None):
    entry_id = entry_id or config.FPL_ENTRY_ID
    bootstrap = fetch_bootstrap()
    current_gw = get_latest_completed_gameweek(bootstrap) + 1  # next upcoming deadline

    summary = fetch_entry_summary(entry_id)
    history = fetch_entry_history(entry_id)

    # Squad from the most recently PLAYED gameweek (current_gw - 1), since the
    # upcoming gameweek's picks aren't set until you submit them
    last_played_gw = current_gw - 1
    picks_data = fetch_current_picks(entry_id, last_played_gw) if last_played_gw >= 1 else None

    chips_used = get_chips_used(entry_id, history)
    chips_available = get_chips_available(chips_used, current_gw)
    free_transfers = compute_free_transfers(entry_id, current_gw, history)

    entry_history_block = picks_data.get("entry_history", {}) if picks_data else {}

    return {
        "team_name": summary.get("name"),
        "current_gameweek": current_gw,
        "bank": entry_history_block.get("bank", summary.get("last_deadline_bank")) / 10,
        "team_value": entry_history_block.get("value", summary.get("last_deadline_value")) / 10,
        "free_transfers_available": free_transfers,
        "chips_used": chips_used,
        "chips_available": chips_available,
        "current_squad_picks": picks_data.get("picks") if picks_data else None,
    }


if __name__ == "__main__":
    state = get_full_team_state()
    print("Team:", state["team_name"])
    print("Upcoming gameweek:", state["current_gameweek"])
    print(f"Bank: £{state['bank']:.1f}m")
    print(f"Team value: £{state['team_value']:.1f}m")
    print("Free transfers available:", state["free_transfers_available"])
    print("Chips used so far:", state["chips_used"])
    print("Chips still available this half:", state["chips_available"])
    print("\nCurrent squad (element IDs + captain/vice):")
    for p in state["current_squad_picks"] or []:
        tag = " (C)" if p["is_captain"] else " (VC)" if p["is_vice_captain"] else ""
        print(f"  element {p['element']}{tag}")
