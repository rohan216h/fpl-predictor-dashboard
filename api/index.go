package api

import (
	"net/http"
	"strings"

	"github.com/rohan216h/fpl-predictor/internal/store"
)

// Handler is the primary Vercel Serverless Function entrypoint.
// It dispatches incoming requests to the appropriate handler based on URL path.
func Handler(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimSuffix(r.URL.Path, "/")

	switch {
	case strings.HasSuffix(path, "/overview"):
		OverviewHandler(w, r)
	case strings.HasSuffix(path, "/squad"):
		SquadHandler(w, r)
	case strings.HasSuffix(path, "/transfers"):
		TransfersHandler(w, r)
	case strings.HasSuffix(path, "/captaincy"):
		CaptaincyHandler(w, r)
	case strings.HasSuffix(path, "/chips"):
		ChipsHandler(w, r)
	case strings.HasSuffix(path, "/players"):
		PlayersHandler(w, r)
	case strings.HasSuffix(path, "/validation"):
		ValidationHandler(w, r)
	case strings.HasSuffix(path, "/fixtures"):
		FixturesHandler(w, r)
	default:
		store.WriteError(w, http.StatusNotFound, "Endpoint not found: "+r.URL.Path)
	}
}

