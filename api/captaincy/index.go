package handler

import (
	"net/http"

	"github.com/rohan216h/fpl-predictor-dashboard/pkg/handlers"
)

// Handler handles /api/captaincy requests.
func Handler(w http.ResponseWriter, r *http.Request) {
	handlers.CaptaincyHandler(w, r)
}
