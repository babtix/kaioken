// Package rpc drives the agent over JSON-RPC 2.0 on stdio. It is the
// embedding contract for other processes — the desktop app's terminal-less
// integrations, editor plugins, scripts — exposing the same agent the TUI
// runs, as methods plus a notification stream of typed events.
//
// Protocol: one JSON object per line, both directions.
//
//	requests:      {"jsonrpc":"2.0","id":1,"method":"agent.prompt","params":{"text":"..."}}
//	responses:     {"jsonrpc":"2.0","id":1,"result":{...}} or {"error":{"code":..,"message":".."}}
//	notifications: {"jsonrpc":"2.0","method":"event","params":{"kind":"assistant_delta",...}}
//
// Methods: session.new, session.resume, agent.prompt, agent.steer,
// agent.follow_up, agent.approve, agent.cancel, agent.state.
//
// Approvals arrive as approval_required events carrying an approval_id; the
// client answers with agent.approve. No answer means denial: the pending
// approval times out closed, keeping the unattended default as safe as the
// headless run command's.
package rpc

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"sync"
	"time"

	"kaioken/internal/agent"
	"kaioken/internal/config"
	"kaioken/internal/llm"
	"kaioken/internal/session"
)

// approvalTimeout is how long a pending approval waits for agent.approve
// before denying. Generous because a human may be reviewing a large diff.
const approvalTimeout = 10 * time.Minute

// JSON-RPC 2.0 error codes.
const (
	codeParse          = -32700
	codeInvalidRequest = -32600
	codeMethodNotFound = -32601
	codeInvalidParams  = -32602
	codeInternal       = -32603
	// codeBusy is our own: a prompt arrived while a run is active.
	codeBusy = -32000
)

type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Server holds one stdio session: a repo, a client, one conversation, and at
// most one running agent at a time.
type Server struct {
	repo   string
	cfg    *config.Config
	client *llm.Client

	out   *json.Encoder
	outMu sync.Mutex

	mu        sync.Mutex
	sess      *session.Session
	history   []llm.Message
	mode      agent.Mode
	running   *agent.Agent
	cancelRun context.CancelFunc
	runCtx    context.Context
	approvals map[string]chan bool
	wg        sync.WaitGroup
}

// Serve reads requests from in and writes responses and event notifications
// to out until in closes or ctx is cancelled.
func Serve(ctx context.Context, repo string, cfg *config.Config, client *llm.Client, in io.Reader, out io.Writer) error {
	root, err := filepath.Abs(repo)
	if err != nil {
		return err
	}
	s := &Server{
		repo:      root,
		cfg:       cfg,
		client:    client,
		out:       json.NewEncoder(out),
		mode:      agent.ModeBuild,
		approvals: map[string]chan bool{},
	}
	s.newSession(agent.ModeBuild)

	sc := bufio.NewScanner(in)
	sc.Buffer(make([]byte, 0, 64*1024), 16*1024*1024) // prompts can be large
	for sc.Scan() {
		if ctx.Err() != nil {
			break
		}
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var req request
		if err := json.Unmarshal(line, &req); err != nil {
			s.respondErr(nil, codeParse, "could not parse request: "+err.Error())
			continue
		}
		s.dispatch(ctx, req)
	}
	// The pipe closed: stop any run still in flight.
	s.mu.Lock()
	if s.cancelRun != nil {
		s.cancelRun()
	}
	s.mu.Unlock()
	s.wg.Wait()
	return sc.Err()
}

// ---- output ----

func (s *Server) write(v any) {
	s.outMu.Lock()
	defer s.outMu.Unlock()
	_ = s.out.Encode(v)
}

func (s *Server) respond(id json.RawMessage, result any) {
	if id == nil {
		return // notification-style request: no response wanted
	}
	s.write(map[string]any{"jsonrpc": "2.0", "id": id, "result": result})
}

func (s *Server) respondErr(id json.RawMessage, code int, msg string) {
	if id == nil {
		return
	}
	s.write(map[string]any{"jsonrpc": "2.0", "id": id, "error": rpcError{Code: code, Message: msg}})
}

func (s *Server) notify(method string, params any) {
	s.write(map[string]any{"jsonrpc": "2.0", "method": method, "params": params})
}

// emit forwards an agent event as a notification. Approval requests register
// their decision channel first, so an answer can never arrive before the
// server is ready to receive it.
func (s *Server) emit(ev agent.Event) {
	if ev.Kind == agent.EventApprovalRequired {
		s.mu.Lock()
		s.approvals[ev.ApprovalID] = make(chan bool, 1)
		s.mu.Unlock()
	}
	s.notify("event", ev)
}

// Decide implements agent.Approver by waiting for the client's agent.approve.
func (s *Server) Decide(id string, _ agent.ApprovalRequest) bool {
	s.mu.Lock()
	ch := s.approvals[id]
	runCtx := s.runCtx
	s.mu.Unlock()
	if ch == nil {
		return false
	}
	defer func() {
		s.mu.Lock()
		delete(s.approvals, id)
		s.mu.Unlock()
	}()
	var done <-chan struct{}
	if runCtx != nil {
		done = runCtx.Done()
	}
	select {
	case ok := <-ch:
		return ok
	case <-done:
		return false
	case <-time.After(approvalTimeout):
		return false // a timeout must deny, never approve
	}
}

// ---- sessions ----

// newSession resets the conversation under the given mode. Caller must not
// hold s.mu.
func (s *Server) newSession(mode agent.Mode) {
	system := agent.SystemPrompt(agent.PromptInput{
		Root: s.repo, Mode: mode, Model: s.client.Model, AllowRun: true, Notes: s.cfg.Notes,
	})
	s.mu.Lock()
	s.mode = mode
	s.sess = session.New(s.client.Model, s.cfg.Provider)
	s.sess.Mode = string(mode)
	s.history = []llm.Message{{Role: "system", Content: system}}
	s.mu.Unlock()
}

