package handler

import (
	"net/http"

	"github.com/rohan216h/fpl-predictor-dashboard/pkg/handlers"
)

// Handler handles /api/overview requests.
func Handler(w http.ResponseWriter, r *http.Request) {
	handlers.OverviewHandler(w, r)
}
