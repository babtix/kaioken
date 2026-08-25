# 09 — Risks and known traps

Ordered by expected cost (probability × damage). Each has a mitigation that is a
task, not an intention.

---

## R1 — The NSIS installer does not replace the sidecar on upgrade
**Severity: high · Likelihood: high (known upstream bug)**

Tauri v2 has a reported defect where `externalBin` sidecars are not overwritten
during an NSIS reinstall or upgrade: the main executable updates, the sidecar
stays at the old version. The result is an app whose UI expects contract vN
talking to a daemon speaking vN−1 — and the symptoms are scattered 404s and
missing fields, which look like front-end bugs.

**Mitigations**
1. Make it *detectable*: the front-end compares its own contract version against
   `/v1/health`'s `version` at startup and shows a blocking banner on mismatch.
   Add a `contract` integer to `/v1/health` and bump it on any breaking change.
2. Make it *testable*: the M7 acceptance explicitly installs 0.1.0, then 0.1.1,
   then checks the reported daemon version. Do not skip this.
3. Fallback if it bites: ship the daemon as a `resources` entry instead of
   `externalBin` and spawn it by resolved resource path, which the installer does
   replace. This is a ~20-line change in `daemon.rs`, so it is a cheap escape.

Reference: <https://github.com/tauri-apps/tauri/issues/15134>

---

## R2 — Go is not on `PATH`
**Severity: medium · Likelihood: certain on this machine**

A fresh shell cannot run `go`. It lives at `C:\Program Files\Go\bin`.

**Mitigation:** `scripts/build-sidecar.mjs` searches `GOROOT`, `PATH`, then the
well-known install locations, and fails with a message naming everywhere it
looked (§7.2). No documentation-only mitigation — the script must handle it.

---

## R3 — The output binary is locked while running
**Severity: low · Likelihood: high**

`go build -o kaioken.exe` fails with *"the process cannot access the file because
it is being used by another process"* whenever the TUI — or a running sidecar —
holds it open.

**Mitigation:** build to a temp name and rename over the target (§7.2 step 3).
Rename-over-open-file succeeds on Windows where write-to-open-file does not.

---

## R4 — CSP silently blocks the daemon
**Severity: high · Likelihood: medium**

Without `connect-src … http://127.0.0.1:*`, every request fails with a console
error that reads like a network problem. Hours get lost debugging the Go side of
a working server.

**Mitigation:** ship the CSP in `tauri.conf.json` from task T005, and make the
first front-end code a `GET /v1/health` that renders the daemon version in the
status bar. If M0's acceptance shows a version, CSP is correct — and it is
verified before any other front-end work exists to confuse the diagnosis.

---

## R4b — CORS blocks the daemon even when CSP is correct
**Severity: high · Likelihood: certain, discovered building T011**

CSP's `connect-src` only governs whether the browser is *allowed to attempt*
a request. It says nothing about whether the caller's JS can *read the
response* of a cross-origin one — that is CORS, a separate mechanism, and the
WebView's page origin (`http://localhost:1420` in dev, `tauri://localhost` in
prod) is cross-origin from the daemon's `127.0.0.1:<port>`. Because every
request carries a non-simple `Authorization` header, the browser always
preflights with `OPTIONS` first. A daemon with correct CSP and correct auth
that does not answer CORS still fails every `fetch()` with an opaque
`Failed to fetch` — indistinguishable from the R4 symptom, but a different
cause and a different fix. This was caught only by driving the *real* WebView
(via WebView2 remote debugging, `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=
--remote-debugging-port=9222`) rather than trusting curl and unit tests,
neither of which exercise CORS at all.

**Mitigation:** `originGuard` (`cli/internal/daemon/mux.go`) does double duty:
for an allow-listed `Origin`, it echoes `Access-Control-Allow-Origin: <origin>`
(never a wildcard — see §1.7) on every response, and answers `OPTIONS`
preflights directly with `Access-Control-Allow-Methods` /
`-Allow-Headers: Authorization, Content-Type` before auth even runs (a
preflight never carries the bearer token). Covered by `TestCORSPreflight` and
the CORS-header assertions in `TestAuth`.

---

## R5 — `EventSource` cannot authenticate
**Severity: medium · Likelihood: certain**

The obvious way to consume SSE is `new EventSource(url)`. It cannot set an
`Authorization` header, and a token in the query string ends up in logs and
crash reports.

**Mitigation:** `fetch` + `ReadableStream` + the hand-written frame parser
(§5.4), unit-tested against split-chunk cases. Roughly 60 lines. Do not
substitute `EventSource` "for now" — the auth model would have to change with it.

---

## R6 — Orphaned daemon processes
**Severity: medium · Likelihood: medium**

If the app is force-killed, a naive sidecar keeps running, holding a port and a
repo lock, and the next launch spawns a second one.

**Mitigation:** two independent belts. (a) Rust kills the child on
`RunEvent::ExitRequested`. (b) The daemon reads its stdin to EOF in a goroutine;
when the parent dies the pipe closes and the daemon exits within milliseconds —
this survives a `kill -9` of the parent, which (a) does not. Verified in M0 by
killing the app from Task Manager and checking the process list.

