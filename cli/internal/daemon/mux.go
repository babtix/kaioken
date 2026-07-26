package daemon

import (
	"crypto/subtle"
	"fmt"
	"net/http"
	"os"
	"runtime/debug"
	"strings"
	"time"
)

// allowedOrigins is the DNS-rebinding defence: a hostile page in the user's
// browser cannot reach the daemon even if it guesses the port, because it
// cannot forge Origin and does not have the token. Requests with no Origin
// header at all (curl, Go tests) are not subject to this check.
var allowedOrigins = map[string]bool{
	"tauri://localhost":       true,
	"http://tauri.localhost":  true,
	"https://tauri.localhost": true,
	"http://localhost:1420":   true,
	"http://127.0.0.1:1420":   true,
}

// newMux builds the full route table wrapped in the middleware chain:
// recoverer(originGuard(auth(logRequests(router)))). Every route added by a
// later task's handler file is registered here.
func newMux(s *Server) http.Handler {
	router := http.NewServeMux()

	router.HandleFunc("GET /v1/health", s.handleHealth)
	router.HandleFunc("POST /v1/shutdown", s.handleShutdown)
	router.HandleFunc("GET /v1/events", s.handleEvents)

	// Workspaces (T014)
	router.HandleFunc("GET /v1/workspaces", s.handleListWorkspaces)
	router.HandleFunc("POST /v1/workspaces", s.handleOpenWorkspace)
	router.HandleFunc("GET /v1/workspaces/{id}", s.handleGetWorkspace)
	router.HandleFunc("DELETE /v1/workspaces/{id}", s.handleDeleteWorkspace)
	router.HandleFunc("POST /v1/workspaces/{id}/init", s.handleInitWorkspace)

	// Workspace sub-resources (T015–T016)
	router.HandleFunc("GET /v1/workspaces/{id}/scan", s.handleScan)
	router.HandleFunc("GET /v1/workspaces/{id}/status", s.handleStatus)
	router.HandleFunc("GET /v1/workspaces/{id}/git", s.handleGit)
	router.HandleFunc("POST /v1/workspaces/{id}/hook", s.handleHook)
	router.HandleFunc("GET /v1/workspaces/{id}/config", s.handleGetConfig)
	router.HandleFunc("PUT /v1/workspaces/{id}/config", s.handlePutConfig)

	// Chat (T025–T028)
	router.HandleFunc("GET /v1/workspaces/{id}/sessions", s.handleListSessions)
	router.HandleFunc("POST /v1/workspaces/{id}/sessions", s.handleCreateSession)
	router.HandleFunc("GET /v1/workspaces/{id}/sessions/{sid}", s.handleGetSession)
	router.HandleFunc("DELETE /v1/workspaces/{id}/sessions/{sid}", s.handleDeleteSession)
	router.HandleFunc("POST /v1/workspaces/{id}/sessions/{sid}/messages", s.handleSendMessage)
	router.HandleFunc("POST /v1/workspaces/{id}/sessions/{sid}/compact", s.handleCompactSession)
	router.HandleFunc("POST /v1/approvals/{approval_id}", s.handleResolveApproval)
	router.HandleFunc("POST /v1/workspaces/{id}/undo", s.handleUndo)
	router.HandleFunc("GET /v1/workspaces/{id}/usage", s.handleUsage)

	// Runs (T035–T038)
	router.HandleFunc("POST /v1/workspaces/{id}/runs", s.handleStartRun)
	router.HandleFunc("GET /v1/workspaces/{id}/runs", s.handleListRuns)
	router.HandleFunc("GET /v1/workspaces/{id}/estimate", s.handleEstimate)
	router.HandleFunc("GET /v1/runs/{run_id}", s.handleGetRun)
	router.HandleFunc("POST /v1/runs/{run_id}/cancel", s.handleCancelRun)

	// Documents, wiki, cards, skills (T044–T056)
	router.HandleFunc("GET /v1/workspaces/{id}/wiki/tree", s.handleWikiTree)
	router.HandleFunc("GET /v1/workspaces/{id}/wiki/doc", s.handleWikiDoc)
	router.HandleFunc("GET /v1/workspaces/{id}/wiki/search", s.handleWikiSearch)
	router.HandleFunc("GET /v1/workspaces/{id}/wiki/plan", s.handleGetWikiPlan)
	router.HandleFunc("PUT /v1/workspaces/{id}/wiki/plan", s.handlePutWikiPlan)
	router.HandleFunc("GET /v1/workspaces/{id}/wiki/brief", s.handleGetBrief)
	router.HandleFunc("PUT /v1/workspaces/{id}/wiki/brief", s.handlePutBrief)
	router.HandleFunc("GET /v1/workspaces/{id}/file", s.handleFile)
	router.HandleFunc("GET /v1/workspaces/{id}/modules", s.handleGetModules)
	router.HandleFunc("PUT /v1/workspaces/{id}/modules", s.handlePutModules)
	router.HandleFunc("GET /v1/workspaces/{id}/skills", s.handleGetSkills)
	router.HandleFunc("GET /v1/workspaces/{id}/skills/{name}", s.handleGetSkill)
	router.HandleFunc("PUT /v1/workspaces/{id}/skills/{name}", s.handlePutSkill)
	router.HandleFunc("GET /v1/workspaces/{id}/cards", s.handleGetCards)
	router.HandleFunc("GET /v1/workspaces/{id}/cards/{module}/{card}", s.handleGetCard)

	// Settings (T061–T062)
	router.HandleFunc("GET /v1/settings", s.handleGetSettings)
	router.HandleFunc("PUT /v1/settings", s.handlePutSettings)
	router.HandleFunc("PUT /v1/settings/keys/{provider}", s.handlePutKey)
	router.HandleFunc("DELETE /v1/settings/keys/{provider}", s.handleDeleteKey)
	router.HandleFunc("POST /v1/settings/keys/{provider}/test", s.handleTestKey)
	router.HandleFunc("GET /v1/models", s.handleModels)

	var h http.Handler = router
	h = logRequests(s, h)
	h = auth(s.opts.Token, h)
	h = originGuard(h)
	h = recoverer(h)
	return h
}

