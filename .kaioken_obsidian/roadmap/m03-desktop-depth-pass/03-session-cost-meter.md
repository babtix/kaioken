# M3-03 · Specify the always-visible session cost meter

> Specify an always-visible status bar cost accumulator for Kaioken Studio, tracking cumulative session
> spend and explicitly surfacing provider accounting uncertainties per gap G-4.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-carry-over-audit`, `kaioken_v2/docs/studio-v0.1-scope.md` |
| **Blocks** | Studio status bar contributions, `07-multiplier-dial-and-estimate` |
| **Touches** | `theia-extensions/kaioken/src/browser/status-bar/`, `packages/model/` event hooks |
| **Risk** | Medium. Inaccurate cost calculations undermine user trust in autonomous runs |
| **Gate-critical** | **Yes** |

## Why this exists

In v1, `.kaioken_v1/ROADMAP.md:91` called the always-visible cost meter a "real differentiator":
instead of forcing the user to remember and type `/cost`, the status bar continuously displays
cumulative session spend.

When users drive generative models at depth (`wiki x3`, `plan x5`), token consumption escalates
rapidly. Without live visibility into spend, users default to low multiplier settings out of anxiety.
An always-visible meter makes API consumption transparent.

Crucially, this design must confront **Gap G-4** (`roadmap/README.md` §6 and `kaioken_v2/README.md:378-380`):
when a provider returns incomplete token accounting, or when a model is not in the bundled catalog,
token and cost estimates can be wrong. The cost meter must **never hide this uncertainty**: it must
surface an explicit estimate indicator (`~` or `*`) rather than projecting false precision.

## Current state

Verified against repository records.

| Fact | Evidence |
|---|---|
| Historical requirement | `.kaioken_v1/ROADMAP.md:91` ("Status bar shows cumulative session spend — replaces `/cost`") |
| Studio v0.1 scope commitment | `kaioken_v2/docs/studio-v0.1-scope.md:62` ("Status bar: connection state, active run count, session token accumulator") |
| Known gap G-4 | `roadmap/README.md` §6 ("Token and cost figures can be wrong when a model's accounting is unavailable — a warning prints") |
| Model catalog snapshot limits | `kaioken_v2/README.md:378-380` ("pi-ai's bundled model catalog is a snapshot... token and cost figures may then be wrong") |
| Daemon status payload | `kaioken_v2/apps/cli/src/commands/daemon.ts` emits SSE events on tool/model completions |

`UNVERIFIED:` whether OpenRouter usage payloads consistently return `native_tokens_prompt` and
`native_tokens_completion` across all open-source distilled reasoning endpoints.

## What done looks like

- [ ] A dedicated status bar item is rendered in the lower-right tray of Kaioken Studio.
- [ ] Displays live cumulative session cost: e.g. `$0.042` or `~$0.180*`.
- [ ] Displays cumulative session token counts: e.g. `14.2k tokens (11.8k in / 2.4k out)`.
- [ ] Gap G-4 surfacing:
  - If all model calls in the session provided exact token usage and known catalog rates: render standard format (`$0.045`).
  - If any model call in the session relied on fallback catalog limits or missing usage records: render with an estimate prefix and asterisk (`~$0.045*`).
  - Hovering over the item reveals a tooltip:
    *"Estimated spend. 2 calls used unverified model accounting (see terminal warning for details)."*
- [ ] Clicking the status bar item opens a detailed breakdown popover:
  - Spend by model (e.g. `claude-3-7-sonnet`: $0.038, `minimax-m3`: $0.000).
  - Spend by task (e.g. `wiki outline`: $0.012, `chat turn 4`: $0.026).
  - Reset button to clear session tally (or automatic reset on workspace change).

## Interface layout

### Status Bar Item:
```
[ Kaioken: Ready ] [ Runs: 0 ] [ ~$0.042* (12.4k tok) ]
```

### Detailed Breakdown Popover:
```
+-------------------------------------------------------------+
| Session Spend Breakdown                                     |
+-------------------------------------------------------------+
| Total Spend:      ~$0.042 * (estimated)                     |
| Total Tokens:     12,410 (9,850 input / 2,560 output)       |
+-------------------------------------------------------------+
| By Model:                                                   |
| - anthropic/claude-3-7-sonnet:  $0.038  (4,200 tok)         |
| - minimax/minimax-m3 (free):    $0.000  (8,210 tok)         |
+-------------------------------------------------------------+
| [!] Warning (Gap G-4):                                      |
| 1 call to custom endpoint lacked token accounting.          |
| Figures marked with * are approximated from sibling rates.  |
+-------------------------------------------------------------+
| [ Reset Session Counters ]                                  |
+-------------------------------------------------------------+
```

## Steps

1. **Define Session Cost Store:**
   - In `theia-extensions/kaioken/src/browser/status-bar/session-cost-store.ts`, implement an observable store tracking:
     - `inputTokens: number`
     - `outputTokens: number`
     - `totalCostUsd: number`
     - `isExact: boolean`
     - `discrepancyCount: number`
2. **Hook Model Completion Events:**
   - Listen to model completion streams from in-process `@kaioken/agent` and `@kaioken/wiki`.
   - On each completion, inspect `response.usage`.
   - If usage is missing, increment `discrepancyCount`, set `isExact = false`, and approximate tokens from character length (`chars / 4`).
3. **Contribute Status Bar Widget:**
   - Register `StatusBarEntry` in Theia's `StatusBarImpl` (alignment: right, priority: 100).
4. **Implement Popover Widget:**
   - Render the detailed breakdown popover upon clicking the status bar item.
5. **Add Reset Action:**
   - Provide a reset method invoked on workspace open or manual user click.

## In scope

- Theia status bar contribution in `theia-extensions/kaioken/`.
- Observable token and cost accumulator logic.
- Gap G-4 estimation flagging and tooltip warning.

## Out of scope

- Hard billing ceiling enforcement (handled in M7 sandboxing & resource limits).
- External credit card billing integrations.

## Gates

From `ide_kaioken/kaioken_studio_theia`:

```bash
yarn build
```

Verify that the status bar entry compiles and properly updates its label when simulated model events
fire.

## Traps

| Trap | Guard |
|---|---|
| Silently hiding un-accounted model calls | Gap G-4 rule: never report an estimate as exact. Always append `~` and `*` when accounting is unverified |
| Flashing status bar updates during token streaming | Accumulate tokens during streaming; update the status bar cost label only once per turn completion to avoid UI thrashing |
| Drifting session totals across multiple workspaces | Clear or scope the cost accumulator to the active workspace URI |
| Hardcoding provider pricing | Use dynamic pricing tables or query the provider catalog; never hardcode dollar rates in UI view code |

## Open questions

None.

## Session brief

```xml
<task>
In ide_kaioken/kaioken_studio_theia, specify and build the always-visible session cost meter as a
Theia status bar contribution.

