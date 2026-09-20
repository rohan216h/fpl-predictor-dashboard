"""
One-off diagnostic: train the model and print feature importances, ranked.
Answers: how much weight is 'value' (price) actually getting relative to
recent-form stats? Run this before deciding whether/how to change the
feature set.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
from sklearn.ensemble import RandomForestRegressor
import config
from src.model import prepare_features


def print_feature_importances():
    df = pd.read_csv(config.FEATURES_PATH, low_memory=False)
    X = prepare_features(df)
    y = df[config.TARGET_COL]

    model = RandomForestRegressor(**config.RF_PARAMS)
    model.fit(X, y)

    importances = pd.Series(model.feature_importances_, index=X.columns)
    importances = importances.sort_values(ascending=False)

    print("=== Feature importances (Random Forest, trained on full history) ===")
    for feat, imp in importances.items():
        bar = "#" * int(imp * 200)
        print(f"{feat:35s} {imp:.4f}  {bar}")


def run_value_ablation_test():
    """
    Direct comparison: Random Forest backtest WITH 'value' (price) as a
    feature vs WITHOUT it. Settles empirically whether price is adding real
    predictive signal or just noise/redundancy on top of form-based features.
    """
    from src.model import load_data_with_order, walk_forward_backtest
    from sklearn.ensemble import RandomForestRegressor

    df = load_data_with_order()

    print("\n" + "=" * 60)
    print("ABLATION TEST: Random Forest WITH vs WITHOUT 'value' feature")
    print("=" * 60)

    _, mae_with, rmse_with = walk_forward_backtest(
        df, RandomForestRegressor, config.RF_PARAMS, "RF (WITH value)",
        feature_cols=config.FEATURE_COLS,
    )

    feature_cols_no_value = [c for c in config.FEATURE_COLS if c != "value"]
    _, mae_without, rmse_without = walk_forward_backtest(
        df, RandomForestRegressor, config.RF_PARAMS, "RF (WITHOUT value)",
        feature_cols=feature_cols_no_value,
    )

    print("\n=== ABLATION RESULT ===")
    print(f"WITH value:    MAE {mae_with:.4f}, RMSE {rmse_with:.4f}")
    print(f"WITHOUT value: MAE {mae_without:.4f}, RMSE {rmse_without:.4f}")
    diff = mae_without - mae_with
    if diff > 0:
        print(f"\nRemoving 'value' made MAE WORSE by {diff:.4f} — price is adding real signal.")
    else:
        print(f"\nRemoving 'value' made MAE BETTER (or unchanged) by {-diff:.4f} — "
              f"price was not helping, possibly adding noise.")


def get_season_final_snapshot(df, season):
    """Last-gameweek feature snapshot per player for a given season (generic
    version of predict.py's get_past_season_fallback, for any season)."""
    season_df = df[df["season"] == season]
    idx = season_df.groupby("name")["GW"].idxmax()
    snapshot = season_df.loc[idx].reset_index(drop=True)
    return snapshot[["name"] + config.FEATURE_COLS]


def add_cumulative_playtime(df):
    """Games/minutes played so far THIS season, using only prior gameweeks
    (shifted) — matches what would actually be known before each gameweek's
    deadline, no leakage."""
    df = df.sort_values(["element", "season", "GW"]).reset_index(drop=True)
    played = (df["minutes"] > 0).astype(int)
    df["games_played_so_far"] = df.groupby(["element", "season"])["minutes"].transform(
        lambda s: (s > 0).astype(int).shift(1).fillna(0).cumsum()
    )
    df["minutes_played_so_far"] = df.groupby(["element", "season"])["minutes"].transform(
        lambda s: s.shift(1).fillna(0).cumsum()
    )
    return df


def run_shrinkage_k_test(k_candidates=(0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 7, 10, 15), early_gw_cutoff=8):
    """
    Tests shrinkage-style blending: weight_current = n / (n + k), where n is
    MINUTES-WEIGHTED effective games played so far this season (total_minutes
    / 90). Compares several k values on EARLY-SEASON predictions specifically
    (GW1-8 of each season, using the prior season's final snapshot as the
    blend partner).

    LEAKAGE-SAFE, PROPER WALK-FORWARD: for each early gameweek being tested,
    the model is trained on all data strictly BEFORE that gameweek globally —
    same discipline as the main backtest. This correctly allows e.g. GW2's
    model to use that season's own GW1 result (already happened), while never
    using anything from later in the season or the future.
    """
    from src.model import prepare_features, get_season_sample_weights
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.metrics import mean_absolute_error

    df = pd.read_csv(config.FEATURES_PATH, low_memory=False)
    df = add_cumulative_playtime(df)

    season_order = {s: i for i, s in enumerate(config.HISTORICAL_SEASONS)}
    df["season_rank"] = df["season"].map(season_order)
    df["global_order"] = df["season_rank"] * 100 + df["GW"]

    print("\n" + "=" * 60)
    print(f"SHRINKAGE-K TEST (early gameweeks 1-{early_gw_cutoff}, minutes-weighted effective games)")
    print("PROPER WALK-FORWARD: retrains before every early gameweek, same as main backtest")
    print("=" * 60)

    preds_by_k = {k: [] for k in k_candidates}
    actuals_by_k = {k: [] for k in k_candidates}

    seasons = config.HISTORICAL_SEASONS
    for i in range(1, len(seasons)):
        prior_season, this_season = seasons[i - 1], seasons[i]
        snapshot = get_season_final_snapshot(df, prior_season)
        snapshot_renamed = snapshot.rename(columns={c: f"{c}_prior" for c in config.FEATURE_COLS})

        for gw in range(1, early_gw_cutoff + 1):
            gw_rows = df[(df["season"] == this_season) & (df["GW"] == gw)]
            if len(gw_rows) == 0:
                continue
            cutoff_order = gw_rows["global_order"].iloc[0]

            train_df = df[df["global_order"] < cutoff_order]
            X_train = prepare_features(train_df)
            y_train = train_df[config.TARGET_COL]
            sample_weight = get_season_sample_weights(train_df)
            model = RandomForestRegressor(**config.RF_PARAMS)
            model.fit(X_train, y_train, sample_weight=sample_weight)
            train_cols = X_train.columns

            early_rows_base = gw_rows.copy().merge(snapshot_renamed, on="name", how="left")
            print(f"  Trained for {this_season} GW{gw} ({len(train_df)} rows)")

            # Baseline: current production formula (games_played / 5, capped at 1.0)
            baseline_rows = early_rows_base.copy()
            games_weight = (baseline_rows["games_played_so_far"] / 5).clip(upper=1.0)
            for col in config.FEATURE_COLS:
                prior_col = f"{col}_prior"
                current_val = baseline_rows[col].fillna(0) if col in baseline_rows.columns else 0
                prior_val = baseline_rows[prior_col].fillna(0) if prior_col in baseline_rows.columns else 0
                baseline_rows[col] = games_weight * current_val + (1 - games_weight) * prior_val
            X_baseline = prepare_features(baseline_rows).reindex(columns=train_cols, fill_value=0)
            baseline_preds = model.predict(X_baseline)
            preds_by_k.setdefault("CURRENT (games/5)", []).extend(baseline_preds)
            actuals_by_k.setdefault("CURRENT (games/5)", []).extend(baseline_rows[config.TARGET_COL].values)

            for k in k_candidates:
                early_rows = early_rows_base.copy()
                n_effective = early_rows["minutes_played_so_far"] / 90
                weight_current = n_effective / (n_effective + k)

                for col in config.FEATURE_COLS:
                    prior_col = f"{col}_prior"
                    current_val = early_rows[col].fillna(0) if col in early_rows.columns else 0
                    prior_val = early_rows[prior_col].fillna(0) if prior_col in early_rows.columns else 0
                    early_rows[col] = weight_current * current_val + (1 - weight_current) * prior_val

                X = prepare_features(early_rows).reindex(columns=train_cols, fill_value=0)
                preds = model.predict(X)
                preds_by_k[k].extend(preds)
                actuals_by_k[k].extend(early_rows[config.TARGET_COL].values)

    print("\n--- Results (leakage-safe, proper walk-forward) ---")
    results = {}
    all_keys = ["CURRENT (games/5)"] + list(k_candidates)
    for key in all_keys:
        mae = mean_absolute_error(actuals_by_k[key], preds_by_k[key])
        results[key] = mae
        label = key if isinstance(key, str) else f"k={key:5.2f}"
        print(f"  {label}: MAE {mae:.4f}")

    best_key = min(results, key=results.get)
    best_label = best_key if isinstance(best_key, str) else f"k={best_key}"
    print(f"\nBest: {best_label} (MAE {results[best_key]:.4f})")
    return results


def run_bench_weight_optimization(
    reliability_weights=(0, 0.25, 0.5, 0.75, 1.0),
    points_weights=(0, 0.15, 0.3, 0.5),
    test_seasons=("2022-23", "2023-24", "2024-25"),
):
    """
    Validates BENCH_RELIABILITY_WEIGHT / BENCH_POINTS_WEIGHT the same way
    everything else in this project was validated: simulate the actual
    strategy against real historical outcomes, don't guess.

    For each test season, walk forward gameweek by gameweek using properly
    backtested (leakage-free) Random Forest predictions to build a squad
    under each weight combination, then measure the squad's ACTUAL realized
    points that gameweek (not predicted). Results are aggregated across all
    test seasons for a more robust conclusion than any single season alone.
    """
    from src.model import load_data_with_order, walk_forward_backtest
    from src.optimizer import optimize_squad
    from sklearn.ensemble import RandomForestRegressor

    df = load_data_with_order()

    grid_results_by_season = {}
    for test_season in test_seasons:
        print(f"\nGenerating leakage-free predictions for {test_season} (Random Forest)...")
        results, mae, rmse = walk_forward_backtest(
            df, RandomForestRegressor, config.RF_PARAMS, "RF", test_season=test_season
        )
        print(f"({test_season} baseline MAE: {mae:.3f})")

        season_df = df[df["season"] == test_season].copy()
        merged = results.merge(
            season_df[["element", "GW", "position", "team", "value", "minutes_avg_last3"]],
            on=["element", "GW"], how="left",
        )
        merged["price"] = merged["value"] / 10
        merged["status"] = "a"
        merged["blended_avg_minutes"] = merged["minutes_avg_last3"].fillna(0)
        merged["zero_games_flag"] = False

        print(f"\n{'=' * 60}")
        print(f"BENCH WEIGHT GRID SEARCH — {test_season}")
        print("=" * 60)

        gameweeks = sorted(merged["GW"].unique())
        grid_results = {}
        for rw in reliability_weights:
            for pw in points_weights:
                season_total = 0
                for gw in gameweeks:
                    gw_pool = merged[merged["GW"] == gw].reset_index(drop=True)
                    try:
                        pool, result = optimize_squad(gw_pool, budget=100.0, min_avg_minutes=0,
                                                        reliability_weight=rw, points_weight=pw)
                    except Exception:
                        continue
                    xi_actual = pool.loc[result["start_ids"], "total_points"].sum()
                    captain_bonus = pool.loc[result["captain_id"], "total_points"]
                    season_total += xi_actual + captain_bonus
                grid_results[(rw, pw)] = season_total
                print(f"  reliability={rw:.2f}, points={pw:.2f}  ->  realized points: {season_total:.0f}")

        grid_results_by_season[test_season] = grid_results

    print("\n" + "=" * 60)
    print("AGGREGATED ACROSS ALL TEST SEASONS")
    print("=" * 60)
    aggregated = {}
    for rw in reliability_weights:
        for pw in points_weights:
            total = sum(grid_results_by_season[s][(rw, pw)] for s in test_seasons)
            aggregated[(rw, pw)] = total
            print(f"  reliability={rw:.2f}, points={pw:.2f}  ->  TOTAL across seasons: {total:.0f}")

    best_combo = max(aggregated, key=aggregated.get)
    print(f"\nBest combo overall: reliability={best_combo[0]}, points={best_combo[1]} "
          f"({aggregated[best_combo]:.0f} total realized points)")
    return grid_results_by_season, aggregated
    """
    Direct comparison: single shared Random Forest (with position dummies)
    vs four separate position-specific Random Forests. Only tests Random
    Forest, since that's our production model — no need to re-validate
    Ridge/XGBoost here.
    """
    from src.model import load_data_with_order, walk_forward_backtest, walk_forward_backtest_per_position
    from sklearn.ensemble import RandomForestRegressor

    df = load_data_with_order()

    print("\n" + "=" * 60)
    print("COMPARISON: shared Random Forest vs per-position Random Forests")
    print("=" * 60)

    _, mae_shared, rmse_shared = walk_forward_backtest(
        df, RandomForestRegressor, config.RF_PARAMS, "RF (shared model)"
    )
    _, mae_per_pos, rmse_per_pos = walk_forward_backtest_per_position(
        df, RandomForestRegressor, config.RF_PARAMS, "RF"
    )

    print("\n=== PER-POSITION MODEL RESULT ===")
    print(f"Shared model:      MAE {mae_shared:.4f}, RMSE {rmse_shared:.4f}")
    print(f"Per-position:      MAE {mae_per_pos:.4f}, RMSE {rmse_per_pos:.4f}")
    diff = mae_per_pos - mae_shared
    if diff > 0:
        print(f"\nPer-position models are WORSE by {diff:.4f} — shared model generalizes better.")
    else:
        print(f"\nPer-position models are BETTER by {-diff:.4f} — worth switching to production.")


def print_per_position_feature_importances():
    """Train the 4 position-specific models and show what each one learned
    to weight most — validates whether per-position modeling actually
    discovers sensible, position-relevant patterns (e.g. clean sheets
    mattering more for defenders than forwards)."""
    from src.model import train_position_models

    print("\n" + "=" * 60)
    print("PER-POSITION FEATURE IMPORTANCES")
    print("=" * 60)

    models = train_position_models()
    for position, (model, columns) in models.items():
        importances = pd.Series(model.feature_importances_, index=columns)
        importances = importances.sort_values(ascending=False)
        print(f"\n--- {position} ---")
        for feat, imp in importances.head(10).items():
            bar = "#" * int(imp * 200)
            print(f"{feat:35s} {imp:.4f}  {bar}")


INTERACTION_PAIRS = {
    "clean_sheets_avg_last3": ["pos_GKP", "pos_DEF"],
    "clean_sheets_avg_last5": ["pos_GKP", "pos_DEF"],
    "defensive_contribution_avg_last3": ["pos_DEF", "pos_MID"],
    "defensive_contribution_avg_last5": ["pos_DEF", "pos_MID"],
    "goals_scored_avg_last3": ["pos_FWD", "pos_MID"],
    "goals_scored_avg_last5": ["pos_FWD", "pos_MID"],
    "assists_avg_last3": ["pos_MID", "pos_FWD"],
    "assists_avg_last5": ["pos_MID", "pos_FWD"],
}


def add_interaction_features(X):
    """Multiply key stats by relevant position dummies, so a shared model can
    weight e.g. clean sheets differently for defenders vs forwards, without
    losing the full shared training set the way separate models would."""
    X = X.copy()
    for base_feat, pos_cols in INTERACTION_PAIRS.items():
        for pos_col in pos_cols:
            if base_feat in X.columns and pos_col in X.columns:
                X[f"{base_feat}_x_{pos_col}"] = X[base_feat] * X[pos_col]
    return X


def run_interaction_features_test():
    """
    Compares the shared model with vs without explicit stat x position
    interaction terms (e.g. clean_sheets x is_defender). Random Forest can
    already learn such interactions via sequential splits, so this checks
    whether spelling them out explicitly still helps in practice.
    """
    from src.model import (
        load_data_with_order, prepare_features, get_season_sample_weights,
        config as model_config,
    )
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.metrics import mean_absolute_error, mean_squared_error
    import numpy as np

    df = load_data_with_order()
    test_season = config.BACKTEST_TEST_SEASON
    test_gameweeks = sorted(df[df["season"] == test_season]["GW"].unique())

    print("\n" + "=" * 60)
    print("COMPARISON: shared model with vs without stat x position interactions")
    print("=" * 60)

    for label, use_interactions in [("WITHOUT interactions", False), ("WITH interactions", True)]:
        all_predictions = []
        for gw in test_gameweeks:
            cutoff_order = df[(df["season"] == test_season) & (df["GW"] == gw)]["global_order"].iloc[0]
            train_df = df[df["global_order"] < cutoff_order]
            predict_df = df[(df["season"] == test_season) & (df["GW"] == gw)]
            if len(train_df) == 0 or len(predict_df) == 0:
                continue

            X_train = prepare_features(train_df)
            X_predict = prepare_features(predict_df)
            if use_interactions:
                X_train = add_interaction_features(X_train)
                X_predict = add_interaction_features(X_predict)
            X_train, X_predict = X_train.align(X_predict, join="outer", axis=1, fill_value=0)

            y_train = train_df[config.TARGET_COL]
            sample_weight = get_season_sample_weights(train_df)
            model = RandomForestRegressor(**config.RF_PARAMS)
            model.fit(X_train, y_train, sample_weight=sample_weight)
            preds = model.predict(X_predict)

            result = predict_df[["element", "name", "season", "GW", config.TARGET_COL]].copy()
            result["predicted_points"] = preds
            all_predictions.append(result)

        all_results = pd.concat(all_predictions, ignore_index=True)
        mae = mean_absolute_error(all_results[config.TARGET_COL], all_results["predicted_points"])
        rmse = np.sqrt(mean_squared_error(all_results[config.TARGET_COL], all_results["predicted_points"]))
        print(f"{label}: MAE {mae:.4f}, RMSE {rmse:.4f}")


if __name__ == "__main__":
    import sys as _sys
    print_feature_importances()
    if "ablation" in _sys.argv:
        run_value_ablation_test()
    elif "per-position" in _sys.argv:
        run_per_position_comparison()
    elif "per-position-importance" in _sys.argv:
        print_per_position_feature_importances()
    elif "interactions" in _sys.argv:
        run_interaction_features_test()
    elif "shrinkage" in _sys.argv:
        run_shrinkage_k_test()
    elif "bench-weights" in _sys.argv:
        run_bench_weight_optimization()
    else:
        print("\n(Skipping value ablation test — already confirmed price helps. "
              "Run 'python -m src.diagnostics ablation' to redo that comparison.)")
        print("(Run 'python -m src.diagnostics per-position' to compare shared vs "
              "per-position models.)")
        print("(Run 'python -m src.diagnostics per-position-importance' to see what "
              "each position-specific model actually learned to weight.)")
        print("(Run 'python -m src.diagnostics interactions' to test stat x position "
              "interaction features.)")
        print("(Run 'python -m src.diagnostics shrinkage' to find the best shrinkage-k "
              "value for early-season blending.)")
