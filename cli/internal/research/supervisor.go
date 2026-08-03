package research

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"golang.org/x/sync/errgroup"

	"kaioken/internal/llm"
)

// The deep path (Claude-style): a supervisor delegates independent strands
// to isolated-context workers, each of which returns a compressed finding
// rather than raw documents, and a separate pass later grounds the draft
// against those documents. Two properties are load-bearing and are enforced
// by structure here, not by prompt:
//
//   - the supervisor never sees raw documents, only compressed findings —
//     that is what prevents context rot in long runs;
//   - the workers can search and fetch and nothing else — a successful
//     prompt injection gets a bad paragraph, not a privileged action.

// maxDeepSubtopics caps everything the supervisor may ever spawn across all
// waves: over-spawning is the failure mode the budget exists to stop.
const maxDeepSubtopics = 12

// runDeep executes the deep path. seed carries a fast path's outcome when
// this is a promotion: its findings stand, its sources are already in the
// store, and nothing is re-fetched.
func (e *engine) runDeep(ctx context.Context, seed pathOutcome) (pathOutcome, error) {
	out := pathOutcome{answered: map[string]finding{}}
	if seed.answered != nil {
		out.subs = append(out.subs, seed.subs...)
		for q, f := range seed.answered {
			out.answered[q] = f
		}
		out.roundsRun = seed.roundsRun
	}

	// ---- scope: the brief --------------------------------------------------
	brief := e.state.ReadBrief()
	if strings.TrimSpace(brief) == "" {
		if err := e.state.SetPhase(PhaseScope); err != nil {
			return out, err
		}
		e.pg.stage("scoping the research")
		var err error
		brief, err = e.writeBrief(ctx)
		if err != nil {
			return out, err
		}
		if err := e.state.WriteBrief(brief); err != nil {
			return out, err
		}
		e.state.Event("brief", fmt.Sprintf("%d chars", len(brief)))
	}

	// ---- plan: the delegation contracts ------------------------------------
	snap := e.state.Snapshot()
	subs := snap.Plan
	if len(subs) == 0 {
		if err := e.state.SetPhase(PhasePlan); err != nil {
			return out, err
		}
		e.pg.stage("planning the subtopics")
		var err error
		subs, err = e.planSubtopics(ctx, brief)
		if err != nil {
			return out, err
		}
		e.state.Mutate(func(r *RunMeta) { r.Plan = subs })
		if err := e.state.Checkpoint(); err != nil {
			return out, err
		}
	}
	e.pg.detail(fmt.Sprintf("%d subtopic(s), ≤%d waves", len(subs), e.budget.MaxSupervisorIters))

	// ---- research: the supervisor loop --------------------------------------
	if err := e.state.SetPhase(PhaseResearch); err != nil {
		return out, err
	}
	findings, err := e.runSupervisor(ctx, brief, subs)
	if err != nil {
		return out, err
	}

	// Everything the workers read is already in the store; the citation
	// pool picks it up here, and each finding becomes a legacy-shaped
	// answer the writer and dossier already understand.
	e.pool.addDocs(e.store.Docs())
	for _, f := range findings {
		var sub Subtopic
		for _, s := range subs {
			if s.ID == f.SubtopicID {
				sub = s
				break
			}
		}
		legacy := e.toLegacyFinding(sub, f)
		if _, exists := out.answered[legacy.Question]; exists {
			continue
		}
		out.subs = append(out.subs, legacy.Question)
		out.answered[legacy.Question] = legacy
	}
	out.queries = e.querySnapshot()
	return out, nil
}

