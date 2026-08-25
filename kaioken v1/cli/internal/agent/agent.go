package agent

import (
	"context"
	"fmt"
	"strings"

	"kaioken/internal/agent/events"
	"kaioken/internal/llm"
)

// Steering and follow-up queues.
//
// A user watching the agent work often knows something the agent does not —
// that it opened the wrong file, that the requirement changed, that a test is
// already known to be flaky. Without a queue, that knowledge has one path in:
// cancel the run and re-explain everything. So the agent keeps two queues,
// filled from the front-end goroutine while Run owns the conversation:
//
//   - Steer: joins the conversation mid-run, after the current tool batch and
//     before the next model call. The current step always completes — a tool
//     result must never be separated from its call.
//   - FollowUp: waits until the model produces a final answer, then starts
//     another round instead of ending the run.

// Steer queues a user message for injection before the agent's next model
// call. Safe to call from any goroutine.
func (a *Agent) Steer(text string) {
	a.qmu.Lock()
	defer a.qmu.Unlock()
	a.steering = append(a.steering, text)
}

// FollowUp queues a user message to run after the agent would otherwise
// finish. Safe to call from any goroutine.
func (a *Agent) FollowUp(text string) {
	a.qmu.Lock()
	defer a.qmu.Unlock()
	a.followUps = append(a.followUps, text)
}

// ClearQueues drops all queued steering and follow-up messages.
func (a *Agent) ClearQueues() {
	a.qmu.Lock()
	defer a.qmu.Unlock()
	a.steering, a.followUps = nil, nil
}

// QueuedCount reports how many messages are waiting in both queues.
func (a *Agent) QueuedCount() int {
	a.qmu.Lock()
	defer a.qmu.Unlock()
	return len(a.steering) + len(a.followUps)
}

func (a *Agent) drainSteering() []string {
	a.qmu.Lock()
	defer a.qmu.Unlock()
	out := a.steering
	a.steering = nil
	return out
}

func (a *Agent) drainFollowUps() []string {
	a.qmu.Lock()
	defer a.qmu.Unlock()
	out := a.followUps
	a.followUps = nil
	return out
}

// bus returns the lifecycle bus this run reports to: the agent's own when
// one was injected, the process-wide default otherwise. Both queues drain
// through it, so callers never need a nil check.
func (a *Agent) bus() *events.Bus {
	if a.Events != nil {
		return a.Events
	}
	return events.Default
}

// chat runs one model turn, streaming prose to the UI unless streaming is
// disabled. Either way the caller gets the complete assembled message.
func (a *Agent) chat(ctx context.Context, history []llm.Message, tools []llm.Tool) (llm.Message, error) {
	if a.NoStream {
		return a.Client.ChatWithTools(ctx, history, tools)
	}
	onDelta := a.UI.AssistantDelta
	if bus := a.bus(); bus.HasHandlers(events.MessageUpdate) {
		// Deltas arrive on the network goroutine; the bus dispatches
		// synchronously, so MessageUpdate handlers share that constraint.
		onDelta = func(text string) {
			a.UI.AssistantDelta(text)
			bus.Emit(&events.Event{Type: events.MessageUpdate, Text: text})
		}
	}
	return a.Client.ChatWithToolsStream(ctx, history, tools, onDelta)
}

