package daemon

import (
	"net/http"
	"os"
	"runtime"
	"time"

	"kaioken/internal/version"
)

type healthResponse struct {
	Status         string `json:"status"`
	Version        string `json:"version"`
	Contract       int    `json:"contract"`
	GoVersion      string `json:"go_version"`
	OS             string `json:"os"`
	Arch           string `json:"arch"`
	PID            int    `json:"pid"`
	UptimeMS       int64  `json:"uptime_ms"`
	WorkspacesOpen int    `json:"workspaces_open"`
	RunsActive     int    `json:"runs_active"`
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{
		Status:         "ok",
		Version:        version.Version,
		Contract:       version.ContractVersion,
		GoVersion:      runtime.Version(),
		OS:             runtime.GOOS,
		Arch:           runtime.GOARCH,
		PID:            os.Getpid(),
		UptimeMS:       time.Since(s.started).Milliseconds(),
		WorkspacesOpen: s.mgr.Count(),
		RunsActive:     s.runs.ActiveCount(),
	})
}

// handleShutdown replies 202 immediately, then cancels the root context in a
// goroutine so the in-flight request (this one) finishes before Run's
// Shutdown call begins draining connections.
func (s *Server) handleShutdown(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusAccepted)
	go s.cancel()
}