// supervisorSystem is the supervisor's standing instruction. It names the
// one rule that keeps long runs sane — findings only, never raw documents —
// and the coverage bar for calling the work complete.
const supervisorSystem = `You supervise a team of research workers. You have
exactly three tools:

- think: scratchpad. Reflect on coverage and what is still missing. No side
  effects; use it before every dispatch decision.
- conduct_research: spawn one worker for one subtopic. Supply the full
  delegation contract: objective (self-contained question), format (shape of
  the required answer), sources (["web"], ["code"] or both), bounds (what is
  out of scope). Incomplete contracts are rejected.
- research_complete: end the research phase.

Rules:
- Dispatch 3 to 5 workers in one message when parallel strands remain.
- You only ever see compressed findings, never raw documents. Do not ask
  for raw text; if a finding is thin, spawn a sharper follow-up strand.
- A subtopic whose finding is already returned is settled; do not re-spawn
  it unless the finding plainly fails its format.
- Call research_complete when every subtopic has at least two independent
  sources behind it (or one authoritative source) and no new strand has
  emerged. Coverage over completionism, but never pad: an extra wave costs
  real money.`

// supervisorTools is the fixed tool set. Resist adding more.
func supervisorTools() []llm.Tool {
	return []llm.Tool{
		{Type: "function", Function: llm.FunctionDef{
			Name:        "think",
			Description: "Private scratchpad: reason about coverage and next steps. No side effects.",
			Parameters:  json.RawMessage(`{"type":"object","properties":{"thought":{"type":"string"}},"required":["thought"]}`),
		}},
		{Type: "function", Function: llm.FunctionDef{
			Name:        "conduct_research",
			Description: "Spawn one isolated worker for one subtopic. All four contract fields are required.",
			Parameters: json.RawMessage(`{"type":"object","properties":{
				"objective":{"type":"string","description":"self-contained question this strand must settle"},
				"format":{"type":"string","description":"required shape of the answer"},
				"sources":{"type":"array","items":{"type":"string","enum":["web","code"]}},
				"bounds":{"type":"string","description":"explicit out-of-scope note"}
			},"required":["objective","format","sources","bounds"]}`),
		}},
		{Type: "function", Function: llm.FunctionDef{
			Name:        "research_complete",
			Description: "Exit the research loop; coverage is sufficient.",
			Parameters:  json.RawMessage(`{"type":"object","properties":{"reason":{"type":"string"}}}`),
		}},
	}
}

// runSupervisor drives the dispatch loop. Findings already persisted —
// from an earlier wave or a resumed run — count as done work.
func (e *engine) runSupervisor(ctx context.Context, brief string, subs []Subtopic) ([]Finding, error) {
	client := e.clients.For(RoleSupervisor)

	loaded, _ := e.state.LoadFindings()
	results := append([]Finding(nil), loaded...)
	objectives := map[string]bool{}
	for _, s := range subs {
		objectives[strings.ToLower(strings.TrimSpace(s.Objective))] = true
	}
	nextID := len(subs) + 1
	spawned := len(loaded)

	messages := []llm.Message{
		{Role: "system", Content: supervisorSystem},
		{Role: "user", Content: e.supervisorContext(brief, subs, results)},
	}

	waves := 0
	// Waves are dispatch rounds and carry the real budget: think-only turns
	// cost turns, not waves, but a pondering model still cannot loop forever.
	maxTurns := e.budget.MaxSupervisorIters*3 + 2
	for turns := 0; turns < maxTurns && waves < e.budget.MaxSupervisorIters; turns++ {
		if e.costReached() {
			e.addWarning("deep research stopped early to stay inside the cost budget")
			break
		}
		if e.deadline() {
			e.addWarning("deep research stopped early to stay inside the time budget")
			break
		}

		msg, err := client.ChatWithTools(ctx, messages, supervisorTools())
		if err != nil {
			return results, fmt.Errorf("supervisor: %w", err)
		}
		messages = append(messages, msg)
		if len(msg.ToolCalls) == 0 {
			break // the model stopped talking; treat as complete
		}

		var (
			replies []llm.Message
			batch   []Subtopic
			ids     []string // tool-call ids parallel to batch
		)
		completing := false
		for _, tc := range msg.ToolCalls {
			switch tc.Function.Name {
			case "think":
				replies = append(replies, toolReply(tc, "Noted. Continue when ready."))
			case "research_complete":
				completing = true
				replies = append(replies, toolReply(tc, "Acknowledged. Ending the research phase."))
			case "conduct_research":
				sub, why := e.acceptDispatch(tc.Function.Arguments, objectives, &nextID, &spawned)
				if sub == nil {
					replies = append(replies, toolReply(tc, "Rejected: "+why))
					continue
				}
				objectives[strings.ToLower(strings.TrimSpace(sub.Objective))] = true
				batch = append(batch, *sub)
				ids = append(ids, tc.ID)
			default:
				replies = append(replies, toolReply(tc, "Unknown tool; only think, conduct_research and research_complete exist."))
			}
		}

		if len(batch) > 0 {
			waves++
			e.pg.stage(fmt.Sprintf("wave %d: %d worker(s) researching", waves, len(batch)))
			batchFindings := e.dispatchWorkers(ctx, batch)
			for i, sub := range batch {
				f := batchFindings[i]
				reply := ""
				if f == nil {
					reply = fmt.Sprintf("Worker for %q failed; the strand is open.", sub.Objective)
				} else {
					results = append(results, *f)
					reply = fmt.Sprintf("Finding for %q:\n%s\nSources read: %d. Claims: %d.",
						sub.Objective, f.Summary, len(f.SourceHash), len(f.Claims))
				}
				replies = append(replies, llm.Message{
					Role: "tool", ToolCallID: ids[i], Name: "conduct_research", Content: reply,
				})
			}
			// Refresh the context so the next turn sees the whole plan and
			// every finding — the supervisor reasons from state, not memory.
			messages = append(messages, replies...)
			messages = append(messages, llm.Message{
				Role: "user", Content: e.supervisorContext(brief, e.currentPlan(), results),
			})
			continue
		}

		messages = append(messages, replies...)
		if completing {
			break
		}
	}
	return results, nil
}