// Run drives the tool-calling loop until the model returns a final answer
// with no steering or follow-up messages pending, the step budget is
// exhausted, or ctx is cancelled. It returns the updated conversation
// history.
func (a *Agent) Run(ctx context.Context, history []llm.Message) (_ []llm.Message, err error) {
	steps := a.MaxSteps
	if steps <= 0 {
		steps = 25
	}
	tools := a.Tools()
	bus := a.bus()
	bus.Emit(&events.Event{Type: events.AgentStart, Depth: a.Depth})
	defer func() { bus.Emit(&events.Event{Type: events.AgentEnd, Depth: a.Depth, Err: err}) }()

	// In PRISM mode, automatically query and inject grounded knowledge context
	// from imported PRISM modules for the active user prompt.
	if a.Mode == ModePrism {
		history = a.injectPrismContext(ctx, history)
	}

	// Refresh the turn's reminders against the prompt they govern. This runs
	// here rather than in a front-end so the TUI and the daemon cannot drift
	// on which constraints the model is actually told about.
	history = ApplyReminders(history, a.Mode)

	// lastCompact is the step a compaction was last attempted at. It starts far
	// enough back that the first one is never rate-limited.
	lastCompact := -recompactCooldown

	// Two counters govern the loop, and the space between them is the
	// point. `i` advances on every turn because it labels bus events and
	// feeds manageContext's compaction cooldown, both of which want a
	// monotonic count of real model calls. `spent` counts only turns billed
	// to MaxSteps. A turn that ends by appending queued steering — or by
	// handing off to a follow-up round — made no progress on the original
	// request; it exists so the model can read the correction, and billing
	// it would charge the user for correcting the agent.
	//
	// The refund reopens the door the step budget closes: a buggy or hostile
	// front-end could Steer forever and keep a run alive past any spend
	// limit. maxTurns is the hard stop that keeps the refund honest. Four
	// times the budget tolerates three corrections per budgeted step — 75
	// steering messages across a default 25-step run, far beyond any
	// legitimate session — while still guaranteeing a flood terminates.
	maxTurns := 4 * steps
	for i, spent := 0, 0; ; i++ {
		if ctx.Err() != nil {
			return history, ctx.Err()
		}
		if spent >= steps {
			return history, fmt.Errorf("stopped after %d steps without a final answer", steps)
		}
		if i >= maxTurns {
			return history, fmt.Errorf(
				"stopped after %d turns (%d charged to the %d-step budget): steering or follow-up messages kept arriving, so the anti-flood ceiling ended the run rather than the step budget",
				i, spent, steps)
		}
		bus.Emit(&events.Event{Type: events.TurnStart, Step: i, Depth: a.Depth})

		// Shrink the context before the request rather than after the provider
		// rejects it. Overflow is not recoverable in place: once the request
		// fails, the history that failed to send is the only history there is,
		// and it is already too large — so the reduction has to happen while the
		// failure is still hypothetical.
		//
		// This is the top of the loop, and it has to be. Anywhere later in the
		// iteration the conversation is mid-turn, with an assistant message
		// whose tool_calls are not all answered yet; compaction may only split
		// on a user message, and rewriting history across that boundary produces
		// something the provider rejects outright. See splitForCompaction.
		history, lastCompact = a.manageContext(ctx, history, i, lastCompact)

		// The budget check runs before the call, not after: the point is to
		// refuse the spend, not to report it. A warning joins the conversation
		// as a context update so the model economizes for the rest of the
		// session, not just this turn. SpendUSD falls back to a catalog
		// estimate, so the guard also works on providers that never report
		// real cost.
		usd, _, known := a.Client.SpendUSD()
		if warn, stop := a.Budget.Check(usd, known); stop != nil {
			return history, stop
		} else if warn != "" {
			a.UI.Info("⚠ " + warn)
			history = append(history, ContextUpdate(warn))
		}
		// The last word before the request leaves: a hook may prune, redact,
		// or annotate the outgoing conversation in place.
		if bus.HasHandlers(events.BeforeProviderRequest) {
			bus.Emit(&events.Event{Type: events.BeforeProviderRequest, Step: i, Depth: a.Depth, History: &history})
		}
		bus.Emit(&events.Event{Type: events.MessageStart, Step: i, Depth: a.Depth})
		msg, cerr := a.chatWithRetry(ctx, history, tools, i)
		if cerr != nil {
			bus.Emit(&events.Event{Type: events.TurnEnd, Step: i, Depth: a.Depth, Err: cerr})
			return history, cerr
		}
		history = append(history, msg)
		// Anchor the context measurement here, while the provider's figure and
		// the conversation it described still line up. Anything appended after
		// this point — tool results, steering — is estimated on top of it.
		if toks, ok := a.Client.LastContextTokens(); ok {
			a.Context.Record(toks, len(history), history)
		}
		bus.Emit(&events.Event{Type: events.MessageEnd, Step: i, Depth: a.Depth, Text: msg.Content})

		if text := strings.TrimSpace(msg.Content); text != "" {
			a.UI.Assistant(msg.Content)
		}

		history = a.runToolCalls(ctx, history, msg.ToolCalls, i)
		bus.Emit(&events.Event{Type: events.TurnEnd, Step: i, Depth: a.Depth})
		if ctx.Err() != nil {
			return history, ctx.Err()
		}

		// Steering joins here — after the tool batch, never inside it — so the
		// model reads the correction before deciding its next step. The turn
		// is not billed: correcting the agent must not cost it a step.
		if steered := a.drainSteering(); len(steered) > 0 {
			history = appendUserMessages(history, steered)
			history = ApplyReminders(history, a.Mode)
			continue
		}

		if len(msg.ToolCalls) > 0 {
			// A tool batch is forward progress on the request; it spends
			// budget.
			spent++
			continue
		}

		// Final answer. Follow-ups queued for "after this run" start another
		// round; otherwise the answer stands. Neither this turn nor the
		// hand-off is billed: the model finished what was asked, and starting
		// the next thing is not a step the original request was promised.
		followUps := a.drainFollowUps()
		if len(followUps) == 0 {
			return history, nil
		}
		history = appendUserMessages(history, followUps)
		history = ApplyReminders(history, a.Mode)
	}
}

func appendUserMessages(history []llm.Message, texts []string) []llm.Message {
	for _, t := range texts {
		history = append(history, llm.Message{Role: "user", Content: t})
	}
	return history
}
