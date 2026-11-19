package models

// TeamState represents the FPL team snapshot.
type TeamState struct {
	TeamName       string   `json:"team_name"`
	Bank           float64  `json:"bank"`
	TeamValue      float64  `json:"team_value"`
	FreeTransfers  int      `json:"free_transfers"`
	ChipsAvailable []string `json:"chips_available"`
	ChipsUsed      []string `json:"chips_used"`
}

// HeadlineCaptain represents the captain pick in Overview.
type HeadlineCaptain struct {
	Name              string  `json:"name"`
	Team              string  `json:"team"`
	PredictedPoints   float64 `json:"predicted_points"`
	CaptaincyScore    float64 `json:"captaincy_score"`
	FixtureDifficulty int     `json:"fixture_difficulty"`
}

// HeadlineTransfer represents the recommended transfer in Overview.
type HeadlineTransfer struct {
	Action     string  `json:"action"`
	Transfers  int     `json:"transfers"`
	Gain       float64 `json:"gain"`
	NetBenefit float64 `json:"net_benefit"`
	Rationale  string  `json:"rationale"`
}

// HeadlineTripleCaptain represents the TC recommendation in Overview.
type HeadlineTripleCaptain struct {
	Recommendation string  `json:"recommendation"`
	Candidate      string  `json:"candidate"`
	Score          float64 `json:"score"`
	Threshold      float64 `json:"threshold"`
	Explanation    string  `json:"explanation"`
}

// OverviewSquadSummary represents the squad points and budget roll-up.
type OverviewSquadSummary struct {
	Formation              string  `json:"formation"`
	StartersPredictedPoints float64 `json:"starters_predicted_points"`
	CaptainBonusPoints     float64 `json:"captain_bonus_points"`
	TotalPredictedPoints   float64 `json:"total_predicted_points"`
	BenchPredictedPoints   float64 `json:"bench_predicted_points"`
	BudgetCap              float64 `json:"budget_cap"`
	BudgetUsed             float64 `json:"budget_used"`
	BankRemaining          float64 `json:"bank_remaining"`
}

// LiveDeadline represents countdown and status for the upcoming gameweek deadline.
type LiveDeadline struct {
	Gameweek          int    `json:"gameweek"`
	GameweekName      string `json:"gameweek_name"`
	DeadlineTime      string `json:"deadline_time"`
	DeadlineTimeEpoch int64  `json:"deadline_time_epoch"`
	SecondsRemaining  int64  `json:"seconds_remaining"`
	IsLive            bool   `json:"is_live"`
}

// LiveFixtureItem represents an upcoming match with FDR fixture difficulty ratings.
type LiveFixtureItem struct {
	ID             int    `json:"id"`
	Gameweek       int    `json:"gameweek"`
	HomeTeam       string `json:"home_team"`
	HomeTeamShort  string `json:"home_team_short"`
	AwayTeam       string `json:"away_team"`
	AwayTeamShort  string `json:"away_team_short"`
	HomeDifficulty int    `json:"home_difficulty"`
	AwayDifficulty int    `json:"away_difficulty"`
	KickoffTime    string `json:"kickoff_time"`
	Started        bool   `json:"started"`
	Finished       bool   `json:"finished"`
}

// OverviewPayload is the response model for /api/overview.
type OverviewPayload struct {
	Gameweek                int               `json:"gameweek"`
	Season                  string            `json:"season"`
	Deadline                *LiveDeadline     `json:"deadline,omitempty"`
	Fixtures                []LiveFixtureItem `json:"fixtures,omitempty"`
	TeamState               TeamState         `json:"team_state"`
	HeadlineRecommendations struct {
		Captain       HeadlineCaptain       `json:"captain"`
		Transfer      HeadlineTransfer      `json:"transfer"`
		TripleCaptain HeadlineTripleCaptain `json:"triple_captain"`
	} `json:"headline_recommendations"`
	SquadSummary OverviewSquadSummary `json:"squad_summary"`
}

// SquadPlayer represents an individual player card in squad/lineup views.
type SquadPlayer struct {
	FplID             int     `json:"fpl_id"`
	WebName           string  `json:"web_name"`
	FullName          string  `json:"full_name"`
	Position          string  `json:"position"`
	Team              string  `json:"team"`
	Price             float64 `json:"price"`
	PredictedPoints   float64 `json:"predicted_points"`
	FixtureDifficulty int     `json:"fixture_difficulty"`
	IsCaptain         bool    `json:"is_captain"`
	IsViceCaptain     bool    `json:"is_vice_captain"`
	Role              string  `json:"role"`
	BenchOrder        int     `json:"bench_order,omitempty"`
}

