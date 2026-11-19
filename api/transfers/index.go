package handler

import (
	"net/http"

	"github.com/rohan216h/fpl-predictor/api"
)

// Handler handles /api/transfers requests.
func Handler(w http.ResponseWriter, r *http.Request) {
	api.TransfersHandler(w, r)
}

