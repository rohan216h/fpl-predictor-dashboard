package handler

import (
	"net/http"

	"github.com/rohan216h/fpl-predictor-dashboard/pkg/handlers"
)

// Handler handles /api/fixtures requests.
func Handler(w http.ResponseWriter, r *http.Request) {
	handlers.FixturesHandler(w, r)
}
