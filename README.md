# FPL Points Prediction & Squad Optimizer

A machine learning system that predicts Fantasy Premier League player points
and uses linear optimization to select an optimal squad, starting XI,
captain, and transfers — validated via a leakage-safe walk-forward backtest
on a full past season.

## Project status

This project is under active development, built out phase by phase.
Current status:

- [x] Data pipeline (historical gameweek data, 2020-21 to 2025-26)
- [x] Leakage-safe feature engineering (rolling form, fixture difficulty,
      double-gameweek handling — verified via automated leakage checks)
- [x] Model comparison: Ridge, Random Forest, XGBoost (walk-forward backtest
      on the 2024-25 season)
- [x] Squad optimizer (PuLP linear programming: budget, formation, and
      max-3-per-team constraints)
- [x] Current-season blending (live 2026-27 data blended with prior-season
      form, weighted by games played, to avoid early-season sample noise)
- [x] Captaincy recommendation (goal threat + fixture difficulty)
- [ ] Team-state tracking (current squad, bank, free transfers, chips used)
- [ ] Transfer recommendation engine (weighing point gain vs -4 hit cost)
- [ ] Chip-strategy logic (Wildcard / Free Hit / Bench Boost / Triple Captain)
- [ ] Single weekly entry point script

## Methodology

### Data

Historical gameweek-by-gameweek data (2020-21 through 2025-26) is sourced
from the [vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League)
public dataset. The 2019-20 season is excluded due to missing position/team
columns.

### Leakage prevention

Every feature is built to use **only data strictly before** the gameweek
being predicted. This is enforced two ways:

1. Rolling features are computed with `shift(1)` before the rolling window,
   so a gameweek's own result never leaks into its own feature.
2. An automated check independently recomputes a sample of rolling features
   from scratch (via manual filtering, not the shift/rolling pipeline) and
   asserts the two match — the pipeline fails loudly if they don't.

Two real bugs were caught and fixed this way during development:
double-gameweeks being treated as separate rows (corrupting the rolling
window), and rolling form incorrectly bleeding across season boundaries.

### Backtesting

Models are evaluated via **walk-forward validation** on the 2024-25 season:
for each gameweek, the model is retrained on all data strictly before it,
then used to predict that gameweek only. This exactly mirrors how the model
is used live — it never sees the future.

| Model | MAE | RMSE |
|---|---|---|
| Ridge Regression | 1.047 | 1.972 |
| Random Forest | **1.027** | **1.956** |
| XGBoost | 1.031 | 1.958 |

### Live squad building

For building a real squad, the model blends each player's actual
current-season form with their prior-season form, weighted by how many
games they've played this season (full trust in current form once they've
played 5+ games). This avoids overreacting to small-sample noise early in
a new season while still adapting quickly as real data accumulates.

### Optimization

Squad selection is solved as a linear program (via
[PuLP](https://coin-or.github.io/pulp/)), maximizing total predicted points
subject to: £100m budget, 2 GKP / 5 DEF / 5 MID / 3 FWD squad composition,
max 3 players per real team, and valid starting XI formation rules.

## Project structure

```
config.py              # all constants, paths, tunable weights
src/
  data_loading.py       # Stage 1: pull historical data
  cleaning.py            # Stage 2: clean & standardize
  feature_engineering.py # Stage 3: features + leakage checks
  model.py                # Stage 4: training + backtest
  team_state.py            # current squad/bank/transfers/chips (in progress)
  optimizer.py              # squad/XI selection
  captaincy.py               # captaincy recommendation
  chip_strategy.py            # chip-usage logic (planned)
data/
  raw/           # raw pulled data
  processed/     # cleaned data + final feature set
  outputs/       # weekly squad/prediction outputs
```

## Running it

```bash
pip install -r requirements.txt

python src/data_loading.py
python src/cleaning.py
python src/feature_engineering.py
python src/model.py          # backtest / model comparison
python src/optimizer.py      # build a live squad
python src/captaincy.py 4    # captaincy recommendation for gameweek 4
```

## Author

Built by Rohan Holikatti as a placement portfolio project.