// ---- dispatch ----

func (s *Server) dispatch(ctx context.Context, req request) {
	var p struct {
		Text       string `json:"text"`
		Mode       string `json:"mode"`
		ID         string `json:"id"`
		ApprovalID string `json:"approval_id"`
		Approved   bool   `json:"approved"`
	}
	if len(req.Params) > 0 {
		if err := json.Unmarshal(req.Params, &p); err != nil {
			s.respondErr(req.ID, codeInvalidParams, "bad params: "+err.Error())
			return
		}
	}

	switch req.Method {
	case "session.new":
		mode := agent.ModeBuild
		if p.Mode != "" {
			var err error
			if mode, err = agent.ParseMode(p.Mode); err != nil {
				s.respondErr(req.ID, codeInvalidParams, err.Error())
				return
			}
		}
		if s.busy() {
			s.respondErr(req.ID, codeBusy, "a run is active — agent.cancel first")
			return
		}
		s.newSession(mode)
		s.mu.Lock()
		id := s.sess.ID
		s.mu.Unlock()
		s.respond(req.ID, map[string]any{"session_id": id, "mode": string(mode)})

	case "session.resume":
		if s.busy() {
			s.respondErr(req.ID, codeBusy, "a run is active — agent.cancel first")
			return
		}
		loaded, err := session.Load(s.repo, p.ID)
		if err != nil {
			s.respondErr(req.ID, codeInvalidParams, "could not load session: "+err.Error())
			return
		}
		mode := agent.ModeBuild
		if loaded.Mode != "" {
			if m, err := agent.ParseMode(loaded.Mode); err == nil {
				mode = m
			}
		}
		s.mu.Lock()
		s.sess = loaded
		s.history = loaded.Messages
		s.mode = mode
		s.mu.Unlock()
		s.respond(req.ID, map[string]any{
			"session_id": loaded.ID, "mode": string(mode), "messages": len(loaded.Messages),
		})

	case "agent.prompt":
		if p.Text == "" {
			s.respondErr(req.ID, codeInvalidParams, "text is required")
			return
		}
		if err := s.startRun(ctx, p.Text); err != nil {
			s.respondErr(req.ID, codeBusy, err.Error())
			return
		}
		s.respond(req.ID, map[string]any{"ok": true})

	case "agent.steer":
		s.mu.Lock()
		running := s.running
		s.mu.Unlock()
		if running == nil {
			s.respondErr(req.ID, codeBusy, "no run is active — use agent.prompt")
			return
		}
		running.Steer(p.Text)
		s.respond(req.ID, map[string]any{"ok": true})

	case "agent.follow_up":
		s.mu.Lock()
		running := s.running
		s.mu.Unlock()
		if running == nil {
			s.respondErr(req.ID, codeBusy, "no run is active — use agent.prompt")
			return
		}
		running.FollowUp(p.Text)
		s.respond(req.ID, map[string]any{"ok": true})

	case "agent.approve":
		s.mu.Lock()
		ch := s.approvals[p.ApprovalID]
		s.mu.Unlock()
		if ch == nil {
			s.respondErr(req.ID, codeInvalidParams, "unknown approval_id "+p.ApprovalID)
			return
		}
		select {
		case ch <- p.Approved:
		default: // already decided (timeout or duplicate answer)
		}
		s.respond(req.ID, map[string]any{"ok": true})

	case "agent.cancel":
		s.mu.Lock()
		if s.cancelRun != nil {
			s.cancelRun()
		}
		s.mu.Unlock()
		s.respond(req.ID, map[string]any{"ok": true})

	case "agent.state":
		s.mu.Lock()
		state := map[string]any{
			"busy":       s.running != nil,
			"session_id": s.sess.ID,
			"mode":       string(s.mode),
			"model":      s.client.Model,
			"provider":   s.cfg.Provider,
			"messages":   len(s.history),
		}
		s.mu.Unlock()
		s.respond(req.ID, state)

	default:
		s.respondErr(req.ID, codeMethodNotFound, fmt.Sprintf("unknown method %q", req.Method))
	}
}

func (s *Server) busy() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running != nil
}

// startRun appends the prompt and drives one agent run in its own goroutine,
// streaming events as notifications.
func (s *Server) startRun(ctx context.Context, text string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running != nil {
		return fmt.Errorf("a run is already active — agent.steer to redirect it, agent.cancel to stop it")
	}

	runCtx, cancel := context.WithCancel(ctx)
	ui := &agent.EventsUI{Emit: s.emit, Approver: s}
	ag := &agent.Agent{
		Client:         s.client,
		Root:           s.repo,
		UI:             ui,
		AllowRun:       true,
		MaxSteps:       25,
		Mode:           s.mode,
		MemoryDisabled: s.cfg.Memory.Disable,
		Config:         s.cfg,
	}
	s.history = append(s.history, llm.Message{Role: "user", Content: text})
	history := s.history
	s.running = ag
	s.cancelRun = cancel
	s.runCtx = runCtx

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		hist, err := agent.RunWithEvents(runCtx, ag, history, s.emit)
		cancel()
		s.mu.Lock()
		if hist != nil {
			s.history = hist
			s.sess.Record(hist)
			_ = s.sess.Save(s.repo)
		}
		s.running = nil
		s.cancelRun = nil
		s.runCtx = nil
		s.mu.Unlock()
		_ = err // already reported in the agent_end event
	}()
	return nil
}
