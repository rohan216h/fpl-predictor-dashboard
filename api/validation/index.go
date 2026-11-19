package handler

import (
	"net/http"

	"github.com/rohan216h/fpl-predictor-dashboard/api"
)

// Handler handles /api/validation requests.
func Handler(w http.ResponseWriter, r *http.Request) {
	api.ValidationHandler(w, r)
}

