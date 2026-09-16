# M3-01 · Audit v1.6 desktop ships for Studio carry-over

> Perform a systematic audit of the seven original v1.6 desktop deliverables, documenting which
> survive into Kaioken Studio (Theia), which die with Tauri, and the technical rationale for each.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | `roadmap/README.md` §4, `kaioken_v2/docs/studio-v0.1-scope.md` |
| **Blocks** | `02-per-hunk-diff-approval` through `07-multiplier-dial-and-estimate` |
| **Touches** | Documentation |
| **Risk** | Low. Audit and specification alignment |
| **Gate-critical** | **No** |

## Why this exists

In v1, M3 was scoped to harden the Tauri desktop client (`.kaioken_v1/ROADMAP.md:88-97`). When
commit `e46fe1b5` archived the Tauri app (`desktop/` and `src-tauri/`), the naive assumption would
be that all of M3 was invalidated.

That assumption is false. While the Tauri IPC wrappers, Rust sidecar launchers, and custom webview
shims are dead, the **core interaction model** of an agentic IDE survives completely. An audit is
required to separate dead framework artifacts from surviving user-experience requirements, ensuring
that Kaioken Studio inherits every critical UX safeguard developed for v1.6 while dropping the
explicitly refused non-goals (such as a WYSIWYG wiki editor).

## Current state

Verified against repository records.

| Fact | Evidence |
|---|---|
| Historical 7 ships listed | `.kaioken_v1/ROADMAP.md:88-97` (per-hunk diff, cost meter, quit guard, workspace dashboard, error copy, editors/dial, stale-wiki banner) |
| Tauri shell archived | `desktop/` and `src-tauri/` moved to `.kaioken_v1/` by `e46fe1b5` |
| Studio target is Theia | `roadmap/README.md` §4 and `ide_kaioken/kaioken_studio_theia/` |
| Studio v0.1 scope frozen | `kaioken_v2/docs/studio-v0.1-scope.md:55-66` (chat pane, wiki browser, status bar, approval dialog) |
| Refused non-goal | `roadmap/README.md` §7 explicitly lists "Wiki WYSIWYG editor — the wiki is generated. Hand-editing it fights incrementality" |

## Comprehensive audit table

| # | v1.6 Original Ship | Disposition | Where it lands in Studio / v2 | Technical Rationale |
|---|---|---|---|---|
| 1 | **Structured per-hunk diff approval** | **SURVIVES** | `02-per-hunk-diff-approval.md` | Monaco diff editor in chat pane. Per-hunk approval is the single primary differentiator over terminal execution |
| 2 | **Always-visible cost meter** | **SURVIVES** | `03-session-cost-meter.md` | Status bar contribution in Theia. Replaces blind API consumption with live spend visibility |
| 3 | **Quit-with-active-runs guard** | **SURVIVES** | `04-quit-with-active-runs-guard.md` | Electron `beforeunload` / `close` event interception. Prevents accidental destruction of long-running wiki/plan jobs |
| 4 | **Workspace dashboard** | **SURVIVES** | `05-workspace-dashboard.md` | Studio Welcome/Repository overview widget backed by `packages/provenance` and `packages/gitops` |
| 5 | **Error copy per `ApiError.code`** | **SURVIVES** | `06-error-copy-per-failure-code.md` | Studio notification & inline error renderer. Maps engine failure codes to human remediation sentences |
| 6a | **Multiplier dial & cost preview** | **SURVIVES** | `07-multiplier-dial-and-estimate.md` | Chat composer dial (x1–x10) backed by `packages/model/depthFor()`, with cost preview before execution |
| 6b | **Wiki WYSIWYG editor** | **DIES** | Refused non-goal | Hand-editing generated documentation desynchronizes page hashes and breaks incrementality (`status --check`) |
| 6c | **Skills viewer / editor** | **SURVIVES** | Studio Wiki/Skills TreeWidget | Read-only inspection of `.kaioken/skills/` markdown files |
| 7 | **Stale-wiki banner with 1-click update** | **SURVIVES** | `05-workspace-dashboard.md` & Status bar | Computes staleness via `packages/provenance` and triggers incremental `update` |

## What died with Tauri

These items are completely eliminated and must never be ported:
- **Tauri IPC Command Bridge:** (`invoke('plugin:...')`). Replaced by Theia's typed RPC (`RpcConnectionHandler`) and in-process package loading.
- **Custom Tauri Window Titlebar:** Custom 44px frameless titlebar with CSS glassmorphism (explicitly deferred in `studio-v0.1-scope.md` §3).
- **Tauri Auto-Updater:** Replaced by Electron auto-updater or package manager updates.
- **Go Sidecar Subprocess Lifecycle:** Tauri spawned a Go binary on port 34115 and watched its PID. Theia runs Node in-process; no sidecar PID watcher exists.

## What done looks like

- [ ] Audit is committed and cross-referenced in `roadmap/m03-desktop-depth-pass/README.md`.
- [ ] Each surviving ship has an assigned leaf in M3 with a complete functional specification.
- [ ] Refused non-goals (WYSIWYG wiki editor) are formally recorded as rejected.

## Steps

1. Review `.kaioken_v1/ROADMAP.md:88-97` against `kaioken_v2/docs/studio-v0.1-scope.md`.
2. Confirm the alignment of the 7 ships into M3 leaves `02` through `07`.
3. Validate that no planned work reintroduces Tauri or Go sidecar concepts.

## In scope

- Analysis and audit documentation in `roadmap/m03-desktop-depth-pass/01-carry-over-audit.md`.

## Out of scope

- Implementing GUI components (covered in individual leaves).
- Modifying Theia extension source code.

## Gates

Review check: ensure all 7 original ships are accounted for in the table.

## Traps

| Trap | Guard |
|---|---|
| Reviving the WYSIWYG wiki editor | README §7 explicitly refuses this. The wiki is machine-generated from code; manual edits corrupt provenance |
| Assuming Studio builds its own Monaco editor | Theia already provides Monaco, syntax highlighting, diff viewing, and file explorer for free |

## Open questions

None.

## Session brief

```xml
<task>
Audit the seven original v1.6 desktop deliverables against the Kaioken Studio (Theia) architecture,
confirming which items survive, which die with Tauri, and documenting their target M3 leaves.

Verify:
- All 7 ships from .kaioken_v1/ROADMAP.md:88-97 are mapped.
- Dead Tauri artifacts (sidecars, Tauri IPC, custom frameless window styling) are explicitly marked dead.
- Non-goals (WYSIWYG wiki editor) are flagged as refused per README §7.
- Surviving items (per-hunk diff, cost meter, quit guard, dashboard, error copy, multiplier dial)
  are mapped to M3-02 through M3-07.
</task>

<verification_loop>
Confirm roadmap/m03-desktop-depth-pass/01-carry-over-audit.md contains the complete 7-item matrix.
</verification_loop>

<missing_context_gating>
Do not invent new Studio panes outside studio-v0.1-scope.md. Studio v0.1 has two panes only:
Chat/Agent and Wiki Browser.
</missing_context_gating>

<action_safety>
Documentation only. Do NOT run git add or git commit. Leave changes uncommitted in working tree.
</action_safety>

<structured_output_contract>
End with: (1) summary of surviving vs dead ships, (2) mapping to M3 leaves, (3) confirmation of
alignment with studio-v0.1-scope.md.
</structured_output_contract>
```
