package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/rohan216h/fpl-predictor/api"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()

	// Register API endpoints
	mux.HandleFunc("/api/overview", api.OverviewHandler)
	mux.HandleFunc("/api/squad", api.SquadHandler)
	mux.HandleFunc("/api/transfers", api.TransfersHandler)
	mux.HandleFunc("/api/captaincy", api.CaptaincyHandler)
	mux.HandleFunc("/api/chips", api.ChipsHandler)
	mux.HandleFunc("/api/players", api.PlayersHandler)
	mux.HandleFunc("/api/validation", api.ValidationHandler)
	mux.HandleFunc("/api/fixtures", api.FixturesHandler)

	// Static frontend
	staticDir := "public"
	if _, err := os.Stat(staticDir); err == nil {
		fs := http.FileServer(http.Dir(staticDir))
		mux.Handle("/", fs)
	} else {
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"status":"running","message":"FPL Predictor Go API is active"}`))
		})
	}

	serverAddr := ":" + port
	fmt.Printf("\n[FPL Dashboard Backend] Listening on http://localhost%s\n", serverAddr)
	fmt.Printf("Endpoints:\n")
	fmt.Printf("  - http://localhost%s/api/overview\n", serverAddr)
	fmt.Printf("  - http://localhost%s/api/squad\n", serverAddr)
	fmt.Printf("  - http://localhost%s/api/transfers\n", serverAddr)
	fmt.Printf("  - http://localhost%s/api/captaincy\n", serverAddr)
	fmt.Printf("  - http://localhost%s/api/chips\n", serverAddr)
	fmt.Printf("  - http://localhost%s/api/players\n", serverAddr)
	fmt.Printf("  - http://localhost%s/api/validation\n\n", serverAddr)

	if err := http.ListenAndServe(serverAddr, mux); err != nil {
		log.Fatalf("Server stopped: %v", err)
	}
}