---

## R7 — Streaming markdown melts the main thread
**Severity: medium · Likelihood: high if unaddressed**

Re-parsing a growing markdown string on every token is O(n²) work and makes a
long reply visibly stutter, then freeze.

**Mitigation:** the five-part strategy in §5.6 — memoised committed messages,
rAF-batched delta flushing at ~60 ms, plain-text live tail, markdown only on
completion, lazy mermaid. Verify against a deliberately long reply (ask the model
to write 400 lines) as part of M2's acceptance.

---

## R8 — A blocked approval wedges a run forever
**Severity: medium · Likelihood: medium**

`agent.UI.Approve` blocks the agent goroutine by design. If the front-end never
answers — window closed, stream dropped, modal lost — the goroutine leaks and the
run never ends.

**Mitigation:** a 5-minute timeout that **denies**, plus `Approvals.CancelRun`
denying everything pending when a run is cancelled. A denied write never touches
disk, so the timeout's failure mode is safe by construction. Tested in §8.1.

---

## R9 — Path traversal through document endpoints
**Severity: critical · Likelihood: low, but catastrophic**

`/wiki/doc?path=`, `/file?path=`, and `/cards/{module}/{card}` all take
caller-supplied paths. A traversal turns a local API into an arbitrary-file-read.

**Mitigation:** one `safeJoin` helper, mirroring `agent.resolve`
(`cli/internal/agent/tools.go:170`), used by every path-taking handler; a
table test of hostile inputs including symlinks (§8.1). Review any new
path-taking endpoint against this specifically.

---

## R10 — Long runs versus app lifetime
**Severity: low · Likelihood: high**

A ×10 wiki run on a large repo takes many minutes. A user will close the window
mid-run.

**Mitigation:** a confirm dialog naming the active runs; quitting cancels them.
The engine already records failed sections in `wiki_state.yaml`, so `wiki_retry`
resumes. The UI must present a cancelled run as *cancelled*, never as failed,
and offer *Retry failed sections*.

---

## R11 — Provider rate limits and free tiers
**Severity: low · Likelihood: high**

The user's saved default has been `nvidia/nemotron-3-ultra-550b-a55b:free`, which
rate-limits hard and has weak tool-calling. A free model in the chat agent will
produce confusing failures that look like app bugs.

**Mitigation:** the engine already clamps concurrency to 2 for `:free` models
(`config.EffectiveConcurrency`). The GUI must (a) badge free models in the picker,
(b) show the clamp inline in Settings, and (c) when a chat turn fails with a
tool-calling error on a `:free` model, say so in the error copy and suggest a
tool-capable model. Error copy is a feature here, not a nicety.

---

## R12 — Two markdown renderers drift
**Severity: low · Likelihood: medium**

`internal/serve` renders with goldmark; the app renders with react-markdown. The
same document can look different in `kaioken serve` and in the app.

**Mitigation:** accepted cost (decision D5). Both use GFM; keep slug generation
aligned (`rehype-slug` semantics on both sides, §3.9) so anchors and TOC links
match. If they diverge visibly, the app is authoritative.

---

## R13 — macOS Gatekeeper blocks the unsigned app and its sidecar
**Severity: medium · Likelihood: certain without a certificate**

An unsigned `.app` is quarantined; worse, an unsigned *sidecar* inside a signed
app gets the app killed at launch.

**Mitigation:** document the limitation honestly in the release notes, sign both
binaries with the same Developer ID when one is available, and treat macOS as a
best-effort target for v1. Do not claim macOS support in the README until a
signed build has actually launched on a clean machine.

---

## R14 — Antivirus flags the sidecar
**Severity: low · Likelihood: low-medium**

An unsigned executable that opens a listening socket and spawns shell commands is
a heuristic match for several AV products.

**Mitigation:** sign the Windows binaries when a certificate exists; keep the
listener strictly on `127.0.0.1`; document the false positive. Do not obfuscate
anything to dodge detection — that makes it worse and is the wrong instinct.

---

## R15 — Contract drift between the three layers
**Severity: medium · Likelihood: high over time**

Go, TypeScript, and the document each hold a copy of the shape. They will diverge.

**Mitigation:** (a) `docs/02-api-contract.md` is normative and amended in the same
commit as any handler change (decision D10); (b) the TS event union is a
discriminated union with an exhaustive `switch`, so a new event that the
front-end ignores is a **compile error**; (c) an unknown event type logs a
warning in dev; (d) the `contract` integer in `/v1/health` catches version skew
at runtime (R1).

---

## R16 — Scope creep into an editor
**Severity: medium · Likelihood: medium**

The app will be one small step from "just add a file tree", then "just add
syntax-highlighted editing", then a worse VS Code.

**Mitigation:** the non-goals in `PLAN.md` §2 are binding. Source files are shown
**read-only**, with *Open in editor* delegating to the user's real editor. Any
proposal to edit source in-app is a v2 conversation, not a task.
