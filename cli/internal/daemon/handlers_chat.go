package daemon

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"sync/atomic"
	"time"

	"kaioken/internal/agent"
	"kaioken/internal/llm"
	"kaioken/internal/memory"
	"kaioken/internal/session"
)

// --- T025: Session endpoints ---

// sessionMeta is the listing shape from §2.6.
type sessionMeta struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Model   string `json:"model"`
	Turns   int    `json:"turns"`
	Updated string `json:"updated"`
}

func toSessionMeta(s *session.Session) sessionMeta {
	turns := 0
	for _, m := range s.Messages {
		if m.Role == "user" || m.Role == "assistant" {
			turns++
		}
	}
	return sessionMeta{
		ID:      s.ID,
		Title:   s.Title,
		Model:   s.Model,
		Turns:   turns,
		Updated: s.Updated.Format(time.RFC3339),
	}
}

// GET /v1/workspaces/{id}/sessions
func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	repo := filepath.FromSlash(ws.Path)
	all, err := session.List(repo)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	out := make([]sessionMeta, 0, len(all))
	for _, m := range all {
		out = append(out, sessionMeta{
			ID:      m.ID,
			Title:   m.Title,
			Model:   m.Model,
			Turns:   m.Turns,
			Updated: m.Updated.Format(time.RFC3339),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": out})
}

// POST /v1/workspaces/{id}/sessions
func (s *Server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	var body struct {
		Model string `json:"model"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	model := body.Model
	provider := "openrouter"
	if cfg := ws.Config(); cfg != nil {
		if model == "" {
			model = cfg.Model
		}
		if cfg.Provider != "" {
			provider = cfg.Provider
		}
	}
	if model == "" {
		model = "openrouter"
	}

	sess := session.New(model, provider)
	repo := filepath.FromSlash(ws.Path)
	if err := sess.SaveForce(repo); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	s.hub.Publish("session.updated", map[string]any{
		"workspace_id": ws.ID, "session": toSessionMeta(sess),
	})
	writeJSON(w, http.StatusCreated, toSessionMeta(sess))
}

// GET /v1/workspaces/{id}/sessions/{sid}
func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	sid := r.PathValue("sid")
	repo := filepath.FromSlash(ws.Path)
	sess, err := session.Load(repo, sid)
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "session not found", "")
		return
	}
	writeJSON(w, http.StatusOK, sess)
}

// DELETE /v1/workspaces/{id}/sessions/{sid}
func (s *Server) handleDeleteSession(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	sid := r.PathValue("sid")
	repo := filepath.FromSlash(ws.Path)
	if err := session.Delete(repo, sid); err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "session not found", "")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- T026: Send message → agent run ---

// POST /v1/workspaces/{id}/sessions/{sid}/messages
func (s *Server) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	sid := r.PathValue("sid")
	repo := filepath.FromSlash(ws.Path)

	sess, err := session.Load(repo, sid)
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "session not found", "")
		return
	}

	var body struct {
		Content     string `json:"content"`
		AutoApprove bool   `json:"auto_approve"`
		AllowRun    bool   `json:"allow_run"`
		MaxSteps    int    `json:"max_steps"`
		Mode        string `json:"mode,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Content == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "content is required", "")
		return
	}

	// An empty mode parses to build, so existing clients are unaffected.
	mode, err := agent.ParseMode(body.Mode)
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error(), "")
		return
	}

	// Verify an API key is available.
	client, err := ws.Client()
	if err != nil {
		writeError(w, http.StatusConflict, codeNoAPIKey, err.Error(), "")
		return
	}

	// Build history: system prompt (if empty session) + saved messages + new user message.
	history := make([]llm.Message, 0, len(sess.Messages)+2)
	if len(sess.Messages) == 0 {
		history = append(history, llm.Message{
			Role:    "system",
			Content: agent.SystemPrompt(agent.PromptInput{
				Root:     repo,
				Mode:     mode,
				Model:    sess.Model,
				AllowRun: body.AllowRun || ws.AllowRun(),
				Notes:    ws.Notes(),
			}),
		})
	}
	history = append(history, sess.Messages...)
	history = append(history, llm.Message{Role: "user", Content: body.Content})

	maxSteps := body.MaxSteps
	if maxSteps <= 0 {
		maxSteps = 25
	}

	// Start the agent run.
	run := s.runs.Start(ws, "chat", map[string]any{"session_id": sid}, func(ctx context.Context, rec *RunRecord) error {
		ui := &chatUI{
			hub:         s.hub,
			approvals:   s.approvals,
			run:         rec,
			ws:          ws,
			sessionID:   sid,
			ctx:         ctx,
			autoApprove: &atomic.Bool{},
		}
		if body.AutoApprove {
			ui.autoApprove.Store(true)
		}

		ag := &agent.Agent{
			Client:         client,
			Root:           repo,
			UI:             ui,
			MaxSteps:       maxSteps,
			Mode:           mode,
			MemoryDisabled: ws.MemoryDisabled(),
			Budget:         ws.Budget(),
		}

		result, runErr := ag.Run(ctx, history)
		// Save the session regardless of outcome. Record derives the title
		// the same way the TUI does (first line, rune-safe truncation) —
		// do not reimplement that here.
		sess.Record(result)
		_ = sess.Save(repo)
		s.hub.Publish("session.updated", map[string]any{
			"workspace_id": ws.ID, "session": toSessionMeta(sess),
		})
		// Run the experience loop (digest + reinforcement + distillation) in
		// the background so the run completes promptly. It is best-effort: a
		// failure is not part of the run's outcome. The cfg tier gates whether
		// distillation actually fires; /learn is the TUI's explicit trigger.
		if cfg := ws.Config(); cfg != nil && !cfg.Memory.Disable {
			go func() {
				_ = memory.LearnSession(context.Background(), repo, cfg, client, sess, false)
			}()
		}
		return runErr
	})

	writeJSON(w, http.StatusAccepted, map[string]any{
		"run_id":     run.ID,
		"session_id": sid,
	})
}

