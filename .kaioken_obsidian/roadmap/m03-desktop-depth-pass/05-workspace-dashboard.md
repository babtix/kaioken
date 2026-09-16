# M3-05 · Specify the workspace dashboard landing view

> Specify the repository health landing view for Kaioken Studio, displaying git state, documentation
> freshness from packages/provenance, and one-click update actions instead of an empty editor tab.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-carry-over-audit`, `kaioken_v2/docs/studio-v0.1-scope.md` |
| **Blocks** | Studio Welcome and Repository view completion |
| **Touches** | `ide_kaioken/kaioken_studio_theia/theia-extensions/kaioken/src/browser/dashboard/` |
| **Risk** | Low. Read-only presentation surface backed by existing engine packages |
| **Gate-critical** | **No** |

## Why this exists

In standard IDEs (VS Code, stock Theia Blueprint), opening a workspace presents an empty editor area
with a generic "No files open" or "Getting Started" tab.

In v1, `.kaioken_v1/ROADMAP.md:93` specified the **Workspace dashboard**: a context-rich landing view
that immediately displays git status, stale wiki chapters, recent sessions, and active runs.
Furthermore, ship 7 in v1 (`.kaioken_v1/ROADMAP.md:96`) called for a "stale-wiki banner with one-click
update."

Kaioken is a knowledge engine, not just a text editor. When a repository opens, the developer should
immediately see whether the codebase has drifted past its documentation, which chapters need
regeneration, and what background runs are in flight. The staleness calculations are not guesswork:
they are backed directly by `@kaioken/provenance` and the same deterministic logic that powers
`kaioken status --check`.

## Current state

Verified against repository records and engine packages.

| Fact | Evidence |
|---|---|
| Historical requirement | `.kaioken_v1/ROADMAP.md:93` (workspace dashboard) and `:96` (stale-wiki banner) |
| Provenance package exports | `kaioken_v2/packages/provenance/src/index.ts:1-9` exports `computeStaleness`, `changedSourcesFor`, `invalidatedBy` |
| Deterministic staleness check | `kaioken_v2/README.md:73-82` (`status --check` exits non-zero when documents are stale; `update --dry-run` reports invalidated docs) |
| Git inspection utilities | `kaioken_v2/packages/gitops` exports `isRepo`, `currentBranch`, `hookStatus` |
| Workspace inspect data model | `kaioken_v2/apps/cli/src/commands/daemon.ts:600-714` (`inspectWorkspace`) already compiles git status, module count, wiki docs, and dirty file counts |
| In-process engine availability | `ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/node/kaioken-engine.ts` loads `@kaioken/scan` and `@kaioken/provenance` |

`UNVERIFIED:` whether `computeStaleness` on a 100,000-file repository runs under 500ms when
calculating hashes for the dashboard initial load.

## What done looks like

- [ ] When a repository workspace opens in Kaioken Studio, the main editor area defaults to the `WorkspaceDashboardWidget` if no file tabs were restored.
- [ ] **Git Overview Card:**
  - Branch name, short HEAD SHA, and dirty file count (e.g. `main @ a1b2c3d · 3 uncommitted changes`).
  - Pre-commit hook status (`Installed` or `Not Installed` with quick `[Install Hook]` action).
- [ ] **Documentation Freshness Card (Provenance):**
  - Displays wiki health: Total chapters, Fresh chapters, Stale chapters, Orphaned chapters.
  - If stale chapters exist, a prominent amber banner appears:
    *"3 wiki chapters are stale due to changes in packages/search. [Update Wiki (1-click)]"*.
  - Clicking `[Update Wiki]` triggers in-process `update` command.
- [ ] **Knowledge Inventory Card:**
  - Status of `.kaioken/`: module plan count, card count, skill count, index symbol count.
- [ ] **Quick Action Buttons:**
  - `[ Scan Repository ]` (runs `@kaioken/scan` and rebuilds symbols).
  - `[ Open Chat / Agent ]` (opens the Chat pane).
  - `[ Browse Wiki ]` (opens the `TreeWidget` wiki browser).

## Dashboard visual layout

```
+---------------------------------------------------------------------------------+
| Kaioken Studio — Repository Dashboard: ai_now_know                             |
+---------------------------------------------------------------------------------+
|                                                                                 |
|  [!] DOCUMENTATION DRIFT DETECTED                                               |
|  3 of 12 chapters are stale due to recent commits in packages/search.           |
|  [ Update Stale Wiki Chapters ]         [ View Invalidation Details ]           |
|                                                                                 |
+---------------------------------------+-----------------------------------------+
| Git Status                            | Knowledge Engine Inventory              |
| Branch:  master                       | Modules:    19 modules planned          |
| Commit:  e46fe1b                      | Cards:      42 knowledge cards          |
| Working Tree: 3 modified files        | Symbols:    1,240 symbols indexed       |
| Git Hook: Installed                   | Skills:     6 repo skills               |
+---------------------------------------+-----------------------------------------+
| Recent Activity & Active Runs                                                   |
| - Scan completed: 406 files, 0 risks flagged (2 mins ago)                       |
| - Last wiki generation: 2026-09-02 (x3 depth, 12 chapters)                     |
|                                                                                 |
| Quick Actions:                                                                  |
| [ Re-scan Repository ]   [ Open Agent Chat ]   [ Browse Wiki Tree ]             |
+---------------------------------------------------------------------------------+
```

## Steps

1. **Create Theia Dashboard Widget:**
   - Author `WorkspaceDashboardWidget` under `theia-extensions/kaioken/src/browser/dashboard/`.
   - Register it with `WidgetManager` and open it on workspace startup if no active editor exists.
2. **Bind to Engine Services:**
   - Query `@kaioken/gitops` for current branch and dirty status.
   - Query `@kaioken/provenance` (`computeStaleness`) against `.kaioken/provenance.json` and active scan.
3. **Render Freshness Banner:**
   - Calculate fresh vs stale chapter counts.
   - Wire the `[ Update Stale Wiki Chapters ]` button to trigger the incremental update pipeline.
4. **Wire Quick Actions:**
   - Link buttons to Theia command IDs (`kaioken:scan`, `kaioken:open-chat`, `kaioken:open-wiki`).

## In scope

- `WorkspaceDashboardWidget` UI and layout in Theia extension.
- Integration with `@kaioken/provenance` and `@kaioken/gitops`.
- Stale wiki banner and one-click update trigger.

## Out of scope

- WYSIWYG editing of wiki files (refused non-goal).
- Graph visualization view (deferred past Studio v0.1).

## Gates

From `ide_kaioken/kaioken_studio_theia`:

```bash
yarn build
```

Verify that opening a workspace with stale `.kaioken/wiki` documents displays the amber drift banner.

## Traps

| Trap | Guard |
|---|---|
| Running expensive full-tree re-hashes on every dashboard focus | Cache staleness reports; recalculate only on workspace open or filesystem save events |
| Blocking dashboard rendering on slow git operations | Load git status and provenance asynchronously with skeleton loading indicators |
| Hardcoding paths | Resolve `.kaioken/` relative to the current active workspace root URI |

## Open questions

None.

## Session brief

```xml
<task>
In ide_kaioken/kaioken_studio_theia, specify and build the Workspace Dashboard landing view for
Kaioken Studio.

