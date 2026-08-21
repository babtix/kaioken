# Phase 2 leftover — deep research worker cancellation

**Branch:** `fix/phase2-followups` · **Source:** [logic-audit-and-phases.md](../logic-audit-and-phases.md) §2.5

Phase 2's four main defects (§2.1–2.4) are merged to `master`. One item remains, and it
is a billing bug: a cancelled run keeps spending money.

## Verified state (2026-08-21)

### 2.5a The worker loop never checks `ctx`

[worker.go:80](../../cli/internal/research/worker.go):

```go
for calls := 0; calls < e.budget.MaxToolCallsPerWorker; {
    if e.costReached() || e.deadline() {
        break
    }
    msg, err := client.ChatWithTools(ctx, messages, workerTools())
    ...
}
```

The loop guards on cost and deadline only. `ctx` cancellation is noticed *incidentally* —
when the in-flight provider call happens to fail because of it. Every tool call already
dispatched still runs to completion first. Confirmed: no `ctx.Err()` or `ctx.Done()`
anywhere in `worker.go`.

**Fix:** check `ctx.Err()` at the top of the loop and return early, the same way
[agent.go](../../cli/internal/agent/agent.go) `Run` already does at both its loop top and
after its tool batch. Match that existing shape rather than inventing a new one.

### 2.5b Sibling failures never cancel the group

[supervisor.go:367](../../cli/internal/research/supervisor.go) `dispatchWorkers`:

```go
g, gctx := errgroup.WithContext(ctx)
...
g.Go(func() error {
    f, err := e.runWorker(gctx, sub)
    if err != nil {
        ...
        return nil // one failed strand must not sink the wave
    }
    ...
    return nil
})
```

Every worker returns `nil` on every path, so `gctx` is never cancelled by
`errgroup.WithContext`. The `gctx` plumbing is decorative today.

**Important — read the intent before changing this.** The `return nil` is *deliberate*
and the comment says why: one failed strand must not sink the whole wave. Do **not**
"fix" it by propagating worker errors — that would change research semantics, turning a
single flaky fetch into a total run failure. The bug is narrower: cancellation of the
*parent* `ctx` should reach the workers promptly, and that is already what `gctx` gives
you once 2.5a lands. Verify whether 2.5a alone closes this; if it does, record that and
leave `dispatchWorkers` as it is.

---

## Paste-ready prompt

```
Work on branch fix/phase2-followups in D:\project\ai_now_know (Go CLI in cli/). Read
docs/phase-plans/phase2-followups.md and docs/logic-audit-and-phases.md §2.5 first.
Phase 2's four main fixes are already merged to master; this is the one leftover, and
it's a billing bug — a cancelled research run keeps paying the provider.

The fix: cli/internal/research/worker.go runWorker() loops on tool-call count and guards
only on `e.costReached() || e.deadline()`. It never checks ctx, so cancellation is only
noticed when the in-flight provider call happens to fail. Add a ctx.Err() check at the
top of the loop and return early. Match the shape cli/internal/agent/agent.go Run()
already uses — it checks ctx.Err() at its loop top and again after each tool batch. Add a
test that cancels the context and asserts the worker stops without making another
provider call.

IMPORTANT — do not change this: cli/internal/research/supervisor.go dispatchWorkers has
workers that `return nil` even on error, with the comment "one failed strand must not
sink the wave". That is deliberate research semantics, not a bug. Do NOT make worker
errors propagate through the errgroup — that would turn one flaky fetch into a total run
failure. After the ctx fix lands, check whether parent-context cancellation now reaches
workers promptly through gctx. If it does, say so and leave dispatchWorkers alone.

Verify with: cd cli && go vet ./... && go test ./... — TestPrismImportAndQuery in
internal/daemon fails here for an environmental reason (Ollama up but nomic-embed-text
not pulled). Known non-regression; ignore it.
```