// SquadPayload is the response model for /api/squad.
type SquadPayload struct {
	Formation        string          `json:"formation"`
	BudgetCap        float64         `json:"budget_cap"`
	BudgetUsed       float64         `json:"budget_used"`
	BankRemaining    float64         `json:"bank_remaining"`
	TeamDistribution map[string]int  `json:"team_distribution"`
	StartingXI       []SquadPlayer   `json:"starting_xi"`
	Bench            []SquadPlayer   `json:"bench"`
	CaptainID        int             `json:"captain_id"`
	ViceID           int             `json:"vice_id"`
}

// TransferPlayerItem represents a player in a transfer move.
type TransferPlayerItem struct {
	FplID         int     `json:"fpl_id"`
	WebName       string  `json:"web_name"`
	Position      string  `json:"position"`
	Team          string  `json:"team"`
	Price         float64 `json:"price"`
	TransferScore float64 `json:"transfer_score"`
}

// TransferOption represents one candidate number of transfers (0 to 5).
type TransferOption struct {
	Transfers  int                  `json:"transfers"`
	Gain       float64              `json:"gain"`
	NetBenefit float64              `json:"net_benefit"`
	HitsTaken  int                  `json:"hits_taken"`
	HitCost    int                  `json:"hit_cost"`
	OutPlayers []TransferPlayerItem `json:"out_players"`
	InPlayers  []TransferPlayerItem `json:"in_players"`
	Action     string               `json:"action,omitempty"`
	Rationale  string               `json:"rationale,omitempty"`
}

// TransfersPayload is the response model for /api/transfers.
type TransfersPayload struct {
	Gameweek              int              `json:"gameweek"`
	FreeTransfersAvailable int              `json:"free_transfers_available"`
	MinGainThreshold      float64          `json:"min_gain_threshold"`
	IsBanked              bool             `json:"is_banked"`
	Recommended           TransferOption   `json:"recommended"`
	OptionsEvaluated      []TransferOption `json:"options_evaluated"`
}

// CaptainCandidate represents a player evaluated for the armband.
type CaptainCandidate struct {
	FplID               int     `json:"fpl_id"`
	WebName             string  `json:"web_name"`
	FullName            string  `json:"full_name"`
	Position            string  `json:"position"`
	Team                string  `json:"team"`
	Price               float64 `json:"price"`
	PredictedPoints     float64 `json:"predicted_points"`
	GoalsScoredAvgLast5 float64 `json:"goals_scored_avg_last5"`
	GoalThreatBonus     float64 `json:"goal_threat_bonus"`
	FixtureDifficulty   int     `json:"fixture_difficulty"`
	FixtureBonus        float64 `json:"fixture_bonus"`
	CaptaincyScore      float64 `json:"captaincy_score"`
}

// CaptaincyPayload is the response model for /api/captaincy.
type CaptaincyPayload struct {
	Gameweek             int                `json:"gameweek"`
	SuggestedCaptain     *CaptainCandidate  `json:"suggested_captain"`
	SuggestedViceCaptain *CaptainCandidate  `json:"suggested_vice_captain"`
	Candidates           []CaptainCandidate `json:"candidates"`
}

// ThresholdPoint represents one gameweek's point on the TC curve.
type ThresholdPoint struct {
	Gameweek       int     `json:"gameweek"`
	GwInHalf       int     `json:"gw_in_half"`
	Half           int     `json:"half"`
	Threshold      float64 `json:"threshold"`
	HistoricalBest float64 `json:"historical_best"`
}

// UnbuiltChipCard represents an intentional placeholder for unbuilt chips.
type UnbuiltChipCard struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Status      string `json:"status"`
	Badge       string `json:"badge"`
	Description string `json:"description"`
	Available   bool   `json:"available"`
}

// ChipsPayload is the response model for /api/chips.
type ChipsPayload struct {
	CurrentGameweek int `json:"current_gameweek"`
	TripleCaptain   struct {
		Status           string           `json:"status"`
		CurrentThreshold float64          `json:"current_threshold"`
		TopCandidate     string           `json:"top_candidate"`
		TopScore         float64          `json:"top_score"`
		ShouldPlay       bool             `json:"should_play"`
		Recommendation   string           `json:"recommendation"`
		Explanation      string           `json:"explanation"`
		ThresholdCurve   []ThresholdPoint `json:"threshold_curve"`
	} `json:"triple_captain"`
	UnbuiltChips []UnbuiltChipCard `json:"unbuilt_chips"`
}

