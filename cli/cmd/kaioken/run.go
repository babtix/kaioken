package main

// kaioken run — the headless agent.
//
// One prompt in, one session out, no alternate screen. The same agent the
// TUI drives, consumed through the typed event stream instead: text mode
// streams prose to stdout, -json emits every event as a JSON line so a
// script (or the desktop app's tooling) can watch the run structurally.
//
// Unattended runs default to denying every state-changing action — a
// headless agent must never gain by silence what an interactive one needs a
// keypress for. -approve widens that deliberately.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"kaioken/internal/agent"
	"kaioken/internal/config"
	"kaioken/internal/llm"
	"kaioken/internal/rpc"
	"kaioken/internal/session"
)

// approvePolicy returns the Approver for a -approve flag value.
func approvePolicy(name string) (agent.Approver, error) {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "", "never":
		return agent.DenyAll, nil
	case "edits":
		return agent.ApproverFunc(func(_ string, req agent.ApprovalRequest) bool {
			switch req.Action {
			case "write", "edit", "remember":
				return true
			}
			return false // run_command and extension tools stay denied
		}), nil
	case "all":
		return agent.ApproverFunc(func(string, agent.ApprovalRequest) bool { return true }), nil
	}
	return nil, fmt.Errorf("unknown -approve policy %q (never | edits | all)", name)
}

func cmdRun(ctx context.Context, f flags) error {
	prompt := strings.TrimSpace(f.prompt)
	if prompt == "" {
		prompt = strings.TrimSpace(f.positional)
	}
	if prompt == "" {
		return errors.New(`run needs a prompt: kaioken run -p "explain the build system"`)
	}

	cfg, err := config.Load(f.repo)
	if err != nil {
		return err
	}
	client, err := newClient(cfg, f)
	if err != nil {
		return err
	}
	root, err := filepath.Abs(f.repo)
	if err != nil {
		return err
	}

	mode := agent.ModeBuild
	if f.mode != "" {
		if mode, err = agent.ParseMode(f.mode); err != nil {
			return err
		}
	}
	policy, err := approvePolicy(f.approve)
	if err != nil {
		return err
	}

	out := json.NewEncoder(os.Stdout)
	emit := func(ev agent.Event) {
		if f.jsonOut {
			_ = out.Encode(ev) // one event per line
			return
		}
		switch ev.Kind {
		case agent.EventAssistantDelta:
			fmt.Print(ev.Text)
		case agent.EventAssistant:
			fmt.Println()
		case agent.EventToolStart:
			fmt.Fprintf(os.Stderr, "→ %s %s\n", ev.Tool, oneLine(ev.Args, 100))
		case agent.EventToolEnd:
			mark := "✓"
			if ev.IsError {
				mark = "✗"
			}
			fmt.Fprintf(os.Stderr, "%s %s: %s\n", mark, ev.Tool, oneLine(ev.Result, 120))
		case agent.EventInfo:
			fmt.Fprintln(os.Stderr, ev.Text)
		case agent.EventApprovalRequired:
			fmt.Fprintf(os.Stderr, "? approval: %s %s\n", ev.Action, ev.Target)
		case agent.EventApprovalResolved:
			verdict := "denied by policy"
			if ev.Approved {
				verdict = "approved by policy"
			}
			fmt.Fprintf(os.Stderr, "  %s\n", verdict)
		}
	}

	ui := &agent.EventsUI{Emit: emit, Approver: policy}
	ag := &agent.Agent{
		Client:         client,
		Root:           root,
		UI:             ui,
		AllowRun:       true,
		MaxSteps:       25,
		Mode:           mode,
		MemoryDisabled: cfg.Memory.Disable,
	}

	system := agent.SystemPrompt(agent.PromptInput{
		Root: root, Mode: mode, Model: client.Model, AllowRun: true, Notes: cfg.Notes,
	})
	history := []llm.Message{
		{Role: "system", Content: system},
		{Role: "user", Content: prompt},
	}

	hist, runErr := agent.RunWithEvents(ctx, ag, history, emit)

	// The transcript is worth keeping even when the run errored: /resume in
	// the TUI can pick it up where the headless run stopped.
	s := session.New(client.Model, cfg.Provider)
	s.Mode = string(mode)
	s.Record(hist)
	if err := s.Save(root); err != nil && runErr == nil {
		runErr = err
	}
	if !f.jsonOut && runErr == nil {
		fmt.Fprintf(os.Stderr, "session saved: %s\n", s.ID)
	}
	return runErr
}

// oneLine flattens and clips a string for a single log line.
func oneLine(s string, max int) string {
	s = strings.Join(strings.Fields(s), " ")
	if len(s) > max {
		return s[:max] + "…"
	}
	return s
}

// cmdRPC serves the agent over JSON-RPC 2.0 on stdio until stdin closes.
func cmdRPC(ctx context.Context, f flags) error {
	cfg, err := config.Load(f.repo)
	if err != nil {
		return err
	}
	client, err := newClient(cfg, f)
	if err != nil {
		return err
	}
	return rpc.Serve(ctx, f.repo, cfg, client, os.Stdin, os.Stdout)
}
