package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/rohan216h/fpl-predictor-dashboard/pkg/models"
)

func TestOverviewHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/overview", nil)
	rr := httptest.NewRecorder()

	OverviewHandler(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Fatalf("expected status 200, got %d", status)
	}

	var payload models.OverviewPayload
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse overview JSON: %v", err)
	}

	if payload.Gameweek <= 0 {
		t.Errorf("expected positive gameweek, got %d", payload.Gameweek)
	}
	if payload.HeadlineRecommendations.Captain.Name == "" {
		t.Errorf("expected non-empty captain name")
	}
	if payload.HeadlineRecommendations.Transfer.Action == "" {
		t.Errorf("expected non-empty transfer action")
	}
}

func TestSquadHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/squad", nil)
	rr := httptest.NewRecorder()

	SquadHandler(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Fatalf("expected status 200, got %d", status)
	}

	var payload models.SquadPayload
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse squad JSON: %v", err)
	}

	if len(payload.StartingXI) != 11 {
		t.Errorf("expected 11 starters, got %d", len(payload.StartingXI))
	}
	if len(payload.Bench) != 4 {
		t.Errorf("expected 4 bench players, got %d", len(payload.Bench))
	}
	if payload.BudgetUsed > payload.BudgetCap {
		t.Errorf("budget used %.2f exceeds cap %.2f", payload.BudgetUsed, payload.BudgetCap)
	}
}

func TestTransfersHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/transfers", nil)
	rr := httptest.NewRecorder()

	TransfersHandler(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Fatalf("expected status 200, got %d", status)
	}

	var payload models.TransfersPayload
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse transfers JSON: %v", err)
	}

	if payload.Recommended.Action == "" {
		t.Errorf("expected non-empty recommended action")
	}
	if len(payload.OptionsEvaluated) < 4 {
		t.Errorf("expected multiple options evaluated, got %d", len(payload.OptionsEvaluated))
	}
}

func TestCaptaincyHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/captaincy", nil)
	rr := httptest.NewRecorder()

	CaptaincyHandler(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Fatalf("expected status 200, got %d", status)
	}

	var payload models.CaptaincyPayload
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse captaincy JSON: %v", err)
	}

	if payload.SuggestedCaptain == nil || payload.SuggestedCaptain.WebName != "Haaland" {
		t.Errorf("expected suggested captain Haaland, got %+v", payload.SuggestedCaptain)
	}
	if len(payload.Candidates) != 11 {
		t.Errorf("expected 11 starting XI candidates, got %d", len(payload.Candidates))
	}
}

func TestChipsHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/chips", nil)
	rr := httptest.NewRecorder()

	ChipsHandler(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Fatalf("expected status 200, got %d", status)
	}

	var payload models.ChipsPayload
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse chips JSON: %v", err)
	}

	if len(payload.TripleCaptain.ThresholdCurve) != 38 {
		t.Errorf("expected 38 threshold curve points, got %d", len(payload.TripleCaptain.ThresholdCurve))
	}
	if len(payload.UnbuiltChips) != 3 {
		t.Errorf("expected 3 unbuilt chips cards, got %d", len(payload.UnbuiltChips))
	}
}

func TestPlayersHandler(t *testing.T) {
	// 1. Default paginated query
	req := httptest.NewRequest(http.MethodGet, "/api/players?limit=25", nil)
	rr := httptest.NewRecorder()
	PlayersHandler(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Fatalf("expected status 200, got %d", status)
	}

	var resp models.PlayersQueryResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse players response: %v", err)
	}
	if resp.Total != 300 {
		t.Errorf("expected total 300 players in pool, got %d", resp.Total)
	}
	if len(resp.Players) != 25 {
		t.Errorf("expected 25 players returned with limit=25, got %d", len(resp.Players))
	}

	// 2. Position filter
	reqPos := httptest.NewRequest(http.MethodGet, "/api/players?pos=FWD", nil)
	rrPos := httptest.NewRecorder()
	PlayersHandler(rrPos, reqPos)
	var respPos models.PlayersQueryResponse
	json.Unmarshal(rrPos.Body.Bytes(), &respPos)
	for _, p := range respPos.Players {
		if p.Position != "FWD" {
			t.Errorf("expected all players to be FWD, found %s", p.Position)
		}
	}

	// 3. Search query
	reqSearch := httptest.NewRequest(http.MethodGet, "/api/players?q=haaland", nil)
	rrSearch := httptest.NewRecorder()
	PlayersHandler(rrSearch, reqSearch)
	var respSearch models.PlayersQueryResponse
	json.Unmarshal(rrSearch.Body.Bytes(), &respSearch)
	if len(respSearch.Players) == 0 || respSearch.Players[0].WebName != "Haaland" {
		t.Errorf("expected Haaland in search results, got %+v", respSearch.Players)
	}
}

func TestValidationHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/validation", nil)
	rr := httptest.NewRecorder()

	ValidationHandler(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Fatalf("expected status 200, got %d", status)
	}

	var payload models.ValidationPayload
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse validation JSON: %v", err)
	}

	rfWinner := false
	for _, m := range payload.BacktestSummary.Models {
		if m.Name == "Random Forest" && m.Winner && m.MAE == 1.027 {
			rfWinner = true
		}
	}
	if !rfWinner {
		t.Errorf("expected Random Forest to be backtest winner with MAE 1.027")
	}

	if payload.LeakageChecks.SamplesVerified != 200 || payload.LeakageChecks.Status != "PASSED" {
		t.Errorf("expected 200 leakage samples verified with status PASSED")
	}
	if len(payload.RejectedIdeas) != 6 {
		t.Errorf("expected 6 rejected ideas cards, got %d", len(payload.RejectedIdeas))
	}
}

func TestFixturesHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/fixtures?gw=5", nil)
	rr := httptest.NewRecorder()

	FixturesHandler(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Fatalf("expected status 200, got %d", status)
	}

	var resp struct {
		Gameweek int                      `json:"gameweek"`
		Fixtures []models.LiveFixtureItem `json:"fixtures"`
		IsLive   bool                     `json:"is_live"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse fixtures JSON: %v", err)
	}

	if resp.Gameweek != 5 {
		t.Errorf("expected gameweek 5, got %d", resp.Gameweek)
	}
}

