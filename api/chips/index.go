package handler

import (
	"net/http"

	"github.com/rohan216h/fpl-predictor-dashboard/api"
)

// Handler handles /api/chips requests.
func Handler(w http.ResponseWriter, r *http.Request) {
	api.ChipsHandler(w, r)
}

