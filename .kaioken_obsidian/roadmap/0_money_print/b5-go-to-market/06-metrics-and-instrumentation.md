# B5-06 · Ethical instrumentation, privacy boundaries, and telemetry

> Define the strict boundary between actionable product analytics and forbidden code inspection, establishing that telemetry on a tool that reads private source code is a trust decision before it is a growth decision.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [`roadmap/money_print/b4-company-formation/04-terms-privacy-dpa.md`](04-terms-privacy-dpa.md), [`01-launch-narrative.md`](01-launch-narrative.md) |
| **Blocks** | Product iteration feedback loops, conversion funnel instrumentation |
| **Touches** | CLI telemetry module, event schema specification, privacy settings |
| **Risk** | Critical. Telemetry that silently captures file names, git remote URLs, or code fragments triggers instant developer revolt, public boycotts, and malicious forks. |
| **Gate-critical** | Yes |

---

## Why this exists

In SaaS applications, product managers track everything: every mouse click, user email, session replay, and database query. 

In developer tools that execute locally against private proprietary source code ([`kaioken_v2/apps/cli/src/main.ts`](file:///D:/project/ai_now_know/kaioken_v2/apps/cli/src/main.ts)), that approach is catastrophic. Software engineers run Kaioken inside commercial codebases containing proprietary algorithms, unannounced products, security-sensitive cryptographic keys, and internal IP. 

Developers routinely run network proxies (Wireshark, Proxyman, Little Snitch) or inspect outgoing packets from new CLI tools. If an engineer discovers that running `kaioken scan` quietly sent their private GitHub repository name, internal file paths, or symbol names to an external analytics server:
1. The company is publicly denounced on Hacker News and Reddit as "spyware".
2. Enterprise corporate firewalls permanently block the CLI binary.
3. The project's legal commitments in [`roadmap/money_print/b4-company-formation/04-terms-privacy-dpa.md`](04-terms-privacy-dpa.md) are violated, inviting regulatory penalties.

**Telemetry on a codebase knowledge engine is a fundamental trust decision before it is a growth decision.** If developers do not trust Kaioken's telemetry boundary, they will not run it on repositories that matter.

This leaf establishes what is measured, what is permanently and unconditionally refused, and enforces an explicit choice on opt-in versus opt-out.

---

## Current state

Verified against engine codebase:

| Dimension | Current status | Evidence |
|---|---|---|
| **Current Telemetry** | **Zero.** Completely offline. | [`kaioken_v2/packages/model/src/index.ts:1-9`](file:///D:/project/ai_now_know/kaioken_v2/packages/model/src/index.ts#L1-L9) — no network calls or analytics beacons exist in the engine. |
| **Privacy Commitments** | Zero code retention in proxy | Defined in [`b4/04`](04-terms-privacy-dpa.md). |
| **Network Transparency** | Commands operate offline by default | `scan`, `symbols`, `verify`, `graph` require no network access ([`kaioken_v2/apps/cli/src/main.ts:31-77`](file:///D:/project/ai_now_know/kaioken_v2/apps/cli/src/main.ts#L31-L77)). |

`UNVERIFIED:` Opt-in telemetry participation rates among developers when presented with an explicit, transparent prompt on first CLI run (typically estimated at 5%–15% for pure opt-in vs 70%–85% for transparent opt-out with immediate toggle).

---

## The explicit decision: Opt-In vs Opt-Out

In developer tools, silent opt-out (quietly enabling telemetry during installation without informing the user) is universally despised (e.g. historical controversies surrounding Next.js, Homebrew, and Netlify CLI). 

The maintainer must not default to silent tracking. The policy for Kaioken is defined as follows:

### The Transparent First-Run Notice with Instant Toggle
On the very first run of `kaioken init`, the terminal prints an un-missable, high-visibility notification before any analytics packet is sent:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│  Kaioken collects anonymous usage metrics to improve AST parsing.         │
│  We NEVER collect source code, file names, repo URLs, or symbol names.    │
│                                                                            │
│  To disable telemetry permanently, run:                                    │
│    kaioken telemetry disable                                               │
│  Or set the standard environment variable:                                │
│    export DO_NOT_TRACK=1                                                   │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Environmental Respect:** The CLI automatically checks and honors the standard `DO_NOT_TRACK=1` environment variable ([Consortium Standard](https://consoledonottrack.com/)). If `DO_NOT_TRACK=1` or `CI=true` is set, telemetry is disabled silently with zero network requests.
- **Offline Invariant:** If the machine has no internet connection, telemetry requests time out silently in $< 200\text{ ms}$ in a background non-blocking thread without hanging the CLI or logging errors.

---

## What to measure vs what to refuse to measure

The telemetry schema must be strictly bounded. Every event must pass through a sanitization filter before serialization:

| Telemetry dimension | WHAT IS MEASURED (Permitted) | WHAT IS UNCONDITIONALLY REFUSED (Forbidden) |
|---|---|---|
| **Commands & Execution** | Command name invoked (`init`, `scan`, `wiki`, `status`), command exit status (`0` or `1`), total execution duration in milliseconds. | Command arguments containing file paths, search query strings (`kaioken search <query>`), or flags containing tokens. |
| **Repository Topology** | Total file count (bucketed: `1-50`, `51-200`, `201-1000`, `1000+`), total declaration count (bucketed), languages detected (`["typescript", "python"]`). | Repository name, Git remote URL (`git@github.com:...`), commit hashes, branch names, or author emails. |
| **AST & Parser Performance** | Tree-sitter query duration, parse error count (e.g. `syntax_errors: 3`), memory consumption (RSS in MB). | File paths of files that failed to parse, snippet of code causing the syntax error, or symbol names. |
| **Environment & Toolchain** | Kaioken version (`v2.0.1`), Node version (`22.4.0`), Operating System family (`linux`, `darwin`, `win32`), CPU architecture (`x64`, `arm64`). | Hostname, username, MAC address, local IP address, or home directory path (`/Users/john/...`). |
| **Model & Invoicing** | Model spec string (`anthropic/claude-3-5-sonnet`), multiplier level (`x1` to `x10`), input token count, output token count. | System prompt contents, user prompt text, code declarations injected into prompt, generated completion text. |

---

## The anonymous event payload schema

Every outgoing telemetry event conforms to this frozen JSON schema:

```json
{
  "$schema": "https://kaioken.dev/schemas/telemetry.v1.json",
  "event": "cli_command_completed",
  "timestamp": "2026-09-03T18:00:00.000Z",
  "anonymous_install_id": "c4b8e2a1-7d3f-4e9b-9a1c-8e4f5a6b7c8d",
  "payload": {
    "command": "scan",
    "exit_code": 0,
    "duration_ms": 342,
    "repo_file_bucket": "51-200",
    "languages": ["typescript"],
    "cli_version": "2.0.0",
    "node_version": "22.4.0",
    "os": "darwin",
    "arch": "arm64",
    "ci": false
  }
}
```

Notice:
- `anonymous_install_id` is a randomly generated UUID stored in `~/.kaioken/telemetry_id`, unrelated to git credentials or hardware hashes.
- Zero identifiable strings. Zero file paths. Zero repository names.

---

## What done looks like

- [ ] Telemetry module implemented under `kaioken_v2/apps/cli/src/telemetry.ts` adhering strictly to the permitted schema.
- [ ] Automated unit tests verifying that passing repository paths or code snippets into telemetry events throws a lint/runtime error.
- [ ] `kaioken telemetry [status|enable|disable]` subcommands implemented and functional.
- [ ] Support for `DO_NOT_TRACK=1` and `CI=true` verified via unit test.
- [ ] A public documentation page at `website/src/pages/Telemetry.tsx` publishing the exact JSON payload schema and privacy guarantees.

---

## Steps

1. **Author the Telemetry Sanitizer (`apps/cli/src/telemetry.ts`).**
   Implement the telemetry dispatcher:
   - Check if `~/.kaioken/config.json` has `telemetry: false` or `process.env.DO_NOT_TRACK === "1"`. If true, return immediately.
   - Dispatch events asynchronously using unref'd HTTP requests to prevent blocking CLI process exit.
2. **Implement CLI Privacy Commands.**
   Add `kaioken telemetry` to CLI:
   - `kaioken telemetry status`: Displays current tracking state and the exact contents of the last sent event.
   - `kaioken telemetry disable`: Sets `telemetry: false` in user config.
3. **Verify Zero-Leakage via Network Interception Test.**
   Write a vitest integration test running `kaioken scan` against a test repository containing secret strings (`SUPER_SECRET_KEY`, `/private/repo/path`). Intercept the outgoing telemetry mock and assert that none of the secret strings appear in the serialized JSON.
4. **Publish Telemetry FAQ.**
   Add a transparent explanation to `website/`: *"What Kaioken Tracks and Why"*.

---

## In scope

- Specifying the permitted vs unconditionally refused telemetry fields.
- Defining the anonymous event payload schema.
- Enforcing transparent user notification and `DO_NOT_TRACK` standard compliance.
- Aligning telemetry architecture with the privacy commitments in `b4/04`.

---

## Out of scope

- Tracking user sessions across web properties with marketing cookies.
- Building a custom real-time analytics data warehouse (use PostHog or a lightweight serverless collector).
- Selling anonymized aggregate developer trends to third parties.

---

## Gates

1. Unit test in `kaioken_v2` verifying that `DO_NOT_TRACK=1` disables all network dispatch.
2. Automated schema validator confirming zero file paths, code snippets, or repo names in telemetry payloads.
3. Public documentation of the telemetry schema published on the website.

---

## Traps

| Trap | Guard |
|---|---|
| Logging the raw error message on failure | An uncaught error like `ENOENT: /Users/alice/secrets/keys.json` leaks private paths. Sanitize error strings down to error codes (e.g. `ENOENT`) before logging. |
| Making telemetry blocking | If an analytics server has latency, a 10ms `kaioken symbols` lookup must not wait 2 seconds for an HTTP POST. Fire and forget asynchronously. |
| Hiding the telemetry opt-out | Make the opt-out prominent and effortless. Developers respect tools that respect their boundaries. |

---

## Open questions

None. The boundary between actionable metrics and forbidden code telemetry is absolute.

---

## Session brief

```xml
<task>
In roadmap/money_print/b5-go-to-market/06-metrics-and-instrumentation.md, establish the ethical telemetry and instrumentation boundary for Kaioken.

This collides directly with b4/04 privacy commitments and the product's core thesis: telemetry on a tool that reads private source code is a trust decision before it is a growth decision.

Document:
1. The explicit Opt-In vs Opt-Out policy: transparent first-run notice with instant toggle, and full DO_NOT_TRACK=1 standard support.
2. What is measured (command names, durations, bucketed file counts, error codes) vs what is UNCONDITIONALLY REFUSED (repo names, git URLs, file paths, symbol names, prompt/completion text).
3. The frozen JSON telemetry event schema.
4. Automated tests to prevent accidental code leakage in error logs.
</task>

<research_mode>
In your analysis, strictly separate:
- OBSERVED FACTS: Local execution model of apps/cli/src/main.ts, zero code retention commitments in b4/04, and current zero-telemetry baseline.
- INFERENCES: How aggressive telemetry in CLI developer tools triggers community forks and boycotts.
- OPEN QUESTIONS: Selection of analytics ingestion backend (PostHog Cloud vs custom Cloudflare Workers endpoint).
</research_mode>

<verification_loop>
Verify citations to roadmap/money_print/b4-company-formation/04-terms-privacy-dpa.md.
Confirm that no file path or code snippet is permitted in the telemetry schema.
</verification_loop>

<action_safety>
Scope strictly to roadmap/money_print/b5-go-to-market/06-metrics-and-instrumentation.md.
Do NOT modify engine source code.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) permitted vs refused telemetry matrix, (2) the DO_NOT_TRACK compliance protocol, (3) anonymous event JSON schema, (4) uncommitted working tree confirmation.
</structured_output_contract>
```
