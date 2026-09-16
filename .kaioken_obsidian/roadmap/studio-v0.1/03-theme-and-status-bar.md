# STUDIO-03 · Kaioken dark theme and status bar telemetry

> Implement the ANSI-derived Kaioken dark theme through Theia's native theming engine and contribute
> the persistent status bar telemetry: connection state, active run count, and an honest token accumulator.

| Field | Value |
|---|---|
| **Status** | `ready` (initial implementation verified in `studio-v0.1-build-notes.md` §5–6; styling polish remains) |
| **Size** | S |
| **Depends on** | `01-spike-and-stop` |
| **Blocks** | `04-chat-pane-and-approval-dialog` (makes subsequent UI screenshots and widgets render correctly) |
| **Touches** | `ide_kaioken/kaioken_studio_theia/theia-extensions/kaioken/src/browser/theme/`, `kaioken-status-bar-contribution.ts` |
| **Risk** | Low — isolated to styling and status bar contribution |
| **Gate-critical** | No |

## Why this exists

The scope document ([`kaioken_v2/docs/studio-v0.1-scope.md:99-100`](../../kaioken_v2/docs/studio-v0.1-scope.md#L99-L100))
places the theme and status bar third in sequence for a deliberate pragmatic reason: *it makes every
subsequent screenshot look right*. Building the complex chat pane inside an unstyled, default-blue
IDE shell produces screenshots that look like a generic editor with an alien widget.

Furthermore, the status bar establishes the core telemetry contract defined in `DESIGN.md`:
connection status, live active background runs, and a running session token accumulator.
Cross-referencing gap **G-4** ([`roadmap/gaps/g4-token-and-cost-accuracy.md`](../gaps/g4-token-and-cost-accuracy.md)),
the token accumulator is governed by the project's honesty requirement: when model usage data is
missing or unmeasured, the UI must report that accounting is unavailable rather than displaying a
false zero or confident fabricated metric.

## Current state

Verified against [`kaioken_v2/docs/studio-v0.1-build-notes.md:158-177`](../../kaioken_v2/docs/studio-v0.1-build-notes.md#L158-L177)
and [`ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/browser/`](../../ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/browser/):

| Fact | Evidence |
|---|---|
| Theming API requirement | `MonacoThemingService.registerParsedTheme()` must be called during frontend `initialize()`; `register()` expects a URI |
| Theme default configuration | `applications/electron/package.json` sets `workbench.colorTheme` to `"kaioken-dark"` as preference default, avoiding start-up clobbering |
| Colour foundation | Neutral near-black surfaces (`#0f0f11` editor, `#131316` chrome, `#232328` borders), Kaioken orange (`#ff8700`) as primary accent |
| Shipped status bar files | `node_modules/theia-ide-kaioken-ext/src/browser/kaioken-status-bar-contribution.ts` registered in frontend DI module (Blueprint path `theia-extensions/kaioken/`) |
| Token accumulator gap | Gap G-4 notes provider accounting variability; accumulator currently needs explicit "estimate / unverified" badge when model data lacks usage tokens |

## What done looks like

- [ ] On first launch, Kaioken Studio boots directly into the `Kaioken Dark` theme without flashing light or generic blue themes.
- [ ] Surface colours match the design system: neutral near-black editor, `#232328` hairline borders, and ANSI-derived syntax colouring.
- [ ] Status bar displays three persistent telemetry items:
  1. Connection state indicator (`● connected` in green or `○ offline` in rose).
  2. Active run counter (`N runs` in orange when in-flight, `0 runs` when idle).
  3. Session token accumulator (`Σ tokens` with cost estimate, or a warning indicator if unmeasured per G-4).
- [ ] Theme switching via Preferences preserves user choices and does not reset on application restart.
- [ ] Radii strictly adhere to the terminal contract (≤ 4px, no rounded bubbles).

## Steps

1. **Verify Theme Registration:** Ensure `kaioken-dark.ts` defines all Monaco editor workbench colour tokens and semantic syntax tokens according to `studio-design-brief.md` §3.
2. **Hook Lifecycle Initialization:** Ensure `KaiokenThemeContribution` implements `FrontendApplicationContribution.initialize()` and registers via `monacoThemingService.registerParsedTheme()`.
3. **Wire Status Bar Telemetry:**
   - Implement `StatusBarContribution` in `kaioken-status-bar-contribution.ts`.
   - Subscribe to backend RPC events: connection status, run start/finish events, and token usage events.
4. **Implement Honesty Guard for G-4:**
   - In the token accumulator component, inspect the token payload from `model.ts` / `agent-host.ts`.
   - If token accounting is reported as estimated or unavailable, render a `~` prefix and an amber indicator, warning the user that provider token counts are approximate.
5. **Visual Inspection:** Run `yarn electron start`, verify status bar layout, and confirm theme persistence across restarts.

## In scope

- `ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/browser/theme/` (Blueprint path `theia-extensions/kaioken/src/browser/theme/`)
- `ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/browser/kaioken-status-bar-contribution.ts`
- `ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/browser/style/index.css`
- `ide_kaioken/kaioken_studio_theia/applications/electron/package.json` (theme preference default)

## Out of scope

- Chat pane transcript and diff cards — that is `04`.
- WebGL CRT backdrop or ambient shader animations (explicitly deferred in scope doc §3).
- Frameless 44px titlebar or custom 68px nav rail (stock Theia activity bar retained).
- Backend engine changes in `kaioken_v2/`.

## Gates

From `ide_kaioken/kaioken_studio_theia/`:

```bash
yarn electron build
yarn electron start
```

Manual checks:
1. Window launches in dark mode with titlebar and status bar styled in Kaioken palette.
2. Status bar items visible at bottom right: `● connected`, `0 runs`, `Σ 0 tokens`.
3. Running a scan updates the run counter and increments token telemetry if applicable.

## Traps

| Trap | Guard |
|---|---|
| Registering theme imperatively in `onStart` instead of `initialize` | `workbench.colorTheme` is resolved during early start-up. Registering after `initialize` loses the first paint and flashes default theme. |
| Overriding user theme choice on every launch | Set `workbench.colorTheme` as a preference default in `applications/electron/package.json`, do not force it programmatically in TypeScript. |
| Displaying precise token dollar amounts when provider returned no usage | Per G-4, provider variance means usage is often unavailable. Print an estimate indicator `~` or warning icon, never a confident `$0.000`. |
| Adding glowing scanlines or rounded cards | `studio-design-brief.md` §2 rule 2: "Glow means state, never decoration." Corner radii must stay ≤ 4px. |

## Open questions

None. The theme API and registration sequence have been verified in the working tree.

## Session brief

```xml
<task>
In ide_kaioken/kaioken_studio_theia/, polish and finalize the Kaioken Dark theme and status bar telemetry:

1. In theia-extensions/kaioken/src/browser/theme/kaioken-dark.ts, complete the workbench and editor
   token palette mapping to ANSI values from kaioken_v2/docs/studio-design-brief.md §3:
   - surfaces: #0f0f11 (editor background), #131316 (chrome/sidebar), #232328 (hairline borders)
   - accent: #ff8700 (Kaioken orange) for active focus, selection tabs, and badges
   - semantic: green (#00d787) for additions, rose (#ff5f5f) for deletions, amber (#ffaf00) for warnings.
2. Verify that KaiokenThemeContribution calls monacoThemingService.registerParsedTheme() during
   the initialize() phase of the frontend lifecycle.
3. In theia-extensions/kaioken/src/browser/kaioken-status-bar-contribution.ts, implement the three
   telemetry items:
   - Connection state dot: green "● connected" / rose "○ disconnected"
   - Active runs indicator: orange "1 run" / muted "0 runs"
   - Token accumulator: "Σ <count> tokens (~$<cost>)"
4. Enforce Gap G-4 honesty: if model accounting metadata indicates unmeasured or cloned limits,
   display an amber warning glyph alongside the token count, indicating unverified usage.
5. Keep corner radii <= 4px in CSS. Do NOT add decorative CRT scanlines, glassmorphism, or shaders.
</task>

<verification_loop>
Run from ide_kaioken/kaioken_studio_theia/:
  yarn electron build
  yarn electron start
Confirm:
- App opens with Kaioken Dark applied on first paint.
- Status bar displays connection status, active run count, and token accumulator.
- Changing theme in Settings to Light and restarting preserves the user's choice.
</verification_loop>

<action_safety>
Do not touch kaioken_v2/. Scope strictly to the theme and status bar contribution within
theia-extensions/kaioken/. Do NOT run git add or git commit. Leave changes uncommitted in the
working tree.
</action_safety>

<structured_output_contract>
End with: (1) token definitions confirmed in kaioken-dark.ts, (2) status bar items implemented and
verified, (3) confirmation of the G-4 honesty indicator implementation, (4) screenshots or console
verification notes.
</structured_output_contract>
```