// POST /v1/workspaces/{id}/sessions/{sid}/compact
func (s *Server) handleCompactSession(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	sid := r.PathValue("sid")
	repo := filepath.FromSlash(ws.Path)

	sess, err := session.Load(repo, sid)
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "session not found", "")
		return
	}
	original := sess.Messages
	if len(original) <= 2 {
		writeError(w, http.StatusBadRequest, codeBadRequest, "conversation is too short to compact", "")
		return
	}
	client, err := ws.Client()
	if err != nil {
		writeError(w, http.StatusConflict, codeNoAPIKey, err.Error(), "")
		return
	}

	// The reply ceiling sizes the headroom compaction leaves free; the client
	// carries whatever the workspace config set, or zero for the default.
	kept, note, err := agent.Compact(r.Context(), client, original, sess.Model, client.MaxTokens)
	if err != nil {
		writeError(w, http.StatusBadGateway, codeProviderError, err.Error(), "")
		return
	}

	sess.Messages = kept
	sess.AddEpoch("compaction", sess.Mode, note)
	sess.Updated = time.Now()
	if err := sess.Save(repo); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	s.hub.Publish("session.updated", map[string]any{
		"workspace_id": ws.ID, "session": toSessionMeta(sess),
	})

	saved := llm.EstimateTokens(original) - llm.EstimateTokens(kept)
	if saved < 0 {
		saved = 0
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"before_messages":       len(original),
		"after_messages":        len(kept),
		"saved_tokens_estimate": saved,
	})
}

// --- T027: Approval endpoint ---

// POST /v1/approvals/{approval_id}
func (s *Server) handleResolveApproval(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("approval_id")
	var body struct {
		Decision string `json:"decision"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Decision == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "decision is required", "")
		return
	}
	var d Decision
	switch body.Decision {
	case "approve":
		d = DecisionApprove
	case "deny":
		d = DecisionDeny
	case "approve_all":
		d = DecisionApproveAll
	default:
		writeError(w, http.StatusBadRequest, codeBadRequest, "decision must be approve, deny, or approve_all", "")
		return
	}
	if err := s.approvals.Resolve(id, d); err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, err.Error(), "")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- T028: Undo and usage ---

// POST /v1/workspaces/{id}/undo
func (s *Server) handleUndo(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	entry, ok := ws.popUndo()
	if !ok {
		writeError(w, http.StatusNotFound, codeNotFound, "undo stack is empty", "")
		return
	}
	repo := filepath.FromSlash(ws.Path)
	if err := agent.Restore(repo, entry); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":     entry.Path,
		"restored": entry.HadPrevious,
		"deleted":  !entry.HadPrevious,
		"depth":    ws.undoDepth(),
	})
}

// GET /v1/workspaces/{id}/usage
func (s *Server) handleUsage(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	client, err := ws.Client()
	if err != nil {
		writeError(w, http.StatusConflict, codeNoAPIKey, err.Error(), "")
		return
	}
	calls, prompt, completion := client.Usage()
	writeJSON(w, http.StatusOK, map[string]any{
		"calls":             calls,
		"prompt_tokens":     prompt,
		"completion_tokens": completion,
		"model":             client.Model,
	})
}
