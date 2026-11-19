# FPL Points Prediction & Squad Optimizer

A machine learning system that predicts Fantasy Premier League player points
and uses linear optimization to select an optimal squad, starting XI,
captain, and transfers — validated via a leakage-safe walk-forward backtest
on a full past season.

https://fpl-predictor-dashboard.vercel.app/

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
- [x] Team-state tracking (current squad, bank, free transfers, chips used)
- [x] Transfer recommendation engine (LP solver, 1.0-point minimum gain hurdle, explicit BANK logic)
- [x] Chip-strategy logic (Triple Captain dynamic percentile threshold schedule; Wildcard, Free Hit, Bench Boost placeholders)
- [x] Single weekly entry point script (`run_weekly.py`)
- [x] Web Dashboard (Go serverless API + FPL-themed static frontend for Vercel deployment)

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
config.py                  # all constants, paths, tunable weights
run_weekly.py              # weekly entry point orchestrator
src/
  data_loading.py          # Stage 1: pull historical data
  cleaning.py              # Stage 2: clean & standardize
  feature_engineering.py    # Stage 3: features + leakage checks
  model.py                 # Stage 4: training + backtest
  team_state.py            # team state tracker (squad, bank, chips, FTs)
  optimizer.py             # PuLP squad & starting XI linear solver
  captaincy.py             # captaincy model (predicted pts + threat + FDR)
  transfer_engine.py       # LP transfer engine with 1.0-point hurdle
  triple_captain.py        # dynamic threshold loosening model
export/
  export_dashboard_data.py # pipeline exporter: writes typed JSON into data/dashboard/
data/
  raw/                     # raw pulled historical data
  processed/               # cleaned data + final feature set
  outputs/                 # weekly squad/prediction outputs
  dashboard/               # verified JSON data feeds for dashboard & Go API
api/                       # Go serverless API endpoints for Vercel
  overview/index.go        # GET /api/overview
  squad/index.go           # GET /api/squad
  transfers/index.go       # GET /api/transfers
  captaincy/index.go       # GET /api/captaincy
  chips/index.go           # GET /api/chips
  players/index.go         # GET /api/players (search, filter, sort, paginate)
  validation/index.go      # GET /api/validation
  fixtures/index.go        # GET /api/fixtures
cmd/server/main.go         # local development Go web server
internal/                  # Go internal packages (models, store, fplapi)
public/                    # static frontend (HTML, CSS, JS)
  index.html               # SPA shell with official FPL layout & theme toggle
  css/                     # style.css (FPL design tokens) & pitch.css (turf pitch)
  js/                      # modular JS components and page renderers
vercel.json                # Vercel deployment configuration
```

## Interactive Web Dashboard

A responsive, high-performance web dashboard styled with official Fantasy Premier League branding (deep purple `#38003c`, electric green `#00ff85`, cyan `#04f5ff`, and magenta `#e90052`).

### Dashboard Pages
1. **Overview**: Gameweek headline recommendations (Captain, Transfer Move or Bank, Triple Captain status), team state bar (Bank, Free Transfers, Value, Chips), and squad points breakdown.
2. **Squad**: Signature football pitch visualization rendering the starting XI in 3-4-3 formation, captain/vice armbands, substitute bench shelf, and Premier League max-3 club limit compliance chips.
3. **Transfers**: Linear programming transfer strategy with visual comparison against the **1.0-point hurdle** to act and an explicit **BANK** recommendation.
4. **Captaincy**: Ranked candidates with custom stacked bar breakdowns (base predicted points + explosive goal threat + fixture difficulty adjustment).
5. **Chips**: Dynamic Triple Captain threshold schedule chart (loosening from 95th percentile down to 60th percentile across season halves) with live trigger status, plus clean placeholder cards for unbuilt chips (Wildcard, Free Hit, Bench Boost).
6. **Player Explorer**: Searchable and filterable database table (position, club, price range, rotation risk, form, minutes) with an in-depth slide-in drawer detailing the Bayesian shrinkage formula $w = n / (n + 0.1)$.
7. **Model & Validation (Portfolio Centerpiece)**: Full 2024-25 walk-forward backtest MAE by gameweek (Random Forest vs XGBoost vs Ridge), feature importance bars, leakage check verification (including the 2 caught bugs), and 6 documented "Tested and Rejected" hypotheses with empirical metrics.

---

## How to Refresh Data

The Python pipeline remains the absolute source of truth for predictions, optimization, transfers, and chips. The Go backend reads pre-computed JSON files from `data/dashboard/` and serves them as fast serverless endpoints.

Whenever a new gameweek finishes or you run a new prediction:

1. **Run the Dashboard Export Script**:
   ```bash
   python export/export_dashboard_data.py
   ```
   This generates all 7 dashboard JSON payloads in `data/dashboard/`:
   - `overview.json`
   - `squad.json`
   - `transfers.json`
   - `captaincy.json`
   - `chips.json`
   - `players.json`
   - `validation.json`

2. **Commit and Push to Git**:
   ```bash
   git add data/dashboard/
   git commit -m "Update FPL dashboard data for Gameweek X"
   git push origin main
   ```

3. **Automatic Redeployment**:
   Vercel detects the new git commit, automatically packages the updated JSON files via `includeFiles` in `vercel.json`, and redeploys the dashboard in seconds.

---

## Local Development & Testing

### Running the Python Pipeline
```bash
pip install -r requirements.txt

python src/data_loading.py
python src/cleaning.py
python src/feature_engineering.py
python src/model.py          # backtest / model comparison
python src/optimizer.py      # build live squad
python src/captaincy.py 5    # captaincy recommendation
python export/export_dashboard_data.py
```

### Running the Go Server & Dashboard Locally
Ensure Go (1.22+) is installed, or use the local toolchain:

```bash
# Run unit tests (verifies all Go API endpoints)
go test -v ./api

# Start local web server (serves frontend on port 8080)
go run ./cmd/server
```
Visit `http://localhost:8080` in your web browser.

---

## Deploying to Vercel

The project is pre-configured with `vercel.json` for zero-friction serverless deployment:

1. Install the Vercel CLI (or link your GitHub repository in the Vercel Dashboard):
   ```bash
   npm i -g vercel
   ```
2. Deploy to preview:
   ```bash
   vercel
   ```
3. Deploy to production:
   ```bash
   vercel --prod
   ```
Vercel automatically compiles the Go functions under `/api` and serves the static assets in `/public`. The `includeFiles` directive ensures `data/dashboard/**` is bundled with each serverless function.

---

## Author

Built by Rohan Holikatti as a placement portfolio project. GitHub: `rohan216h/fpl-predictor`.