// acceptDispatch validates one conduct_research call against the delegation
// contract and the spawn budget. It returns the accepted subtopic, or the
// reason it was refused.
func (e *engine) acceptDispatch(argsJSON string, objectives map[string]bool, nextID, spawned *int) (*Subtopic, string) {
	var args struct {
		Objective string   `json:"objective"`
		Format    string   `json:"format"`
		Sources   []string `json:"sources"`
		Bounds    string   `json:"bounds"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return nil, "arguments did not parse: " + err.Error()
	}
	sub := Subtopic{
		ID:        fmt.Sprintf("sub-%d", *nextID),
		Objective: strings.TrimSpace(args.Objective),
		Format:    strings.TrimSpace(args.Format),
		Sources:   cleanSourceTags(args.Sources, e.opts.Repo != ""),
		Bounds:    strings.TrimSpace(args.Bounds),
		Status:    SubtopicPending,
	}
	if !sub.Complete() {
		return nil, "incomplete delegation contract — supply objective, format, sources and bounds"
	}
	if objectives[strings.ToLower(sub.Objective)] {
		return nil, "this objective is already covered by an existing subtopic or finding"
	}
	if *spawned >= maxDeepSubtopics {
		return nil, fmt.Sprintf("spawn budget exhausted (%d subtopics)", maxDeepSubtopics)
	}
	*nextID++
	*spawned++
	return &sub, ""
}

// dispatchWorkers runs one wave's workers in parallel, bounded by the
// budget, and checkpoints each completion as it lands.
func (e *engine) dispatchWorkers(ctx context.Context, batch []Subtopic) []*Finding {
	out := make([]*Finding, len(batch))

	e.state.Mutate(func(r *RunMeta) {
		for _, b := range batch {
			b.Status = SubtopicRunning
			r.Plan = append(r.Plan, b)
		}
	})
	_ = e.state.Checkpoint()

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(clampInt(e.budget.MaxWorkers, 1, 16))
	for i, sub := range batch {
		i, sub := i, sub
		g.Go(func() error {
			e.pg.detail("worker started: " + sub.Objective)
			f, err := e.runWorker(gctx, sub)
			if err != nil {
				e.pg.detail("worker failed: " + err.Error())
				e.state.Event("worker", fmt.Sprintf("%s failed: %s", sub.ID, err.Error()))
				e.state.Mutate(func(r *RunMeta) {
					for j := range r.Plan {
						if r.Plan[j].ID == sub.ID {
							r.Plan[j].Status = SubtopicFailed
						}
					}
				})
				_ = e.state.Checkpoint()
				return nil // one failed strand must not sink the wave
			}
			if err := e.state.WriteFinding(f); err != nil {
				e.pg.detail("finding could not be persisted: " + err.Error())
			}
			e.pg.detail(fmt.Sprintf("worker done: %d source(s), %d claim(s)", len(f.SourceHash), len(f.Claims)))
			out[i] = &f
			return nil
		})
	}
	_ = g.Wait()
	return out
}

// currentPlan returns the plan as the run state holds it, including
// supervisor-spawned strands.
func (e *engine) currentPlan() []Subtopic {
	return e.state.Snapshot().Plan
}

// supervisorContext renders the state the supervisor reasons over: the
// brief, every strand with its status, and every compressed finding. It
// never carries raw document text — that rule is what keeps a long run's
// context from rotting.
func (e *engine) supervisorContext(brief string, plan []Subtopic, findings []Finding) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%sResearch brief:\n%s\n\nPlan:\n", e.asOf, brief)
	if len(plan) == 0 {
		b.WriteString("(none yet — decompose the question)\n")
	}
	for _, s := range plan {
		fmt.Fprintf(&b, "- [%s] %s\n", s.Status, s.Objective)
	}
	b.WriteString("\nFindings so far:\n")
	if len(findings) == 0 {
		b.WriteString("(none yet)\n")
	}
	for _, f := range findings {
		fmt.Fprintf(&b, "- %s\n  %s\n", f.SubtopicID, firstSentence(f.Summary))
	}
	// Seeded sources from an escalation, listed so workers can re-read
	// them for free (the store serves them from cache).
	if docs := e.store.Docs(); len(docs) > 0 {
		b.WriteString("\nSources already on hand (fetch by id; cached, unbilled):\n")
		for i, d := range docs {
			if i >= 20 {
				fmt.Fprintf(&b, "- …%d more\n", len(docs)-20)
				break
			}
			fmt.Fprintf(&b, "- %s (%s)\n", d.ID, d.Title)
		}
	}
	return b.String()
}

// toolReply builds the response message for a tool call.
func toolReply(tc llm.ToolCall, content string) llm.Message {
	return llm.Message{Role: "tool", ToolCallID: tc.ID, Name: tc.Function.Name, Content: content}
}

// firstSentence trims a finding to its opening sentence for the context
// block; the full text travels in the tool result.
func firstSentence(s string) string {
	s = strings.TrimSpace(s)
	for i, r := range s {
		if (r == '.' || r == '\n') && i > 0 {
			return s[:i+1]
		}
	}
	if len(s) > 200 {
		return s[:200] + "…"
	}
	return s
}

// toLegacyFinding converts a compressed deep-path finding into the shape
// the writer, dossier and reference list already consume.
func (e *engine) toLegacyFinding(sub Subtopic, f Finding) finding {
	citeSet := map[int]bool{}
	for _, h := range f.SourceHash {
		doc, ok := e.store.ByHash(h)
		if !ok {
			continue
		}
		if n, ok := e.pool.numberForID(doc.ID); ok {
			citeSet[n] = true
		}
	}
	cites := make([]int, 0, len(citeSet))
	for n := range citeSet {
		cites = append(cites, n)
	}
	sortInts(cites)

	supported, total := 0, len(f.Claims)
	var unsupported []string
	for _, c := range f.Claims {
		if len(c.Support) > 0 {
			supported++
		} else {
			unsupported = append(unsupported, c.Text)
		}
	}
	conf := "low"
	switch {
	case total > 0 && supported == total && len(cites) >= 2:
		conf = "high"
	case supported > 0 || len(cites) > 0:
		conf = "medium"
	}
	return finding{
		Question:   sub.Objective,
		Answer:     f.Summary,
		Citations:  cites,
		Confidence: conf,
		Gaps:       strings.Join(unsupported, "; "),
	}
}

func sortInts(ns []int) {
	for i := 1; i < len(ns); i++ {
		for j := i; j > 0 && ns[j] < ns[j-1]; j-- {
			ns[j], ns[j-1] = ns[j-1], ns[j]
		}
	}
}
