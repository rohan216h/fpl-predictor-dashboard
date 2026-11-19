package fplapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/rohan216h/fpl-predictor-dashboard/pkg/models"
)

const (
	userAgent   = "FPL-Dashboard-Optimizer/1.0 (+https://github.com/rohan216h/fpl-predictor)"
	cacheTTL    = 5 * time.Minute // 5-minute cache TTL
	httpTimeout = 5 * time.Second
)

var (
	httpClient = &http.Client{
		Timeout: httpTimeout,
	}

	mu           sync.RWMutex
	bootstrapMem *bootstrapCache
	fixturesMem  = make(map[int]*fixturesCache)
)

type bootstrapCache struct {
	data      *RawBootstrap
	cachedAt  time.Time
	priceMap  map[int]float64
	teamMap   map[int]string
	shortMap  map[int]string
	nextEvent *RawEvent
}

type fixturesCache struct {
	items    []models.LiveFixtureItem
	cachedAt time.Time
}

// RawEvent represents a gameweek in the FPL API.
type RawEvent struct {
	ID                int    `json:"id"`
	Name              string `json:"name"`
	DeadlineTime      string `json:"deadline_time"`
	DeadlineTimeEpoch int64  `json:"deadline_time_epoch"`
	Finished          bool   `json:"finished"`
	IsCurrent         bool   `json:"is_current"`
	IsNext            bool   `json:"is_next"`
}

// RawElement represents a player in bootstrap-static.
type RawElement struct {
	ID              int    `json:"id"`
	WebName         string `json:"web_name"`
	NowCost         int    `json:"now_cost"`
	CostChangeStart int    `json:"cost_change_start"`
	CostChangeEvent int    `json:"cost_change_event"`
	Status          string `json:"status"`
	News            string `json:"news"`
	Team            int    `json:"team"`
}

// RawTeam represents a club in bootstrap-static.
type RawTeam struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	ShortName string `json:"short_name"`
}

// RawBootstrap represents bootstrap-static payload.
type RawBootstrap struct {
	Events   []RawEvent   `json:"events"`
	Elements []RawElement `json:"elements"`
	Teams    []RawTeam    `json:"teams"`
}

// RawFixture represents a single match in the FPL fixtures API.
type RawFixture struct {
	ID              int    `json:"id"`
	Event           int    `json:"event"`
	TeamH           int    `json:"team_h"`
	TeamA           int    `json:"team_a"`
	TeamHDifficulty int    `json:"team_h_difficulty"`
	TeamADifficulty int    `json:"team_a_difficulty"`
	KickoffTime     string `json:"kickoff_time"`
	Started         bool   `json:"started"`
	Finished        bool   `json:"finished"`
}

// fetchWithUserAgent performs a GET request with proper User-Agent header.
func fetchWithUserAgent(url string) (*http.Response, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/json")
	return httpClient.Do(req)
}

// GetBootstrap pulls or retrieves cached bootstrap data from the live FPL API.
func GetBootstrap() (*bootstrapCache, error) {
	mu.RLock()
	if bootstrapMem != nil && time.Since(bootstrapMem.cachedAt) < cacheTTL {
		defer mu.RUnlock()
		return bootstrapMem, nil
	}
	mu.RUnlock()

	mu.Lock()
	defer mu.Unlock()

	// Double-check after acquiring write lock
	if bootstrapMem != nil && time.Since(bootstrapMem.cachedAt) < cacheTTL {
		return bootstrapMem, nil
	}

	url := "https://fantasy.premierleague.com/api/bootstrap-static/"
	resp, err := fetchWithUserAgent(url)
	if err != nil {
		if bootstrapMem != nil {
			return bootstrapMem, nil // Return stale cache on failure
		}
		return nil, fmt.Errorf("FPL API bootstrap fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		if bootstrapMem != nil {
			return bootstrapMem, nil
		}
		return nil, fmt.Errorf("FPL API returned status %d", resp.StatusCode)
	}

	var raw RawBootstrap
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		if bootstrapMem != nil {
			return bootstrapMem, nil
		}
		return nil, fmt.Errorf("FPL API decode error: %w", err)
	}

	priceMap := make(map[int]float64, len(raw.Elements))
	for _, el := range raw.Elements {
		priceMap[el.ID] = float64(el.NowCost) / 10.0
	}

	teamMap := make(map[int]string, len(raw.Teams))
	shortMap := make(map[int]string, len(raw.Teams))
	for _, t := range raw.Teams {
		teamMap[t.ID] = t.Name
		shortMap[t.ID] = t.ShortName
	}

	var nextEvent *RawEvent
	for i := range raw.Events {
		ev := &raw.Events[i]
		if ev.IsNext {
			nextEvent = ev
			break
		}
		if !ev.Finished && nextEvent == nil {
			nextEvent = ev
		}
	}

	bootstrapMem = &bootstrapCache{
		data:      &raw,
		cachedAt:  time.Now(),
		priceMap:  priceMap,
		teamMap:   teamMap,
		shortMap:  shortMap,
		nextEvent: nextEvent,
	}

	return bootstrapMem, nil
}

