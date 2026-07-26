# 08 — Testing

Test where the bug lives. This app has three layers and each has one kind of bug
it is prone to; test that kind at that layer and nowhere else.

| Layer | Prone to | Tested with |
| --- | --- | --- |
| Go daemon | wrong payloads, auth holes, run lifecycle, path escapes | `httptest` + table tests |
| Rust shell | handshake parsing, process lifetime | `cargo test` + one manual check |
| Front-end | SSE parsing, store reducers, streaming behaviour | Vitest |
| The whole thing | integration | a scripted smoke run + the milestone acceptance lists |

No Playwright/WebDriver suite in v1. Driving a WebView2 window in CI costs more
than it catches at this size; the milestone acceptance tests in `PLAN.md` are the
end-to-end coverage, run by a human (or the implementing agent) at each milestone.

## 8.1 Go — the bulk of the value

One `_test.go` per handler file. A shared helper builds a server against a temp
repo:

```go
func newTestServer(t *testing.T) (*httptest.Server, string) {
    t.Helper()
    t.Setenv(config.HomeEnv, t.TempDir())     // NEVER touch the real ~/.kaioken
    repo := t.TempDir()
    writeFixtureRepo(t, repo)                 // a few .go files + a .kaioken/config.yaml
    srv := httptest.NewServer(newMux(testDeps(t)))
    t.Cleanup(srv.Close)
    return srv, repo
}
```

**`t.Setenv(config.HomeEnv, …)` is mandatory in every test that can reach global
config.** `internal/config/global.go` documents exactly why: without it, a test
exercising the key-entry path overwrites the developer's real API keys.

### What must be covered

**Auth and origin** — table-driven, run against a representative endpoint:

| token | Origin | expect |
| --- | --- | --- |
| absent | — | 401 `unauthorized` |
| wrong | — | 401 `unauthorized` |
| right | absent | 200 |
| right | `tauri://localhost` | 200 |
| right | `http://localhost:1420` | 200 |
| right | `http://evil.example` | 403 `forbidden_origin` |

**SSE** — subscribe, publish three events, assert three parsed frames with
increasing `seq`; disconnect; publish two more; reconnect with `since` and assert
the two are replayed. Then assert a `since` older than the ring yields
`stream.reset`.

**Slow subscriber** — fill a subscriber's buffer without reading, publish more,
assert `Publish` does not block and the subscriber is dropped. A wiki run must
never be stalled by a wedged front-end.

**Runs** — start a run whose body blocks on `ctx.Done()`; assert `run.started`
fired and state is `running`; cancel; assert state is `cancelled` (**not**
`failed`) and `run.finished` fired. Separately: a run whose body panics still
publishes `run.finished` with `failed`.

**Approvals** — `Register` then assert the returned channel blocks; `Resolve`
and assert the waiter unblocks with the right decision; assert `Expire` makes
`Resolve` return `not_found`; assert a timeout denies.

**Path confinement** — a table of hostile paths against `/wiki/doc`, `/file`,
and `/cards/{module}/{card}`:
`../../../etc/passwd`, `..\\..\\windows\\system32\\config\\sam`, `/etc/passwd`,
`C:/Windows/win.ini`, `foo/../../../bar`, a symlink pointing outside the repo.
Every one must be `403 path_escape`. This is the highest-severity class of bug in
the whole app; test it exhaustively.

**Key redaction** — assert that no response body from `/v1/settings`,
`/v1/workspaces/{id}/config`, or `/v1/health` contains a stored key. Write it as
a substring assertion over the raw JSON, not a field check, so a future field
addition cannot silently leak one.

**Config round-trip** — `PUT /config` then read `.kaioken/config.yaml` from disk
and assert `config.Load` returns the same values *and* the comment header
survived.

**Provider calls** — never hit a real provider. Stand up an `httptest` server
returning canned OpenAI-shaped JSON and point the workspace's `base_url` at it.
`llm.Client` is a struct, so `BaseURL` is the seam; no engine refactor needed.

**Validation** — YAML that fails schema must return `422` with `problems[]` and
leave the file on disk byte-identical. Assert the bytes.

### Engine additions

`agent.DiffHunks` gets its own table test: single-line change, multi-hunk change,
new file, deletion, no-change, a change larger than the 400-line cap, CRLF input,
and a file with no trailing newline.

## 8.2 Rust

Small surface, three tests:

- Handshake parsing: valid line → `DaemonInfo`; a line of ordinary log output
  before the handshake is skipped; malformed JSON does not panic.
- The stdout drain loop terminates on `Terminated`.
- `open_external` rejects `file://`, `javascript:`, and a custom scheme.

Plus one manual check per platform that cannot be automated cheaply: **close the
app, confirm no orphaned `kaioken-daemon` process.** Put it in the M0 acceptance
list so it is done deliberately.

`cargo clippy -- -D warnings` is part of the build gate.

## 8.3 Front-end (Vitest)

Test the pure logic; do not snapshot-test layout.

- **`lib/sse.ts` frame parser** — the cases in §5.4: split mid-`data:`,
  multi-line `data`, heartbeat comments, CRLF, trailing partial frame, and a
  frame arriving in single-character chunks (the pathological case).
- **Store reducers** — feed a recorded event sequence into `chat.ts` and assert
  the transcript. Particularly: `chat.delta`×N then `chat.message` must leave
  exactly one assistant message with no duplicated prose. That is the bug this
  design is most likely to produce, so it gets a dedicated test.
- **`ApiError.from`** — parses the §2.1 envelope, survives a non-JSON body.
- **Markdown link resolution** — relative wiki link → in-app route; `http(s)` →
  external; `file://` → inert.
- **Reconnect logic** — a mocked `fetch` that fails twice then succeeds; assert
  backoff timings and that `since` carries the last seen `seq`.

Record real event sequences from a live daemon into `src/__fixtures__/*.json`
during development; replaying real data beats hand-written fixtures that drift.

## 8.4 Integration smoke script

`desktop/scripts/smoke.mjs` — no GUI, exercises the contract end to end:

1. Start `kaioken daemon -port 7799 -token smoketoken` against a fixture repo.
2. `GET /v1/health` → assert `status: ok`.
3. Open the fixture workspace; assert `has_config`.
4. Open the SSE stream in the background and collect events.
5. Start a `scan` run; assert `run.started` → `run.finished` with `state: done`.
6. Assert 401 without the token and 403 with a hostile `Origin`.
7. Kill the daemon; assert the process is gone.

Exit non-zero on any failure. Runs in CI on Linux only (it needs no WebView) and
catches contract regressions cheaply.

## 8.5 Manual checklist per milestone

The acceptance lists in `PLAN.md` §4 are the manual suite. Two rules:

- **Run them, do not reason about them.** "This should work" is not a pass.
- **Record the actual output** in the milestone's completion note — the curl
  response, the screenshot, the `git status` that proves a denied edit changed
  nothing.
