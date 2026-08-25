# Phase 4 — Cross-cutting

**Branch:** `fix/phase4-cross-cutting` · **Source:** [logic-audit-and-phases.md](../logic-audit-and-phases.md) §4

**Do this one first**, out of numerical order. Two of its items change how every other
diff reads, so landing them later means redoing review work.

## Verified state (2026-08-21)

| Item | Verified |
|---|---|
| `.gitattributes` | absent from repo root |
| `-race` in CI | absent — [ci.yml](../../.github/workflows/ci.yml) `go-test` job runs `make check` only |
| `RunState.Checkpoint` atomicity | **already correct** — [runstate.go:222](../../cli/internal/research/runstate.go) writes `run.json.tmp` then `os.Rename`. Do not "fix" this. |
| `tui.go` size | 3,218 lines (audit said 3,206 — it grew) |

## Work items

### 4.1 Add `.gitattributes` — do this alone, first commit

The repo has no `.gitattributes`, so on Windows every file git touches gets rewritten
LF→CRLF. `gofmt -l` currently reports *every* file in `internal/research` as unformatted
for this reason alone, which makes real formatting drift invisible.

- Add `.gitattributes` with `* text=auto eol=lf` and binary exclusions for
  `*.png`, `*.jpeg`, `*.exe`, `*.ico`, lockfiles as appropriate.
- Run `git add --renormalize .` and commit the renormalization **separately** from the
  `.gitattributes` file itself, so review can skip the mass diff.
- Confirm afterwards: `cd cli && gofmt -l ./...` should report a short, real list
  (or nothing) rather than every research file.

### 4.2 Add `-race` to CI

- Add a `-race` step to the `go-test` job in [ci.yml](../../.github/workflows/ci.yml).
  `ubuntu-latest` has the C toolchain, so cgo is available there.
- **Cannot be verified locally** on this Windows box — no C toolchain. CI is the only
  place it executes. Expect the first run to fail: 45 goroutine launch sites and 58
  mutexes have never been race-checked.
- Any races it surfaces are in scope for this branch.

### 4.3 Concurrent checkpoint temp-file collision — new finding, not in the audit

[dispatchWorkers](../../cli/internal/research/supervisor.go) runs workers under an
`errgroup` and each failing worker calls `e.state.Checkpoint()`. `Checkpoint` writes to a
single fixed path `run.json.tmp` before renaming. Two workers checkpointing concurrently
write the *same* temp file, so one can rename a partially-overwritten file into place.
The rename is atomic; the temp write is not exclusive.

Fix: give each checkpoint a unique temp name (`os.CreateTemp` in `rs.dir`), or serialise
`Checkpoint` under `rs.mu` for the whole write. Add a test that checkpoints concurrently.

### 4.4 `tui.go` split — deferred, do not start here

The audit is explicit this is not urgent. The standing rule instead: every fix in other
phases should move policy *out* of `internal/tui/tui.go`, never into it. Leave the file
alone on this branch.

---

## Paste-ready prompt

```
Work on branch fix/phase4-cross-cutting in D:\project\ai_now_know (Go CLI in cli/,
Tauri+React desktop in desktop/). Read docs/phase-plans/phase4-cross-cutting.md and
docs/logic-audit-and-phases.md §4 first — they define the scope, and I want you to stay
inside it rather than expanding.

Do these in order, as separate commits:

1. Add a .gitattributes (`* text=auto eol=lf` plus binary exclusions). Then run
   `git add --renormalize .` and commit that renormalization as its OWN commit, separate
   from the .gitattributes file, so the mass diff doesn't bury the real change. Verify
   afterwards that `cd cli && gofmt -l ./...` reports a short real list instead of every
   file in internal/research.

2. Add a `-race` step to the go-test job in .github/workflows/ci.yml. Note this cannot
   run locally — this is a Windows box with no C toolchain, so cgo is unavailable and
   `go test -race` will not work here. Do not try to run it; just make the CI change and
   say so plainly. Expect it to fail on first CI run.

3. Fix a concurrency bug I found that is NOT in the audit doc:
   cli/internal/research/runstate.go Checkpoint() writes to a single fixed temp path
   "run.json.tmp" before renaming. cli/internal/research/supervisor.go dispatchWorkers
   runs workers in an errgroup and each failing worker calls Checkpoint() concurrently,
   so two workers can write the same temp file at once and rename a half-written file
   into place. Fix it (unique temp name via os.CreateTemp in rs.dir, or serialise the
   whole write under rs.mu) and add a test that checkpoints concurrently.

Explicitly out of scope: do NOT touch cli/internal/tui/tui.go, and do NOT "fix" the
Checkpoint temp+rename pattern itself — the rename is already correct, only the shared
temp filename is wrong.

Verify with: cd cli && go vet ./... && go test ./... — note that
TestPrismImportAndQuery in internal/daemon fails on this machine for an environmental
reason (Ollama is running but the nomic-embed-text model isn't pulled). That is a known
non-regression; ignore it, don't chase it.
```
