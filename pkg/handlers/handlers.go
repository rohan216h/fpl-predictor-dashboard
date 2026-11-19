package handlers

import (
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/rohan216h/fpl-predictor-dashboard/pkg/fplapi"
	"github.com/rohan216h/fpl-predictor-dashboard/pkg/models"
	"github.com/rohan216h/fpl-predictor-dashboard/pkg/store"
)

// OverviewHandler serves the unified overview payload for the headline dashboard.
// Enriched with live gameweek, deadline countdown, and upcoming fixtures from FPL API when available.
func OverviewHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		store.SetStandardHeaders(w)
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet {
		store.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var payload models.OverviewPayload
	if err := store.LoadJSON("overview.json", &payload); err != nil {
		store.WriteError(w, http.StatusInternalServerError, "Failed to load overview data: "+err.Error())
		return
	}

	// Try fetching live FPL API deadline & countdown (5-min cache); gracefully fall back on failure
	if deadline, err := fplapi.GetLiveDeadline(); err == nil && deadline != nil {
		payload.Deadline = deadline
		payload.Gameweek = deadline.Gameweek
	}

	// Try fetching live upcoming fixtures for current gameweek
	if fixtures, err := fplapi.GetLiveFixtures(payload.Gameweek); err == nil && len(fixtures) > 0 {
		payload.Fixtures = fixtures
	}

	store.WriteJSON(w, http.StatusOK, payload)
}

// SquadHandler serves the optimized 15-man squad and starting XI for the pitch view.
// Live prices updated from FPL API when available; predictions & roles strictly preserved from JSON.
func SquadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		store.SetStandardHeaders(w)
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet {
		store.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var payload models.SquadPayload
	if err := store.LoadJSON("squad.json", &payload); err != nil {
		store.WriteError(w, http.StatusInternalServerError, "Failed to load squad data: "+err.Error())
		return
	}

	// Enrich with live prices if FPL API is reachable; model predictions stay unchanged
	if _, err := fplapi.GetBootstrap(); err == nil {
		var totalCost float64
		for i := range payload.StartingXI {
			if livePrice, ok := fplapi.GetLivePrice(payload.StartingXI[i].FplID); ok && livePrice > 0 {
				payload.StartingXI[i].Price = livePrice
			}
			totalCost += payload.StartingXI[i].Price
		}
		for i := range payload.Bench {
			if livePrice, ok := fplapi.GetLivePrice(payload.Bench[i].FplID); ok && livePrice > 0 {
				payload.Bench[i].Price = livePrice
			}
			totalCost += payload.Bench[i].Price
		}
		payload.BudgetUsed = totalCost
		payload.BankRemaining = payload.BudgetCap - totalCost
	}

	store.WriteJSON(w, http.StatusOK, payload)
}

// TransfersHandler serves the recommended transfer strategy and evaluation history.
func TransfersHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		store.SetStandardHeaders(w)
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet {
		store.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	bytes, err := store.LoadDataFile("transfers.json")
	if err != nil {
		store.WriteError(w, http.StatusInternalServerError, "Failed to load transfers data: "+err.Error())
		return
	}
	store.WriteRawJSON(w, http.StatusOK, bytes)
}

// CaptaincyHandler serves the captain and vice-captain ranking with breakdown.
func CaptaincyHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		store.SetStandardHeaders(w)
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet {
		store.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	bytes, err := store.LoadDataFile("captaincy.json")
	if err != nil {
		store.WriteError(w, http.StatusInternalServerError, "Failed to load captaincy data: "+err.Error())
		return
	}
	store.WriteRawJSON(w, http.StatusOK, bytes)
}

// ChipsHandler serves the dynamic Triple Captain threshold and unbuilt chip states.
func ChipsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		store.SetStandardHeaders(w)
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet {
		store.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	bytes, err := store.LoadDataFile("chips.json")
	if err != nil {
		store.WriteError(w, http.StatusInternalServerError, "Failed to load chips data: "+err.Error())
		return
	}
	store.WriteRawJSON(w, http.StatusOK, bytes)
}

