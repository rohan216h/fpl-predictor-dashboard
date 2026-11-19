package handler

import (
	"net/http"

	"github.com/rohan216h/fpl-predictor-dashboard/api"
)

// Handler handles /api/squad requests.
func Handler(w http.ResponseWriter, r *http.Request) {
	api.SquadHandler(w, r)
}