Requirements from roadmap/m03-desktop-depth-pass/05-workspace-dashboard.md:
1. Replace the blank "No files open" startup tab with a branded WorkspaceDashboardWidget.
2. Integrate with in-process @kaioken/gitops to show:
   - Branch, short commit SHA, dirty file count, and git hook status.
3. Integrate with in-process @kaioken/provenance (computeStaleness):
   - Display total, fresh, stale, and orphaned document counts.
   - If any chapters are stale, display a prominent amber banner:
     "N chapters are stale due to recent code changes. [Update Wiki (1-click)]"
   - Wire the 1-click update button to execute the incremental update workflow.
4. Display Knowledge Inventory metrics (modules, cards, indexed symbols, skills).
5. Provide quick action buttons: [Re-scan Repository], [Open Agent Chat], [Browse Wiki Tree].
</task>

<verification_loop>
Verify that the dashboard opens automatically when a workspace is opened without active editors.
Verify that modifying a file tracked by provenance updates the staleness count on the dashboard.
Verify that clicking "Update Wiki" triggers the update run.
Run yarn build in kaioken_studio_theia to ensure clean compilation.
</verification_loop>

<missing_context_gating>
Do not invent mock staleness data. Use the real computeStaleness() function from @kaioken/provenance.
</missing_context_gating>

<action_safety>
Modify only theia-extensions/kaioken/src/browser/dashboard/ components. Do not modify core engine
packages. Do NOT run git add or git commit. Leave work uncommitted in working tree.
</action_safety>

<structured_output_contract>
End with: (1) dashboard widget implementation details, (2) provenance integration and staleness
banner logic, (3) quick action wiring, (4) build verification outcome.
</structured_output_contract>
```
