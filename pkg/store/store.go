package store

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"

	dashboarddata "github.com/rohan216h/fpl-predictor-dashboard/data/dashboard"
)

var (
	cacheMu sync.RWMutex
	cache   = make(map[string][]byte)
)

// candidateDirs lists possible locations for data/dashboard across Vercel and local dev.
var candidateDirs = []string{
	"data/dashboard",
	"../data/dashboard",
	"../../data/dashboard",
	"../../../data/dashboard",
}

// FindDataFile locates the requested JSON file in one of the candidate directories.
func FindDataFile(filename string) (string, error) {
	// First check explicit env var if set
	if envDir := os.Getenv("DASHBOARD_DATA_DIR"); envDir != "" {
		p := filepath.Join(envDir, filename)
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}

	// Check relative candidate directories
	for _, dir := range candidateDirs {
		p := filepath.Join(dir, filename)
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}

	// Check executable directory
	if exe, err := os.Executable(); err == nil {
		p := filepath.Join(filepath.Dir(exe), "data", "dashboard", filename)
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}

	// Check current working directory
	if cwd, err := os.Getwd(); err == nil {
		p := filepath.Join(cwd, "data", "dashboard", filename)
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}

	return "", fmt.Errorf("dashboard data file %q not found in any candidate directory", filename)
}

// LoadDataFile reads raw bytes from the specified data file with thread-safe caching.
func LoadDataFile(filename string) ([]byte, error) {
	cacheMu.RLock()
	if data, ok := cache[filename]; ok {
		cacheMu.RUnlock()
		return data, nil
	}
	cacheMu.RUnlock()

	// 1. First check embedded binary data (production on Vercel)
	if embedded, ok := dashboarddata.Get(filename); ok && len(embedded) > 0 {
		cacheMu.Lock()
		cache[filename] = embedded
		cacheMu.Unlock()
		return embedded, nil
	}

	// 2. Fall back to filesystem lookup
	path, err := FindDataFile(filename)
	if err != nil {
		return nil, err
	}

	bytes, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("error reading %q: %w", path, err)
	}

	cacheMu.Lock()
	cache[filename] = bytes
	cacheMu.Unlock()

	return bytes, nil
}

// LoadJSON reads and unmarshals the specified dashboard file into target.
func LoadJSON(filename string, target interface{}) error {
	bytes, err := LoadDataFile(filename)
	if err != nil {
		return err
	}
	return json.Unmarshal(bytes, target)
}

// SetStandardHeaders applies CORS, JSON content-type, and caching headers (5 minutes TTL).
func SetStandardHeaders(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Cache-Control", "public, max-age=300, s-maxage=300")
}

// WriteJSON sends a successful JSON response.
func WriteJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	SetStandardHeaders(w)
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, `{"error":"failed to serialize response"}`, http.StatusInternalServerError)
	}
}

// WriteRawJSON writes pre-serialized JSON bytes directly to the client.
func WriteRawJSON(w http.ResponseWriter, statusCode int, raw []byte) {
	SetStandardHeaders(w)
	w.WriteHeader(statusCode)
	w.Write(raw)
}

// WriteError sends a formatted JSON error response.
func WriteError(w http.ResponseWriter, statusCode int, message string) {
	SetStandardHeaders(w)
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":   message,
		"status":  statusCode,
		"success": false,
	})
}

