"""
src/model.py — Stage 4: model training and walk-forward backtest.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor
from xgboost import XGBRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
import config


def load_data_with_order():
    df = pd.read_csv(config.FEATURES_PATH, low_memory=False)
    season_order = {s: i for i, s in enumerate(sorted(df["season"].unique()))}
    df["season_rank"] = df["season"].map(season_order)
    df["global_order"] = df["season_rank"] * 100 + df["GW"]
    return df


def get_season_sample_weights(df):
    """
    Exponential recency weighting: the most recent season in
    config.HISTORICAL_SEASONS gets weight 1.0, each season further back is
    multiplied by SEASON_RECENCY_DECAY again. Applied to sample_weight in
    model.fit() so recent seasons influence learned patterns more.
    """
    season_order = {s: i for i, s in enumerate(config.HISTORICAL_SEASONS)}
    latest_rank = len(config.HISTORICAL_SEASONS) - 1
    weights = df["season"].map(season_order).apply(
        lambda rank: config.SEASON_RECENCY_DECAY ** (latest_rank - rank)
    )
    return weights.values


POSITIONS = ["GKP", "DEF", "MID", "FWD"]


def train_position_models(model_class=RandomForestRegressor, model_kwargs=None, df=None):
    """
    Train FOUR separate models, one per position, instead of one shared model
    with a position flag. Each model learns feature importances specific to
    that position's scoring patterns (e.g. clean sheets mattering more for
    defenders) without being diluted by other positions' data.
    Returns {position: (model, feature_columns)}.
    """
    model_kwargs = model_kwargs or config.RF_PARAMS
    if df is None:
        df = pd.read_csv(config.FEATURES_PATH, low_memory=False)

    models = {}
    for position in POSITIONS:
        pos_df = df[df["position"] == position]
        X = pos_df[config.FEATURE_COLS].fillna(0)  # no position dummies needed — single position
        y = pos_df[config.TARGET_COL]
        sample_weight = get_season_sample_weights(pos_df)
        model = model_class(**model_kwargs)
        model.fit(X, y, sample_weight=sample_weight)
        models[position] = (model, X.columns)
    return models


def walk_forward_backtest_per_position(df, model_class, model_kwargs, model_name, test_season=None):
    """Same walk-forward validation as walk_forward_backtest, but trains 4
    separate position-specific models at each gameweek instead of 1 shared model."""
    test_season = test_season or config.BACKTEST_TEST_SEASON
    test_df = df[df["season"] == test_season].copy()
    test_gameweeks = sorted(test_df["GW"].unique())

    all_predictions = []
    print(f"\n=== {model_name} (per-position): walk-forward backtest on {test_season} ===")
    for gw in test_gameweeks:
        cutoff_order = df[(df["season"] == test_season) & (df["GW"] == gw)]["global_order"].iloc[0]
        train_df = df[df["global_order"] < cutoff_order]
        predict_df = df[(df["season"] == test_season) & (df["GW"] == gw)]
        if len(train_df) == 0 or len(predict_df) == 0:
            continue

        gw_predictions = []
        for position in POSITIONS:
            pos_train = train_df[train_df["position"] == position]
            pos_predict = predict_df[predict_df["position"] == position]
            if len(pos_train) == 0 or len(pos_predict) == 0:
                continue

            X_train = pos_train[config.FEATURE_COLS].fillna(0)
            y_train = pos_train[config.TARGET_COL]
            X_predict = pos_predict[config.FEATURE_COLS].fillna(0)
            sample_weight = get_season_sample_weights(pos_train)

            model = model_class(**model_kwargs)
            model.fit(X_train, y_train, sample_weight=sample_weight)
            preds = model.predict(X_predict)

            result = pos_predict[["element", "name", "season", "GW", config.TARGET_COL]].copy()
            result["predicted_points"] = preds
            gw_predictions.append(result)

        gw_result = pd.concat(gw_predictions, ignore_index=True)
        all_predictions.append(gw_result)
        mae_gw = mean_absolute_error(gw_result[config.TARGET_COL], gw_result["predicted_points"])
        print(f"  GW{gw}: MAE={mae_gw:.3f}")

    all_results = pd.concat(all_predictions, ignore_index=True)
    overall_mae = mean_absolute_error(all_results[config.TARGET_COL], all_results["predicted_points"])
    overall_rmse = np.sqrt(mean_squared_error(all_results[config.TARGET_COL], all_results["predicted_points"]))
    print(f"{model_name} (per-position) OVERALL — MAE: {overall_mae:.3f}, RMSE: {overall_rmse:.3f}")
    return all_results, overall_mae, overall_rmse


def prepare_features(df, feature_cols=None):
    feature_cols = feature_cols or config.FEATURE_COLS
    X = df[feature_cols].copy()
    position_dummies = pd.get_dummies(df["position"], prefix="pos")
    X = pd.concat([X, position_dummies], axis=1)
    return X.fillna(0)


def walk_forward_backtest(df, model_class, model_kwargs, model_name, test_season=None, feature_cols=None):
    test_season = test_season or config.BACKTEST_TEST_SEASON
    test_df = df[df["season"] == test_season].copy()
    test_gameweeks = sorted(test_df["GW"].unique())

    all_predictions = []
    print(f"\n=== {model_name}: walk-forward backtest on {test_season} ===")
    for gw in test_gameweeks:
        cutoff_order = df[(df["season"] == test_season) & (df["GW"] == gw)]["global_order"].iloc[0]
        train_df = df[df["global_order"] < cutoff_order]
        predict_df = df[(df["season"] == test_season) & (df["GW"] == gw)]
        if len(train_df) == 0 or len(predict_df) == 0:
            continue

        X_train = prepare_features(train_df, feature_cols)
        y_train = train_df[config.TARGET_COL]
        X_predict = prepare_features(predict_df, feature_cols)
        X_train, X_predict = X_train.align(X_predict, join="outer", axis=1, fill_value=0)

        model = model_class(**model_kwargs)
        sample_weight = get_season_sample_weights(train_df)
        model.fit(X_train, y_train, sample_weight=sample_weight)
        preds = model.predict(X_predict)

        result = predict_df[["element", "name", "season", "GW", config.TARGET_COL]].copy()
        result["predicted_points"] = preds
        all_predictions.append(result)

        mae_gw = mean_absolute_error(result[config.TARGET_COL], result["predicted_points"])
        print(f"  GW{gw}: MAE={mae_gw:.3f}")

    all_results = pd.concat(all_predictions, ignore_index=True)
    overall_mae = mean_absolute_error(all_results[config.TARGET_COL], all_results["predicted_points"])
    overall_rmse = np.sqrt(mean_squared_error(all_results[config.TARGET_COL], all_results["predicted_points"]))
    print(f"{model_name} OVERALL — MAE: {overall_mae:.3f}, RMSE: {overall_rmse:.3f}")
    return all_results, overall_mae, overall_rmse


def train_final_model(model_class=RandomForestRegressor, model_kwargs=None):
    """Train on ALL available history — used for live/current predictions, not backtesting."""
    model_kwargs = model_kwargs or config.RF_PARAMS
    df = pd.read_csv(config.FEATURES_PATH, low_memory=False)
    X = prepare_features(df)
    y = df[config.TARGET_COL]
    sample_weight = get_season_sample_weights(df)
    model = model_class(**model_kwargs)
    model.fit(X, y, sample_weight=sample_weight)
    return model, X.columns


if __name__ == "__main__":
    df = load_data_with_order()
    print("Loaded:", df.shape)

    ridge_results, ridge_mae, ridge_rmse = walk_forward_backtest(
        df, Ridge, config.RIDGE_PARAMS, "Ridge Regression"
    )
    rf_results, rf_mae, rf_rmse = walk_forward_backtest(
        df, RandomForestRegressor, config.RF_PARAMS, "Random Forest"
    )
    xgb_results, xgb_mae, xgb_rmse = walk_forward_backtest(
        df, XGBRegressor, config.XGB_PARAMS, "XGBoost"
    )

    print("\n=== COMPARISON ===")
    print(f"Ridge         — MAE: {ridge_mae:.3f}, RMSE: {ridge_rmse:.3f}")
    print(f"Random Forest — MAE: {rf_mae:.3f}, RMSE: {rf_rmse:.3f}")
    print(f"XGBoost       — MAE: {xgb_mae:.3f}, RMSE: {xgb_rmse:.3f}")
