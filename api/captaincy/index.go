package handler

import (
	"net/http"

	"github.com/rohan216h/fpl-predictor/api"
)

// Handler handles /api/captaincy requests.
func Handler(w http.ResponseWriter, r *http.Request) {
	api.CaptaincyHandler(w, r)
}

