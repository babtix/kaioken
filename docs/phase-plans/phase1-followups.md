# Phase 1 leftovers — agent coding system

**Branch:** `fix/phase1-followups` · **Source:** [logic-audit-and-phases.md](../logic-audit-and-phases.md) §1.5

The four main Phase 1 defects (§1.1–1.4) are merged to `master`. These two smaller items
were left open. Both are small and already scoped.

## Verified state (2026-08-21)

### 1.5a Steering consumes the step budget

[agent.go:104](../../cli/internal/agent/agent.go) — `Run` loops `for i := 0; i < steps; i++`
where `steps` defaults to 25 (TUI) or 40 (delegate). Near the bottom of the loop:

```go
if steered := a.drainSteering(); len(steered) > 0 {
    history = appendUserMessages(history, steered)
    history = ApplyReminders(history, a.Mode)
    continue
}
```

That `continue` advances `i`. So every time the user steers mid-run, the agent loses one
of its steps — the user is charged budget for *correcting* the agent. The same applies to
the follow-up path at the end of the loop, which also re-enters without the model having
made forward progress on the original request.

**Fix direction:** a steering-only iteration is not a step the model spent. Either don't
increment on that path (restructure the loop so `i++` is explicit rather than in the
`for` clause), or grant a step back when steering is drained. Whichever is chosen, keep a
hard ceiling so a steering loop cannot run unbounded — the budget exists to stop runaway
spend, and an attacker-or-accident steering flood must still terminate.

### 1.5b `normalizeToLF` rewrites mixed line endings

[editmatch.go:56](../../cli/internal/agent/editmatch.go):

```go
func normalizeToLF(text string) string {
    text = strings.ReplaceAll(text, "\r\n", "\n")
    return strings.ReplaceAll(text, "\r", "\n")
}
```

Called from [tools.go:919](../../cli/internal/agent/tools.go) on the whole file body
before edits are applied. [restoreLineEndings](../../cli/internal/agent/editmatch.go)
converts back using a *single* detected ending for the entire file. A file with mixed
endings — common in this repo, and about to become more visible once
`fix/phase4-cross-cutting` lands `.gitattributes` — gets silently rewritten to one ending
throughout, producing a diff far larger than the edit the user asked for.

**Fix direction:** preserve the original endings outside the edited region. Only the
replaced span should be normalized and restored; untouched lines should keep whatever
they had. Add a test with a genuinely mixed-ending file asserting that lines outside the
edit are byte-identical afterwards.

**Sequencing:** consider doing this *after* `fix/phase4-cross-cutting` §4.1, since
renormalization changes what the working tree looks like and makes the mixed-ending case
easier to construct deliberately rather than accidentally.

---

## Paste-ready prompt

```
Work on branch fix/phase1-followups in D:\project\ai_now_know (Go CLI in cli/). Read
docs/phase-plans/phase1-followups.md and docs/logic-audit-and-phases.md §1.5 first —
they define the scope. Stay inside it; Phase 1's four main fixes are already merged to
master, these are the two leftovers.

Item 1 — steering should not consume the step budget.
cli/internal/agent/agent.go Run() loops `for i := 0; i < steps; i++`. When the user
steers mid-run, the code appends the steered message and hits `continue`, which advances
i — so the user is charged a step for correcting the agent. The follow-up path at the end
of the loop has the same shape. Fix it so a steering-only iteration isn't counted as a
model step, but keep a hard ceiling so a steering flood still terminates; the budget
exists to stop runaway spend. Add a test asserting the step budget is unchanged after N
steerings.

Item 2 — normalizeToLF rewrites mixed line endings.
cli/internal/agent/editmatch.go normalizeToLF() flattens CRLF and bare CR to LF across
the whole file body, and restoreLineEndings() converts back using ONE detected ending for
the entire file. So editing a file with mixed endings silently rewrites every line,
producing a diff much larger than the requested edit. Fix it so only the edited span is
normalized/restored and untouched lines stay byte-identical. Add a test with a genuinely
mixed-ending file asserting lines outside the edit are unchanged byte-for-byte.

Both fixes must ship with tests that fail without the fix — that's the standard the rest
of this audit's fixes were held to.

Verify with: cd cli && go vet ./... && go test ./... — TestPrismImportAndQuery in
internal/daemon fails on this machine for an environmental reason (Ollama running but
nomic-embed-text not pulled). Known non-regression; ignore it.
```
