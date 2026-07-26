# Agent brief — build Kaioken Desktop

Hand this file (or its contents) to the AI coding agent that will implement the
plan. It is written to be pasted as an opening prompt.

---

## Your assignment

You are implementing **Kaioken Desktop**, a Tauri v2 GUI for an existing Go tool.
The complete specification already exists in the `desktop/` folder of this
repository. **Do not redesign it.** Your job is execution, not architecture.

Read, in this order:

1. `desktop/PLAN.md` — goals, milestones, acceptance tests.
2. `desktop/docs/01-architecture.md` — the process model and the decisions
   already made (with their rationale, so you can tell when a deviation is
   actually warranted).
3. `desktop/docs/02-api-contract.md` — **the frozen contract.** Implement it
   exactly. Field names, status codes, and event names are normative.
4. `desktop/docs/10-tasks.md` — your work queue, T001 through T072, in order.

Then consult `03`–`09` as each task requires.

## Ground rules

1. **Work milestone by milestone.** Do not begin M(n+1) until M(n)'s acceptance
   criteria in `PLAN.md` actually pass. Run the checks; do not assume.
2. **Never modify the engine's behaviour.** You may *add* exported functions to
   `cli/internal/*` when the daemon needs structured data the TUI never needed
   (the plan names each one). You may not change existing signatures, alter
   generation prompts, or touch `internal/tui` beyond what a task explicitly
   asks for. The CLI and TUI must keep working identically.
3. **Backend before frontend.** For each feature: Go handler → Go test → `curl`
   verification → TypeScript type → React component. A component must never be
   the first place a payload shape is decided.
4. **Every task has an acceptance check.** Run it. Paste its real output in your
   progress notes. If it fails, fix it before moving on — do not batch failures.
5. **Prefer deletion to abstraction.** This is a v1. Two concrete implementations
   beat one premature generalisation.
6. **Match the surrounding style.** Go: the existing code comments the *why*,
   uses short receivers, and returns errors with `%w`. React: the `website/`
   folder is the reference for naming, file layout, and Tailwind idiom. Read a
   neighbouring file before writing a new one.

## Environment facts you need before the first build

- **Rust is not installed** on the target machine as of 2026-07-25. Install
  rustup first; on Windows you also need the MSVC C++ build tools.
- **Go is installed but not on `PATH`** in a fresh shell. It is at
  `C:\Program Files\Go\bin`. PowerShell: `$env:Path += ";C:\Program Files\Go\bin"`.
  Bash: `export PATH="$PATH:/c/Program Files/Go/bin"`. The sidecar build script
  must locate Go itself rather than assuming the shell resolves it.
- **`kaioken.exe` is often locked** because the user keeps the TUI running.
  Build to a temporary name and swap: `go build -o kaioken_new.exe ./cmd/kaioken`
  then `Move-Item kaioken_new.exe kaioken.exe -Force`.
- Node 26.4.0 / npm 11.17.0 / pnpm 11.10.0 / git 2.55.0 are present.
- The platform is Windows 11. Paths in the repo use `D:\project\ai_now_know\…`.

## What "done" looks like for a single task

```
T027  Approval dialog with structured diff
  files:   cli/internal/agent/diff.go (add DiffHunks)
           cli/internal/daemon/handlers_chat.go
           desktop/src/components/chat/ApprovalDialog.tsx
  check:   go test ./internal/agent -run TestDiffHunks
           curl -s -H "$AUTH" localhost:$PORT/v1/... | jq .diff.hunks[0]
           GUI: propose an edit, deny it, `git status` shows no change
```

You are done with a task when every line under `check:` has been executed and
passed — not when the code looks right.

## When you get stuck

- **A payload does not fit the contract.** Amend `docs/02-api-contract.md` in the
  same commit as the handler, and note the change in the commit message. The
  contract document is the source of truth; keeping it accurate is part of the job.
- **A Tauri API differs from the plan.** The plan targets Tauri v2.10.x. If the
  installed version's API differs, follow the installed version's docs and add a
  line to `docs/09-risks.md` recording the drift.
- **A milestone's acceptance test is impossible as written.** Say so explicitly,
  explain why, and propose the smallest amendment — do not silently weaken it.

## First three commands

```bash
cd cli && go vet ./... && go test ./...
```
```bash
rustup --version && node --version && npm --version
```
```bash
cat desktop/docs/10-tasks.md
```

Start at T001.
