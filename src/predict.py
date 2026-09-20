"""
src/predict.py — Phase 3: single, reusable prediction pipeline.

Given the live player pool, this produces a predicted_points estimate for
EVERY current player, blending current-season form with past-season form
(weighted by games played this season). This is the one place prediction
logic lives — optimizer.py and the transfer engine (Phase 4) both call into
this rather than duplicating the blending/prediction logic themselves.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests
import pandas as pd
import numpy as np
import config
from src.model import train_final_model


def fetch_live_players():
    url = "https://fantasy.premierleague.com/api/bootstrap-static/"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    data = r.json()

    type_map = {et["id"]: et["singular_name_short"] for et in data["element_types"]}
    team_map = {t["id"]: t["name"] for t in data["teams"]}

    rows = []
    for e in data["elements"]:
        rows.append({
            "fpl_id": e["id"],
            "full_name": f"{e['first_name']} {e['second_name']}",
            "web_name": e["web_name"],
            "position": type_map[e["element_type"]],
            "team": team_map[e["team"]],
            "price": e["now_cost"] / 10,
            "status": e["status"],
            "chance_of_playing": e.get("chance_of_playing_next_round"),
            "cost_change_start": e.get("cost_change_start", 0),
            "cost_change_event": e.get("cost_change_event", 0),
        })
    return pd.DataFrame(rows)


def fetch_player_gw_history(fpl_id):
    url = f"https://fantasy.premierleague.com/api/element-summary/{fpl_id}/"
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    return r.json().get("history", [])


def build_current_season_features(live_players, verbose=True):
    records = []
    if verbose:
        print("Fetching each player's current-season gameweek history...")
    for i, row in live_players.iterrows():
        try:
            history = fetch_player_gw_history(row["fpl_id"])
        except Exception:
            history = []

        if not history:
            records.append({"fpl_id": row["fpl_id"], "has_current_data": False})
            continue

        hist_df = pd.DataFrame(history)
        total_minutes = hist_df["minutes"].sum()
        games_played = (hist_df["minutes"] > 0).sum()
        avg_minutes_per_game = total_minutes / games_played if games_played > 0 else 0

        last3 = hist_df.tail(3)
        last5 = hist_df.tail(5)

        rec = {
            "fpl_id": row["fpl_id"],
            "has_current_data": total_minutes > 0,
            "games_played_current": games_played,
            "total_minutes_current": total_minutes,
            "avg_minutes_per_game_current": avg_minutes_per_game,
            "total_points_avg_last3": last3["total_points"].mean(),
            "total_points_avg_last5": last5["total_points"].mean(),
            "minutes_avg_last3": last3["minutes"].mean(),
            "minutes_avg_last5": last5["minutes"].mean(),
            "goals_scored_avg_last3": last3["goals_scored"].mean(),
            "goals_scored_avg_last5": last5["goals_scored"].mean(),
            "assists_avg_last3": last3["assists"].mean(),
            "assists_avg_last5": last5["assists"].mean(),
            "bps_avg_last3": last3["bps"].mean(),
            "bps_avg_last5": last5["bps"].mean(),
            "ict_index_avg_last3": pd.to_numeric(last3["ict_index"], errors="coerce").mean(),
            "ict_index_avg_last5": pd.to_numeric(last5["ict_index"], errors="coerce").mean(),
            "bonus_avg_last3": last3["bonus"].mean(),
            "bonus_avg_last5": last5["bonus"].mean(),
            "defensive_contribution_avg_last3": last3.get(
                "defensive_contribution", pd.Series([0])).mean(),
            "defensive_contribution_avg_last5": last5.get(
                "defensive_contribution", pd.Series([0])).mean(),
            "clean_sheets_avg_last3": last3.get("clean_sheets", pd.Series([0])).mean(),
            "clean_sheets_avg_last5": last5.get("clean_sheets", pd.Series([0])).mean(),
            "clean_sheets_avg_last3": last3.get("clean_sheets", pd.Series([0])).mean(),
            "clean_sheets_avg_last5": last5.get("clean_sheets", pd.Series([0])).mean(),
            "points_season_avg_so_far": hist_df["total_points"].mean(),
        }
        records.append(rec)
        if verbose and i % 100 == 0:
            print(f"  ...processed {i}/{len(live_players)} players")

    return pd.DataFrame(records)


def get_past_season_fallback():
    df = pd.read_csv(config.FEATURES_PATH, low_memory=False)
    df = df[df["season"] == config.HISTORICAL_SEASONS[-1]].copy()
    idx = df.groupby("name")["GW"].idxmax()
    snapshot = df.loc[idx].reset_index(drop=True)
    return snapshot[["name"] + config.FEATURE_COLS]


def blend_and_predict(live_players, current_season, fallback_snapshot, model, train_cols):
    """
    Core blending + prediction logic. Returns live_players with predicted_points,
    rotation_risk, and zero_games_flag columns added — the single source of
    truth used by both the squad optimizer and the transfer engine.
    """
    merged = live_players.merge(current_season, on="fpl_id", how="left")
    merged["games_played_current"] = merged["games_played_current"].fillna(0)
    merged["total_minutes_current"] = merged["total_minutes_current"].fillna(0)

    # Team-level clean sheet rate (current season, pre-blend): computed from
    # this season's DEF/GKP players' own clean-sheet form, applied to every
    # player on that team. Must happen BEFORE the blending loop below, so it
    # gets blended with its own past-season equivalent like every other
    # feature, rather than being overwritten by it.
    def_gkp_current = merged[
        (merged["position"].isin(["DEF", "GKP"])) & (merged["games_played_current"] > 0)
    ]
    team_rate = def_gkp_current.groupby("team")["clean_sheets_avg_last5"].mean()
    merged["team_clean_sheet_rate_last5"] = merged["team"].map(team_rate).fillna(0)

    fallback_renamed = fallback_snapshot.rename(columns={c: f"{c}_past" for c in config.FEATURE_COLS})
    merged = merged.merge(fallback_renamed, left_on="full_name", right_on="name", how="left")

    # Shrinkage blend: weight_current = n / (n + k), n = minutes-weighted
    # effective games this season. Validated via diagnostics.py's shrinkage
    # test to beat the old games/5 formula. Never fully discards last season.
    n_effective = merged["total_minutes_current"] / 90
    weight_current = n_effective / (n_effective + config.SHRINKAGE_K)
    merged["weight_current_season"] = weight_current

    for col in config.FEATURE_COLS:
        past_col = f"{col}_past"
        current_val = pd.Series(merged[col] if col in merged.columns else np.nan).fillna(0)
        past_val = pd.Series(merged[past_col] if past_col in merged.columns else np.nan).fillna(0)
        merged[col] = weight_current * current_val + (1 - weight_current) * past_val

    # 'value' (price) and price-change fields are live, known-now facts — not
    # blended from history. Historical 'value' is stored in tenths (e.g. 75 =
    # £7.5m), so scale the live price/changes to match.
    merged["value"] = merged["price"] * 10
    merged["price_change_since_start"] = merged["cost_change_start"]
    merged["price_change_last_gw"] = merged["cost_change_event"]

    # Deliberately NEUTRAL fixture inputs for squad-building predictions — see
    # config.py's note on NEUTRAL_FIXTURE_DIFFICULTY. We want "how good is this
    # player in general", not "how good is their next specific match".
    merged["fixture_1_difficulty"] = config.NEUTRAL_FIXTURE_DIFFICULTY
    merged["num_fixtures_this_gw"] = config.NEUTRAL_NUM_FIXTURES

    has_any_data = merged["has_current_data"].fillna(False) | merged["name"].notna()
    still_missing = ~has_any_data
    if still_missing.sum() > 0:
        merged.loc[still_missing, "total_points_avg_last3"] = merged.loc[still_missing, "price"] * 0.6
        merged.loc[still_missing, "points_season_avg_so_far"] = merged.loc[still_missing, "price"] * 0.6

    X = merged[config.FEATURE_COLS].fillna(0)
    position_dummies = pd.get_dummies(merged["position"], prefix="pos")
    X = pd.concat([X, position_dummies], axis=1)
    X = X.reindex(columns=train_cols, fill_value=0)
    merged["predicted_points"] = model.predict(X)

    past_minutes = merged.get("minutes_avg_last5_past", pd.Series(0, index=merged.index)).fillna(0)
    current_minutes = merged.get("avg_minutes_per_game_current", pd.Series(0, index=merged.index)).fillna(0)
    merged["blended_avg_minutes"] = weight_current * current_minutes + (1 - weight_current) * past_minutes
    merged["rotation_risk"] = merged["blended_avg_minutes"] < config.MIN_AVG_MINUTES
    merged["zero_games_flag"] = (merged["games_played_current"] == 0) & (merged["name"].notna())

    return merged


def get_predictions_for_all_players(model=None, train_cols=None, verbose=True):
    """
    Main entry point: returns a dataframe of every current player with a
    predicted_points estimate, plus rotation-risk / zero-games flags.
    """
    if model is None or train_cols is None:
        model, train_cols = train_final_model()
    live_players = fetch_live_players()
    current_season = build_current_season_features(live_players, verbose=verbose)
    fallback_snapshot = get_past_season_fallback()
    predicted = blend_and_predict(live_players, current_season, fallback_snapshot, model, train_cols)
    return predicted


if __name__ == "__main__":
    predictions = get_predictions_for_all_players()
    os.makedirs(config.OUTPUTS_DIR, exist_ok=True)
    out_path = os.path.join(config.OUTPUTS_DIR, "predictions_latest.csv")
    predictions.to_csv(out_path, index=False)
    print(f"\nSaved predictions for {len(predictions)} players to {out_path}")
    print(predictions[["web_name", "position", "team", "price", "predicted_points"]]
          .sort_values("predicted_points", ascending=False).head(15).to_string(index=False))
