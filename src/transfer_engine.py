"""
src/transfer_engine.py — Phase 4: recommends transfers for the upcoming
gameweek, given your ACTUAL current squad and free transfer count.

Scoring: transfer_score = fixture-neutral predicted_points (long-term quality,
same signal used for squad-building) + a small real-fixture bonus for the
immediate upcoming gameweek.

Design: for each candidate number of changes (0 to MAX_TRANSFERS_CONSIDERED),
solves an LP for the best possible SQUAD given a constraint that at most N
players differ from your current squad. The objective rewards starting XI +
captain points only (not bench) — so bench-only swaps won't be recommended
unless they genuinely improve your team. Being a proper LP (not sequential
1-for-1 swaps), it can freely reallocate budget and change positions across
the whole squad, not just player-for-same-position swaps.

Explicitly allows "0 transfers" (bank the free transfer) to win, if no
number of changes beats it on net benefit.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pulp
import config
from src.predict import get_predictions_for_all_players
from src.team_state import get_full_team_state
from src.captaincy import fetch_next_fixture_difficulty
from src.optimizer import build_squad_with_roles


def compute_transfer_scores(predictions, gameweek):
    """Add a transfer_score column: fixture-neutral predicted_points + a
    light bonus for a good immediate fixture AND goal threat — same full
    formula as captaincy.py/chip_strategy.py, just lighter-weighted here
    since this isn't a one-week-only decision like captaincy."""
    difficulty_by_team = fetch_next_fixture_difficulty(gameweek)
    predictions = predictions.copy()
    predictions["fixture_difficulty"] = predictions["team"].map(difficulty_by_team)
    fixture_bonus = (3 - predictions["fixture_difficulty"].fillna(3)) * config.TRANSFER_FIXTURE_WEIGHT
    goal_threat = predictions["goals_scored_avg_last5"].fillna(0) * config.TRANSFER_GOAL_THREAT_WEIGHT
    predictions["transfer_score"] = predictions["predicted_points"] + goal_threat + fixture_bonus
    return predictions


def solve_squad_with_change_limit(pool_df, current_squad_ids, budget, max_changes):
    """
    Best possible squad (by starting XI + captain transfer_score) achievable
    by changing at most `max_changes` players from current_squad_ids.
    Returns None if infeasible (e.g. budget too tight for max_changes=0 given
    current squad isn't in the pool at exactly its own price — shouldn't
    normally happen since current squad is always eligible to keep).
    """
    # Current squad members are ALWAYS eligible to keep, regardless of
    # rotation-risk/zero-games flags — otherwise "keep everyone" (max_changes=0)
    # can be infeasible and the baseline silently breaks.
    is_current_mask = pool_df["fpl_id"].isin(current_squad_ids)
    pool = pool_df[
        is_current_mask
        | (
            (pool_df["status"] == "a")
            & (~pool_df["rotation_risk"])
            & (~pool_df["zero_games_flag"])
        )
    ].reset_index(drop=True)

    ids = pool.index.tolist()
    score, price = pool["transfer_score"], pool["price"]
    pos, team = pool["position"], pool["team"]
    is_current = pool["fpl_id"].isin(current_squad_ids)

    prob = pulp.LpProblem("Transfer_Optimization", pulp.LpMaximize)
    squad = pulp.LpVariable.dicts("squad", ids, cat="Binary")
    start = pulp.LpVariable.dicts("start", ids, cat="Binary")
    captain = pulp.LpVariable.dicts("captain", ids, cat="Binary")

    # Reward starting XI + captain only — bench players don't drive the
    # decision unless keeping/changing them affects who can start.
    # Tiny bonus for keeping current players: prevents pointless swaps when
    # the LP is otherwise indifferent (e.g. identical bench options).
    prob += (
        pulp.lpSum(score[i] * start[i] for i in ids)
        + pulp.lpSum(score[i] * captain[i] for i in ids)
        + 0.001 * pulp.lpSum(squad[i] for i in ids if is_current[i])
    )

    prob += pulp.lpSum(squad[i] for i in ids) == 15
    prob += pulp.lpSum(price[i] * squad[i] for i in ids) <= budget
    for p_name, count in config.SQUAD_POS_LIMITS.items():
        prob += pulp.lpSum(squad[i] for i in ids if pos[i] == p_name) == count
    for t in team.unique():
        prob += pulp.lpSum(squad[i] for i in ids if team[i] == t) <= config.MAX_PER_TEAM
    for i in ids:
        prob += start[i] <= squad[i]
    prob += pulp.lpSum(start[i] for i in ids) == 11
    for p_name, (lo, hi) in config.STARTING_LIMITS.items():
        cnt = pulp.lpSum(start[i] for i in ids if pos[i] == p_name)
        prob += cnt >= lo
        prob += cnt <= hi
    for i in ids:
        prob += captain[i] <= start[i]
    prob += pulp.lpSum(captain[i] for i in ids) == 1

    # Change limit: at most max_changes players may differ from current squad
    prob += pulp.lpSum(squad[i] for i in ids if is_current[i]) >= 15 - max_changes

    prob.solve(pulp.PULP_CBC_CMD(msg=False))
    if pulp.LpStatus[prob.status] != "Optimal":
        return None

    squad_ids = [i for i in ids if squad[i].value() == 1]
    start_ids = [i for i in ids if start[i].value() == 1]
    captain_id = [i for i in ids if captain[i].value() == 1][0]

    xi_score = pool.loc[start_ids, "transfer_score"].sum() + pool.loc[captain_id, "transfer_score"]
    out_players = [pool.loc[i] for i in ids if is_current[i] and squad[i].value() != 1]
    in_players = [pool.loc[i] for i in ids if not is_current[i] and squad[i].value() == 1]

    return {
        "pool": pool, "squad_ids": squad_ids, "start_ids": start_ids, "captain_id": captain_id,
        "xi_score": xi_score, "out_players": out_players, "in_players": in_players,
    }