Requirements:
1. Implement a session cost store that aggregates:
   - input tokens, output tokens, total cost in USD.
   - boolean `isExact` flag tracking whether all calls had full token accounting.
2. Render a status bar item in Theia's bottom tray:
   - Standard format: `$0.042 (12.4k tok)`
   - Estimated format (Gap G-4): `~$0.042* (12.4k tok)` when any call lacked verified accounting.
3. Provide a detailed breakdown popover on click showing:
   - Cost per model.
   - Cost per task.
   - An explicit Gap G-4 disclaimer warning if estimates were used.
   - A button to reset session spend.
4. Wire model completion hooks from in-process `@kaioken/agent` and `@kaioken/wiki` into the store.
</task>

<verification_loop>
Verify that the status bar item displays properly in Theia.
Verify that firing a mock model event with null usage sets isExact to false and displays the ~ and *
symbols.
Verify that clicking the item toggles the breakdown popover.
Run yarn build in kaioken_studio_theia to confirm clean compilation.
</verification_loop>

<missing_context_gating>
Do not guess token prices. Read catalog rates from @kaioken/model or default to standard provider
averages with the ~ prefix.
</missing_context_gating>

<action_safety>
Modify only theia-extensions/kaioken/src/browser/status-bar/ components. Do not modify core engine
packages. Do NOT run git add or git commit. Leave work uncommitted in working tree.
</action_safety>

<structured_output_contract>
End with: (1) status bar component implementation, (2) event hook integration, (3) Gap G-4 warning
behavior, (4) build verification result.
</structured_output_contract>
```
