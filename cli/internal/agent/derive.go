package agent

// derive constructs a sub-agent derived from the receiver.
//
// Sub-agents inherit the parent's environment (Client, Root, UI, MaxSteps,
// AllowRun, Mode, MemoryDisabled, Budget, Perms) by default, while overriding
// or isolating lifecycle- and identity-specific fields:
//   - Depth is incremented by 1 to gate further delegation (see maxSubAgentDepth).
//   - Context is left nil so the sub-agent's shorter conversation does not pollute
//     the parent's context tracker (see ContextTracker in ctxtrack.go).
//   - Notes is left nil so the sub-agent re-delivers directory notes on its own
//     reads rather than sharing the parent's delivery state.
//   - Config is left nil because delegated work is already routed via routedClient("task").
//   - AutoApprove is reset to false so sub-agents never inherit blanket auto-approval.
//   - Budget is shared because the same client bills both agents and must not out-spend
//     the session's guardrails.
//   - Events is resolved explicitly via a.bus() (defaulting to events.Default if nil),
//     allowing subscribers to observe sub-agent lifecycle events separated by Event.Depth.
//   - NoStream is set to true so sub-agent prose does not interleave with the
//     parent's in the UI.
//   - Queue state (qmu, steering, followUps) is freshly zero-valued and never shared.
//
// Note: We construct the new Agent with explicit field assignments rather than
// performing a plain struct copy (e.g. `cp := *a`) because Agent embeds a sync.Mutex
// (qmu), which must not be copied by value and would be flagged by go vet.
func (a *Agent) derive() *Agent {
	return &Agent{
		Client:         a.Client,
		Root:           a.Root,
		UI:             a.UI,
		AutoApprove:    false,
		MaxSteps:       a.MaxSteps,
		AllowRun:       a.AllowRun,
		NoStream:       true,
		Mode:           a.Mode,
		Depth:          a.Depth + 1,
		MemoryDisabled: a.MemoryDisabled,
		Budget:         a.Budget,
		Events:         a.bus(),
		Context:        nil,
		Notes:          nil,
		Perms:          a.Perms,
		Config:         nil,
	}
}
