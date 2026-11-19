package handler

import (
	"net/http"

	"github.com/rohan216h/fpl-predictor-dashboard/pkg/handlers"
)

// Handler handles /api/transfers requests.
func Handler(w http.ResponseWriter, r *http.Request) {
	handlers.TransfersHandler(w, r)
}