// PlayerRecord represents a full player profile in Player Explorer.
type PlayerRecord struct {
	FplID                 int     `json:"fpl_id"`
	WebName               string  `json:"web_name"`
	FullName              string  `json:"full_name"`
	Position              string  `json:"position"`
	Team                  string  `json:"team"`
	Price                 float64 `json:"price"`
	Status                string  `json:"status"`
	PredictedPoints       float64 `json:"predicted_points"`
	BlendedAvgMinutes     float64 `json:"blended_avg_minutes"`
	RotationRisk          bool    `json:"rotation_risk"`
	ZeroGamesFlag         bool    `json:"zero_games_flag"`
	WeightCurrentSeason   float64 `json:"weight_current_season"`
	GamesPlayedCurrent    int     `json:"games_played_current"`
	TotalPointsAvgLast3   float64 `json:"total_points_avg_last3"`
	TotalPointsAvgLast5   float64 `json:"total_points_avg_last5"`
	MinutesAvgLast3       float64 `json:"minutes_avg_last3"`
	MinutesAvgLast5       float64 `json:"minutes_avg_last5"`
	GoalsScoredAvgLast5   float64 `json:"goals_scored_avg_last5"`
	AssistsAvgLast5       float64 `json:"assists_avg_last5"`
	IctIndexAvgLast5      float64 `json:"ict_index_avg_last5"`
	BonusAvgLast5         float64 `json:"bonus_avg_last5"`
	CleanSheetsAvgLast5   float64 `json:"clean_sheets_avg_last5"`
	TeamCleanSheetRateLast5 float64 `json:"team_clean_sheet_rate_last5"`
	PriceChangeSinceStart float64 `json:"price_change_since_start"`
}

// PlayersQueryResponse represents the paginated & filtered Player Explorer response.
type PlayersQueryResponse struct {
	Total   int            `json:"total"`
	Offset  int            `json:"offset"`
	Limit   int            `json:"limit"`
	Players []PlayerRecord `json:"players"`
}

// ModelComparisonItem represents backtest scores for a candidate algorithm.
type ModelComparisonItem struct {
	Name   string  `json:"name"`
	MAE    float64 `json:"mae"`
	RMSE   float64 `json:"rmse"`
	Winner bool    `json:"winner"`
	Notes  string  `json:"notes"`
}

// FeatureImportanceItem represents ranked feature importance from RF.
type FeatureImportanceItem struct {
	Feature    string  `json:"feature"`
	Label      string  `json:"label"`
	Importance float64 `json:"importance"`
	Percentage float64 `json:"percentage"`
}

// LeakageBugItem documents historical bugs caught by the automated check.
type LeakageBugItem struct {
	Title     string `json:"title"`
	Discovery string `json:"discovery"`
	Fix       string `json:"fix"`
	Status    string `json:"status"`
}

// RejectedIdeaCard presents an empirically tested and discarded approach.
type RejectedIdeaCard struct {
	ID               string `json:"id"`
	Title            string `json:"title"`
	Category         string `json:"category"`
	Hypothesis       string `json:"hypothesis"`
	Experiment       string `json:"experiment"`
	MetricComparison string `json:"metric_comparison"`
	Verdict          string `json:"verdict"`
	Reason           string `json:"reason"`
}

// ValidationPayload is the response model for /api/validation.
type ValidationPayload struct {
	BacktestSummary struct {
		TestSeason       string                `json:"test_season"`
		ValidationMethod string                `json:"validation_method"`
		Models           []ModelComparisonItem `json:"models"`
	} `json:"backtest_summary"`
	WalkForwardMAEByGW []struct {
		GW       int     `json:"gw"`
		RFMAE    float64 `json:"rf_mae"`
		XGBMAE   float64 `json:"xgb_mae"`
		RidgeMAE float64 `json:"ridge_mae"`
	} `json:"walk_forward_mae_by_gw"`
	FeatureImportance []FeatureImportanceItem `json:"feature_importance"`
	ShrinkageExperiment struct {
		Formula         string  `json:"formula"`
		SelectedK       float64 `json:"selected_k"`
		ProductionMAE   float64 `json:"production_mae"`
		BaselineFormula string  `json:"baseline_formula"`
		BaselineMAE     float64 `json:"baseline_mae"`
		MAEImprovement  float64 `json:"mae_improvement"`
		Rationale       string  `json:"rationale"`
		KCandidates     []struct {
			K   string  `json:"k"`
			MAE float64 `json:"mae"`
		} `json:"k_candidates"`
	} `json:"shrinkage_experiment"`
	LeakageChecks struct {
		Status          string           `json:"status"`
		SamplesVerified int              `json:"samples_verified"`
		Tolerance       string           `json:"tolerance"`
		Method          string           `json:"method"`
		BugsCaught      []LeakageBugItem `json:"bugs_caught"`
	} `json:"leakage_checks"`
	RejectedIdeas []RejectedIdeaCard `json:"rejected_ideas"`
}

