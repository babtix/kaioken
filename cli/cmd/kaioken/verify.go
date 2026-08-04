package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"kaioken/internal/agent"
	"kaioken/internal/config"
	"kaioken/internal/llm"
	"kaioken/internal/verify"
)

// cmdVerify runs the repo's own build/test commands green. Step one hands a
// headless agent the detected commands and lets it diagnose-and-fix; step two
// re-runs every command in plain Go, because the gate's verdict — not the
// model's claim — is what "verified" means. The exit code follows the gate.
func cmdVerify(ctx context.Context, f flags) error {
	cmds, err := verify.Detect(f.repo)
	if err != nil {
		return err
	}
	fmt.Printf("verify: %s\n", strings.Join(cmds, "  →  "))

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

	// A verify run exists to make changes; denying everything by default
	// would make it a no-op. -approve still overrides for the cautious.
	approve := f.approve
	if approve == "" {
		approve = "all"
	}
	policy, err := approvePolicy(approve)
	if err != nil {
		return err
	}

	emit := func(ev agent.Event) {
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
		default:
		}
	}

	ui := &agent.EventsUI{Emit: emit, Approver: policy}
	ag := &agent.Agent{
		Client:         client,
		Root:           root,
		UI:             ui,
		AllowRun:       true,
		MaxSteps:       60, // a fix loop needs more room than one shot
		Mode:           agent.ModeBuild,
		MemoryDisabled: cfg.Memory.Disable,
		Config:         cfg,
	}
	system := agent.SystemPrompt(agent.PromptInput{
		Root: root, Mode: agent.ModeBuild, Model: client.Model, AllowRun: true, Notes: cfg.Notes,
	})
	history := []llm.Message{
		{Role: "system", Content: system},
		{Role: "user", Content: verify.Prompt(cmds)},
	}
	if _, runErr := agent.RunWithEvents(ctx, ag, history, emit); runErr != nil {
		// A stopped agent is not a failed verify: the gate decides below.
		fmt.Fprintf(os.Stderr, "agent stopped early: %v — running the gate anyway\n", runErr)
	}

	// The final word: re-run everything without the model in the loop.
	fmt.Fprintln(os.Stderr, "\nfinal gate:")
	results, gateErr := verify.Gate(ctx, root, cmds)
	for _, r := range results {
		mark := "✓"
		if !r.OK {
			mark = "✗"
		}
		fmt.Fprintf(os.Stderr, "  %s %s\n", mark, r.Command)
		if !r.OK && r.Output != "" {
			fmt.Fprintf(os.Stderr, "%s\n", indent(r.Output, "      "))
		}
	}
	return gateErr
}

// indent prefixes every line, for folding command output under its verdict.
func indent(s, prefix string) string {
	lines := strings.Split(strings.TrimRight(s, "\n"), "\n")
	for i, l := range lines {
		lines[i] = prefix + l
	}
	return strings.Join(lines, "\n")
}
