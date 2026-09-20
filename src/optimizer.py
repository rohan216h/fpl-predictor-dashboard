"""
src/optimizer.py — Squad selection: takes predictions from predict.py and
picks the best 15/XI/bench within budget and formation constraints.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pulp
import config
from src.predict import get_predictions_for_all_players


def optimize_squad(players_df, budget, min_avg_minutes=None, reliability_weight=0.0, points_weight=0.0):
    """
    min_avg_minutes: override config.MIN_AVG_MINUTES for a stricter hard filter.
    reliability_weight: if > 0, adds a secondary objective term rewarding
    overall squad reliability (avg minutes / 90) alongside predicted points —
    addresses "won't start."
    points_weight: if > 0, adds a secondary reward for predicted_points across
    the FULL squad (not just starters) — addresses "won't score much," since
    bench slots otherwise get chosen on price alone with zero regard for
    their own scoring potential.
    """
    min_avg_minutes = min_avg_minutes if min_avg_minutes is not None else config.MIN_AVG_MINUTES
    pool = players_df[
        (players_df["status"] == "a")
        & (players_df["blended_avg_minutes"] >= min_avg_minutes)
        & (~players_df["zero_games_flag"])
    ].reset_index(drop=True)

    ids = pool.index.tolist()
    pred, price = pool["predicted_points"], pool["price"]
    pos, team = pool["position"], pool["team"]
    reliability = pool["blended_avg_minutes"] / 90

    prob = pulp.LpProblem("FPL_Squad", pulp.LpMaximize)
    squad = pulp.LpVariable.dicts("squad", ids, cat="Binary")
    start = pulp.LpVariable.dicts("start", ids, cat="Binary")
    captain = pulp.LpVariable.dicts("captain", ids, cat="Binary")

    objective = pulp.lpSum(pred[i] * start[i] for i in ids) + pulp.lpSum(pred[i] * captain[i] for i in ids)
    if reliability_weight > 0:
        objective += reliability_weight * pulp.lpSum(reliability[i] * squad[i] for i in ids)
    if points_weight > 0:
        objective += points_weight * pulp.lpSum(pred[i] * squad[i] for i in ids)
    prob += objective

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

    prob.solve(pulp.PULP_CBC_CMD(msg=False))
    if pulp.LpStatus[prob.status] != "Optimal":
        raise RuntimeError(f"Solver status: {pulp.LpStatus[prob.status]}")

    squad_ids = [i for i in ids if squad[i].value() == 1]
    start_ids = [i for i in ids if start[i].value() == 1]
    captain_id = [i for i in ids if captain[i].value() == 1][0]
    bench_ids = [i for i in squad_ids if i not in start_ids]
    vice_id = pool.loc[start_ids].drop(index=captain_id)["predicted_points"].idxmax()

    bench_gk = [i for i in bench_ids if pos[i] == "GKP"]
    bench_outfield = sorted((i for i in bench_ids if pos[i] != "GKP"), key=lambda i: pred[i], reverse=True)

    return pool, {
        "squad_ids": squad_ids, "start_ids": start_ids,
        "bench_order": bench_outfield + bench_gk,
        "captain_id": captain_id, "vice_id": vice_id,
    }


def build_squad_with_roles(pool, result):
    df = pool.copy()
    df["role"] = "Bench"
    df.loc[result["start_ids"], "role"] = "Starting XI"
    df.loc[result["captain_id"], "role"] += " (C)"
    df.loc[result["vice_id"], "role"] += " (VC)"
    return df


def run_full_squad_build(budget, predictions=None, min_avg_minutes=None, reliability_weight=0.0, points_weight=0.0):
    """
    predictions: optionally pass in an already-computed predictions dataframe
    (from predict.get_predictions_for_all_players()) to avoid recomputing —
    useful when the transfer engine needs both squad-building AND
    predictions in the same run.
    """
    predictions = predictions if predictions is not None else get_predictions_for_all_players()
    pool, result = optimize_squad(predictions, budget, min_avg_minutes, reliability_weight, points_weight)
    return build_squad_with_roles(pool, result), result


def show_squad(squad_df, result, label):
    order = result["start_ids"] + result["bench_order"]
    cols = ["web_name", "position", "team", "price", "predicted_points", "blended_avg_minutes", "role"]
    out = squad_df.loc[order, cols].reset_index(drop=True)
    out.index += 1
    print(f"\n=== {label} ===")
    print(out.to_string())
    bench_ids = result["bench_order"]
    bench_avg_minutes = squad_df.loc[bench_ids, "blended_avg_minutes"].mean()
    bench_avg_points = squad_df.loc[bench_ids, "predicted_points"].mean()
    print(f"Bench average minutes reliability: {bench_avg_minutes:.1f}")
    print(f"Bench average predicted points: {bench_avg_points:.2f}")


if __name__ == "__main__":
    import sys as _sys
    os.makedirs(config.OUTPUTS_DIR, exist_ok=True)

    predictions = get_predictions_for_all_players()

    if "compare-bench" in _sys.argv:
        squad_a, result_a = run_full_squad_build(config.CURRENT_BUDGET, predictions=predictions)
        show_squad(squad_a, result_a, "BASELINE (current filter)")

        squad_b, result_b = run_full_squad_build(
            config.CURRENT_BUDGET, predictions=predictions,
            min_avg_minutes=config.MIN_AVG_MINUTES_STRICT,
        )
        show_squad(squad_b, result_b, f"STRICT THRESHOLD ({config.MIN_AVG_MINUTES_STRICT}+ min avg)")

        squad_c, result_c = run_full_squad_build(
            config.CURRENT_BUDGET, predictions=predictions,
            reliability_weight=config.BENCH_RELIABILITY_WEIGHT,
            points_weight=config.BENCH_POINTS_WEIGHT,
        )
        show_squad(squad_c, result_c, "RELIABILITY + POINTS BONUS in objective")

        squad_a.to_csv(os.path.join(config.OUTPUTS_DIR, "squad_latest.csv"), index=False)
    else:
        squad_df, result = run_full_squad_build(budget=config.CURRENT_BUDGET, predictions=predictions)
        show_squad(squad_df, result, "Squad")
        squad_df.to_csv(os.path.join(config.OUTPUTS_DIR, "squad_latest.csv"), index=False)
        print(f"\nSaved to {os.path.join(config.OUTPUTS_DIR, 'squad_latest.csv')}")
