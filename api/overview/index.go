package handler

import (
	"net/http"

	"github.com/rohan216h/fpl-predictor-dashboard/api"
)

// Handler handles /api/overview requests.
func Handler(w http.ResponseWriter, r *http.Request) {
	api.OverviewHandler(w, r)
}

