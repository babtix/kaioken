# desktop/ — Kaioken Desktop (Tauri)

This folder is **a plan, not yet an implementation.** It specifies a native
desktop GUI for Kaioken, built with Tauri v2 (Rust shell + WebView) over the
existing Go engine in [`../cli`](../cli), reusing the design system from
[`../website`](../website).

Nothing here is executable yet. The intended workflow is:

1. Read [`AGENT_BRIEF.md`](AGENT_BRIEF.md) — the handoff prompt for the AI agent
   that will build this.
2. Read [`PLAN.md`](PLAN.md) — the master plan: goals, architecture summary,
   milestones, and the definition of done.
3. Work through [`docs/10-tasks.md`](docs/10-tasks.md) — the ordered, atomic task
   list. Each task names the files it touches and a command that proves it works.
4. Consult the reference docs as needed; they are the authority when the task
   list is terse.

## Documents

| File | What it settles |
| --- | --- |
| [`PLAN.md`](PLAN.md) | Product goals, scope, milestones, done-criteria |
| [`AGENT_BRIEF.md`](AGENT_BRIEF.md) | The prompt to hand the executing agent |
| [`docs/01-architecture.md`](docs/01-architecture.md) | Process model, why a Go daemon, decision log |
| [`docs/02-api-contract.md`](docs/02-api-contract.md) | Every endpoint, payload, and SSE event — the frozen contract |
| [`docs/03-go-daemon.md`](docs/03-go-daemon.md) | The new `internal/daemon` Go package, file by file |
| [`docs/04-rust-shell.md`](docs/04-rust-shell.md) | `src-tauri`: config, capabilities, sidecar supervision |
| [`docs/05-frontend.md`](docs/05-frontend.md) | React app structure, state, streaming, design system |
| [`docs/06-screens.md`](docs/06-screens.md) | Screen-by-screen UX spec with states and shortcuts |
| [`docs/07-build-release.md`](docs/07-build-release.md) | Dev loop, sidecar build script, installers, CI |
| [`docs/08-testing.md`](docs/08-testing.md) | What is tested, at which layer, and how |
| [`docs/09-risks.md`](docs/09-risks.md) | Known traps, each with a mitigation |
| [`docs/10-tasks.md`](docs/10-tasks.md) | The executable task list (T001…T072) |

## The one-paragraph version

`kaioken` grows a new subcommand, `kaioken daemon`, that exposes the existing
engine — chat agent, wiki pipeline, skills, cards, config — over a loopback HTTP
API with a Server-Sent Events stream for progress and token deltas. The Tauri app
ships that binary as a sidecar, spawns it on launch with a per-session bearer
token, and the React front-end talks to it directly. The Rust layer stays thin:
spawn, supervise, kill, and hand the front-end a port and a token. No engine code
is rewritten, and the daemon is independently testable with `curl` — which is
precisely what makes this plan safe for an agent to execute.

## Target layout once built

```
desktop/
├── package.json            React 19 + Vite 6 + Tailwind 4 (mirrors website/)
├── index.html
├── vite.config.ts
├── src/                    the front-end
├── src-tauri/              the Rust shell
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   ├── binaries/           kaioken-daemon-<target-triple>[.exe]  (gitignored)
│   └── src/
├── scripts/
│   └── build-sidecar.mjs   builds ../cli and stages the sidecar binary
└── docs/                   this plan (kept as living documentation)
```

## Prerequisites the build machine is missing today

Checked on 2026-07-25 in this repo's environment:

- **Rust toolchain — NOT INSTALLED.** `cargo` and `rustc` are absent. Install via
  [rustup](https://rustup.rs); on Windows this also needs the *Desktop development
  with C++* workload from Visual Studio Build Tools and the WebView2 runtime
  (present on Windows 11 by default).
- **Go — installed but not on `PATH`** in a fresh shell. It lives at
  `C:\Program Files\Go\bin`. The sidecar build script must not assume `go` resolves.
- Node 26.4.0, npm 11.17.0, pnpm 11.10.0, git 2.55.0 — all present.