// PlayersHandler serves searchable, filterable, sortable, and paginated player data.
// Supported Query Params:
//   - q / search: name substring filter
//   - pos / position: GKP, DEF, MID, FWD
//   - team: club name (e.g., Arsenal, Liverpool)
//   - min_price / max_price: price range bounds
//   - rotation_risk: "true" or "false"
//   - sort: "predicted_points", "price", "form", "minutes", "name"
//   - order: "asc" or "desc" (default: "desc")
//   - limit: max records (default: 50, max: 300)
//   - offset: record offset (default: 0)
func PlayersHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		store.SetStandardHeaders(w)
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet {
		store.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var allPlayers []models.PlayerRecord
	if err := store.LoadJSON("players.json", &allPlayers); err != nil {
		store.WriteError(w, http.StatusInternalServerError, "Failed to load players: "+err.Error())
		return
	}

	// Enrich with live prices from FPL API if available; predictions & form stay from exported JSON
	if _, err := fplapi.GetBootstrap(); err == nil {
		for i := range allPlayers {
			if livePrice, ok := fplapi.GetLivePrice(allPlayers[i].FplID); ok && livePrice > 0 {
				allPlayers[i].Price = livePrice
			}
		}
	}

	query := r.URL.Query()
	search := strings.ToLower(strings.TrimSpace(query.Get("q")))
	if search == "" {
		search = strings.ToLower(strings.TrimSpace(query.Get("search")))
	}
	pos := strings.ToUpper(strings.TrimSpace(query.Get("position")))
	if pos == "" {
		pos = strings.ToUpper(strings.TrimSpace(query.Get("pos")))
	}
	team := strings.TrimSpace(query.Get("team"))
	riskParam := strings.ToLower(strings.TrimSpace(query.Get("rotation_risk")))

	minPrice, _ := strconv.ParseFloat(query.Get("min_price"), 64)
	maxPrice, _ := strconv.ParseFloat(query.Get("max_price"), 64)

	// Filter
	filtered := make([]models.PlayerRecord, 0, len(allPlayers))
	for _, p := range allPlayers {
		if search != "" {
			nameMatch := strings.Contains(strings.ToLower(p.WebName), search) ||
				strings.Contains(strings.ToLower(p.FullName), search)
			if !nameMatch {
				continue
			}
		}
		if pos != "" && strings.ToUpper(p.Position) != pos {
			continue
		}
		if team != "" && !strings.EqualFold(p.Team, team) {
			continue
		}
		if minPrice > 0 && p.Price < minPrice {
			continue
		}
		if maxPrice > 0 && p.Price > maxPrice {
			continue
		}
		if riskParam == "true" && !p.RotationRisk {
			continue
		}
		if riskParam == "false" && p.RotationRisk {
			continue
		}
		filtered = append(filtered, p)
	}

	// Sort
	sortBy := strings.ToLower(query.Get("sort"))
	order := strings.ToLower(query.Get("order"))
	ascending := order == "asc"

	if sortBy == "" {
		sortBy = "predicted_points"
	}

	sort.SliceStable(filtered, func(i, j int) bool {
		var less bool
		switch sortBy {
		case "price":
			less = filtered[i].Price < filtered[j].Price
		case "form", "total_points_avg_last5":
			less = filtered[i].TotalPointsAvgLast5 < filtered[j].TotalPointsAvgLast5
		case "minutes", "blended_avg_minutes":
			less = filtered[i].BlendedAvgMinutes < filtered[j].BlendedAvgMinutes
		case "name", "web_name":
			less = strings.ToLower(filtered[i].WebName) < strings.ToLower(filtered[j].WebName)
		default: // "predicted_points"
			less = filtered[i].PredictedPoints < filtered[j].PredictedPoints
		}
		if ascending {
			return less
		}
		return !less
	})

	// Pagination
	limit := 50
	if lStr := query.Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			if l > 300 {
				limit = 300
			} else {
				limit = l
			}
		}
	}
	offset := 0
	if oStr := query.Get("offset"); oStr != "" {
		if o, err := strconv.Atoi(oStr); err == nil && o >= 0 {
			offset = o
		}
	}

	total := len(filtered)
	end := offset + limit
	if offset > total {
		offset = total
	}
	if end > total {
		end = total
	}

	paged := filtered[offset:end]

	resp := models.PlayersQueryResponse{
		Total:   total,
		Offset:  offset,
		Limit:   limit,
		Players: paged,
	}
	store.WriteJSON(w, http.StatusOK, resp)
}

// ValidationHandler serves walk-forward metrics, feature importance, and tested-and-rejected logs.
func ValidationHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		store.SetStandardHeaders(w)
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet {
		store.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	bytes, err := store.LoadDataFile("validation.json")
	if err != nil {
		store.WriteError(w, http.StatusInternalServerError, "Failed to load validation data: "+err.Error())
		return
	}
	store.WriteRawJSON(w, http.StatusOK, bytes)
}

// FixturesHandler serves upcoming gameweek matches with FDR ratings.
// Fetches live from the public FPL API with 5-minute caching, or returns empty list if offline.
func FixturesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		store.SetStandardHeaders(w)
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet {
		store.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	gw := 5
	if gwStr := r.URL.Query().Get("gw"); gwStr != "" {
		if g, err := strconv.Atoi(gwStr); err == nil && g > 0 {
			gw = g
		}
	} else if dl, err := fplapi.GetLiveDeadline(); err == nil && dl != nil && dl.Gameweek > 0 {
		gw = dl.Gameweek
	}

	fixtures, err := fplapi.GetLiveFixtures(gw)
	if err != nil || len(fixtures) == 0 {
		store.WriteJSON(w, http.StatusOK, map[string]interface{}{
			"gameweek": gw,
			"fixtures": []models.LiveFixtureItem{},
			"is_live":  false,
		})
		return
	}

	store.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"gameweek": gw,
		"fixtures": fixtures,
		"is_live":  true,
	})
}

