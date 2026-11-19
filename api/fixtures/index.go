package handler

import (
	"net/http"

	"github.com/rohan216h/fpl-predictor/api"
)

// Handler handles /api/fixtures requests.
func Handler(w http.ResponseWriter, r *http.Request) {
	api.FixturesHandler(w, r)
}