def recommend_transfers(predictions, team_state, gameweek):
    predictions = compute_transfer_scores(predictions, gameweek)
    current_squad_ids = set(p["element"] for p in team_state["current_squad_picks"])

    # Current squad's own bank + squad value = total available spending power
    current_squad_df = predictions[predictions["fpl_id"].isin(current_squad_ids)]
    budget = team_state["bank"] + current_squad_df["price"].sum()

    free_transfers = team_state["free_transfers_available"]

    baseline = solve_squad_with_change_limit(predictions, current_squad_ids, budget, max_changes=0)
    if baseline is None:
        raise RuntimeError(
            "Baseline solve (0 transfers) failed — cannot compute transfer gains. "
            "This usually means the current squad can't satisfy the squad constraints "
            "(check that all 15 players were matched correctly, and that budget "
            f"(£{budget:.1f}m) covers the current squad."
        )
    baseline_score = baseline["xi_score"]

    history = []
    for n in range(0, config.MAX_TRANSFERS_CONSIDERED + 1):
        result = solve_squad_with_change_limit(predictions, current_squad_ids, budget, max_changes=n)
        if result is None:
            continue
        gain = result["xi_score"] - baseline_score
        extra_transfers = max(0, n - free_transfers)
        net_benefit = gain - extra_transfers * config.TRANSFER_HIT_COST
        history.append({
            "transfers": n, "gain": gain, "net_benefit": net_benefit,
            "out_players": result["out_players"], "in_players": result["in_players"],
            "result": result,
        })

    # Among options that meet the minimum gain bar, pick the best net benefit.
    # If none do, bank the transfer (0) regardless of what "wins" on raw
    # net benefit — a marginal gain isn't worth spending real, valuable
    # transfers on, even free ones.
    qualifying = [h for h in history if h["gain"] >= config.MIN_GAIN_TO_ACT]
    if qualifying:
        best_option = max(qualifying, key=lambda h: h["net_benefit"])
    else:
        best_option = next(h for h in history if h["transfers"] == 0)

    return best_option, history


if __name__ == "__main__":
    import sys as _sys
    gameweek = int(_sys.argv[1]) if len(_sys.argv) > 1 else None

    team_state = get_full_team_state()
    gameweek = gameweek or team_state["current_gameweek"]

    print(f"Team: {team_state['team_name']}")
    print(f"Gameweek: {gameweek}")
    print(f"Bank: £{team_state['bank']:.1f}m")
    print(f"Free transfers available: {team_state['free_transfers_available']}")

    predictions = get_predictions_for_all_players()
    best_option, history = recommend_transfers(predictions, team_state, gameweek)

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
        extra = max(0, best_option["transfers"] - team_state["free_transfers_available"])
        if extra > 0:
            print(f"  ({extra} hit(s) taken, -{extra * config.TRANSFER_HIT_COST} points)")