// GetLiveDeadline returns the current gameweek and countdown information.
func GetLiveDeadline() (*models.LiveDeadline, error) {
	b, err := GetBootstrap()
	if err != nil || b == nil || b.nextEvent == nil {
		return nil, err
	}

	ev := b.nextEvent
	nowUnix := time.Now().Unix()
	remaining := ev.DeadlineTimeEpoch - nowUnix
	if remaining < 0 {
		remaining = 0
	}

	return &models.LiveDeadline{
		Gameweek:          ev.ID,
		GameweekName:      ev.Name,
		DeadlineTime:      ev.DeadlineTime,
		DeadlineTimeEpoch: ev.DeadlineTimeEpoch,
		SecondsRemaining:  remaining,
		IsLive:            true,
	}, nil
}

// GetLivePrice returns the live price for a given player ID, or false if unavailable.
func GetLivePrice(fplID int) (float64, bool) {
	mu.RLock()
	defer mu.RUnlock()
	if bootstrapMem != nil && bootstrapMem.priceMap != nil {
		price, ok := bootstrapMem.priceMap[fplID]
		return price, ok
	}
	return 0, false
}

// GetLiveFixtures returns upcoming matches with FDR difficulty ratings for a gameweek.
func GetLiveFixtures(gameweek int) ([]models.LiveFixtureItem, error) {
	mu.RLock()
	if cached, ok := fixturesMem[gameweek]; ok && time.Since(cached.cachedAt) < cacheTTL {
		defer mu.RUnlock()
		return cached.items, nil
	}
	mu.RUnlock()

	b, _ := GetBootstrap() // Pre-load team mappings

	mu.Lock()
	defer mu.Unlock()

	if cached, ok := fixturesMem[gameweek]; ok && time.Since(cached.cachedAt) < cacheTTL {
		return cached.items, nil
	}

	url := fmt.Sprintf("https://fantasy.premierleague.com/api/fixtures/?event=%d", gameweek)
	resp, err := fetchWithUserAgent(url)
	if err != nil {
		if cached, ok := fixturesMem[gameweek]; ok {
			return cached.items, nil
		}
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		if cached, ok := fixturesMem[gameweek]; ok {
			return cached.items, nil
		}
		return nil, fmt.Errorf("FPL fixtures API returned status %d", resp.StatusCode)
	}

	var rawFixtures []RawFixture
	if err := json.NewDecoder(resp.Body).Decode(&rawFixtures); err != nil {
		return nil, err
	}

	items := make([]models.LiveFixtureItem, 0, len(rawFixtures))
	for _, f := range rawFixtures {
		homeName := fmt.Sprintf("Team %d", f.TeamH)
		homeShort := fmt.Sprintf("T%d", f.TeamH)
		awayName := fmt.Sprintf("Team %d", f.TeamA)
		awayShort := fmt.Sprintf("T%d", f.TeamA)

		if b != nil {
			if name, ok := b.teamMap[f.TeamH]; ok {
				homeName = name
			}
			if s, ok := b.shortMap[f.TeamH]; ok {
				homeShort = s
			}
			if name, ok := b.teamMap[f.TeamA]; ok {
				awayName = name
			}
			if s, ok := b.shortMap[f.TeamA]; ok {
				awayShort = s
			}
		}

		items = append(items, models.LiveFixtureItem{
			ID:             f.ID,
			Gameweek:       f.Event,
			HomeTeam:       homeName,
			HomeTeamShort:  homeShort,
			AwayTeam:       awayName,
			AwayTeamShort:  awayShort,
			HomeDifficulty: f.TeamHDifficulty,
			AwayDifficulty: f.TeamADifficulty,
			KickoffTime:    f.KickoffTime,
			Started:        f.Started,
			Finished:       f.Finished,
		})
	}

	fixturesMem[gameweek] = &fixturesCache{
		items:    items,
		cachedAt: time.Now(),
	}

	return items, nil
}