// auth rejects requests whose bearer token does not match, in constant time.
// Every route requires it, including /v1/health — health is not a public
// endpoint on a daemon that can read and edit the user's repository.
func auth(token string, next http.Handler) http.Handler {
	want := []byte(token)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got := []byte(bearerToken(r))
		if len(got) == 0 || subtle.ConstantTimeCompare(want, got) != 1 {
			writeError(w, http.StatusUnauthorized, codeUnauthorized, "missing or invalid bearer token", "")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func bearerToken(r *http.Request) string {
	const prefix = "Bearer "
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, prefix) {
		return ""
	}
	return strings.TrimPrefix(h, prefix)
}

// originGuard rejects requests carrying a hostile Origin header, and answers
// CORS for allow-listed ones. Absent is allowed through unauthenticated-CORS
// (curl, tests, and same-origin loads never set it in a way that matters
// here); present-and-unknown is rejected outright.
//
// The WebView's own page origin (http://localhost:1420 in dev,
// tauri://localhost in prod) is cross-origin from the daemon's
// 127.0.0.1:<port>, and every request carries a non-simple Authorization
// header, so the browser always preflights with OPTIONS first. Without a
// scoped Access-Control-Allow-Origin echo and an OPTIONS responder here,
// every fetch() fails with an opaque "Failed to fetch" — CSP alone (R4) is
// not sufficient. The origin is echoed, never wildcarded, per
// docs/01-architecture.md §1.7 ("No CORS Access-Control-Allow-Origin: *.
// Ever.") — see docs/09-risks.md R4b.
func originGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if !allowedOrigins[origin] {
				writeError(w, http.StatusForbidden, codeForbiddenOrigin, "origin not allowed", "")
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			// A preflight never carries the bearer token, so it must be
			// answered here rather than falling through to auth.
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Max-Age", "86400")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// recoverer turns a panicking handler into a 500 engine_error plus a stderr
// stack trace, instead of killing the process. A wedged front-end or a bad
// payload must never take the whole daemon down mid pipeline-run.
func recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				fmt.Fprintf(os.Stderr, "daemon: panic handling %s %s: %v\n%s\n", r.Method, r.URL.Path, rec, debug.Stack())
				writeError(w, http.StatusInternalServerError, codeEngineError, "internal error", "")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// logRequests writes one line per request to stderr (never stdout — that is
// reserved for the single handshake line). Disabled when Quiet, so tests stay
// silent.
func logRequests(s *Server, next http.Handler) http.Handler {
	if s.opts.Quiet {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		fmt.Fprintf(os.Stderr, "%s %s %d %s\n", r.Method, r.URL.Path, sw.status, time.Since(start).Round(time.Millisecond))
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

// Flush forwards to the underlying ResponseWriter's Flush, if it has one.
// Without this, embedding only promotes http.ResponseWriter's own methods —
// wrapping silently breaks the http.Flusher type assertion that /v1/events
// depends on, and it only breaks when logRequests is actually active (never
// in tests, which run Quiet).
func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
