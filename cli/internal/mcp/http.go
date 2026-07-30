package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"

	"kaioken/internal/version"
)

// The HTTP transport implements MCP's streamable-HTTP shape: a single POST
// endpoint taking one JSON-RPC frame and returning one response. SSE streaming
// is not offered because nothing here streams — every tool returns once — and
// a fake event stream would only add ways to fail.

// ServeHTTP runs the HTTP transport on addr until ctx is cancelled.
func (s *Server) ServeHTTP(ctx context.Context, addr string) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/mcp", s.handleRPC)
	mux.HandleFunc("/health", s.handleHealth)

	srv := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		// Tools can be slow — a research run is minutes — so the write timeout
		// is generous rather than absent; an unbounded one leaks connections.
		WriteTimeout: 30 * time.Minute,
	}

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listening on %s: %w", addr, err)
	}
	s.log.info("http transport ready", "addr", ln.Addr().String(), "repo", s.repo,
		"auth", boolWord(s.token != ""))

	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()

	select {
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
		return nil
	case err := <-errc:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

// httpMaxBody caps one inbound request (4 MB) — tool arguments are small, and
// an unbounded reader on a loopback port is still a way to be OOM-killed.
const httpMaxBody = 4 << 20

func (s *Server) handleRPC(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "POST a JSON-RPC frame to this endpoint", http.StatusMethodNotAllowed)
		return
	}
	if aerr := s.authorize(r.Header.Get("Authorization")); aerr != nil {
		w.Header().Set("WWW-Authenticate", `Bearer realm="kaioken"`)
		writeRPC(w, http.StatusUnauthorized, failure(nil, aerr))
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, httpMaxBody))
	if err != nil {
		writeRPC(w, http.StatusBadRequest, failure(nil, errf(codeParseError, "reading body: %v", err)))
		return
	}
	var req request
	if err := json.Unmarshal(body, &req); err != nil {
		writeRPC(w, http.StatusBadRequest, failure(nil, errf(codeParseError, "invalid JSON: %v", err)))
		return
	}

	resp := s.Handle(r.Context(), &req)
	if resp == nil {
		// A notification: acknowledged, nothing to say back.
		w.WriteHeader(http.StatusAccepted)
		return
	}
	writeRPC(w, http.StatusOK, resp)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	// Health is deliberately unauthenticated and says nothing about the
	// workspace: it exists so a supervisor can tell the process is alive.
	writeRPC(w, http.StatusOK, map[string]any{
		"status":   "ok",
		"server":   "kaioken",
		"version":  version.Version,
		"protocol": ProtocolVersion,
	})
}

func writeRPC(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func boolWord(b bool) string {
	if b {
		return "on"
	}
	return "off"
}
