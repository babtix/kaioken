# Wiki Changelog

What Kaioken revised, and why.

## 2026-07-27 17:19 — 0825a4b1 → e4815a89

34 files changed · 1 documents updated

- Added a new `web-news/` directory containing a React/Vite frontend (TypeScript) and a set of serverless API routes (login, logout, posts, session, etc.) for a news site.  
- Included all necessary configuration and dependency files (Vercel config, Vite config, TS config, `package.json`/`package-lock.json`, `.env.example`, and `.gitignore`) to build and deploy the site as a serverless application.  
- Updated repository‑wide files (`.gitignore`, Overview.md, Guide.md, Started.md, (TUI).md, and Kaioken wiki/session state) to reference and ignore the new site, reflecting its addition in project documentation.  
- Added unit tests for the new API authentication and store logic under `web-news/api/_lib/__tests__`.

**Documents updated**

- .kaioken/wiki/Development Guide/Development Guide.md

<details><summary>Changed files</summary>

- `M` .gitignore
- `M` cli/.kaioken/sessions/20260726-221313-3822.digest.md
- `M` cli/.kaioken/sessions/20260726-221313-3822.json
- `M` Overview.md
- `M` cli/.kaioken/wiki/CHANGELOG.md
- `M` Guide.md
- `M` Started.md
- `M` (TUI).md
- `M` cli/.kaioken/wiki_state.yaml
- `A` web-news/.env.example
- `A` web-news/.gitignore
- `A` web-news/README.md
- `A` web-news/api/_lib/__tests__/auth.test.ts
- `A` web-news/api/_lib/__tests__/store.test.ts
- `A` web-news/api/_lib/auth.ts
- `A` web-news/api/_lib/http.ts
- `A` web-news/api/_lib/store.ts
- `A` web-news/api/login.ts
- `A` web-news/api/logout.ts
- `A` web-news/api/posts.ts
- `A` web-news/api/posts/[id].ts
- `A` web-news/api/session.ts
- `A` web-news/index.html
- `A` web-news/package-lock.json
- `A` web-news/package.json
- `A` web-news/src/Admin.tsx
- `A` web-news/src/App.tsx
- `A` web-news/src/api.ts
- `A` web-news/src/main.tsx
- `A` web-news/src/styles.css
- `A` web-news/tsconfig.json
- `A` web-news/tsconfig.tsbuildinfo
- `A` web-news/vercel.json
- `A` web-news/vite.config.ts

</details>

## 2026-07-27 17:18 — 41d48a92 → 0825a4b1

27 files changed · 1 documents updated

- Made the explorer sidebar resizable and removed the WikiOutlinePanel and WebBrowserPanel components, moving wiki functionality out of the explorer.  
- Added a new CodeEditor component with language definitions and theme support, plus an Editor route and editor store to enable opening and editing files from the explorer.  
- Updated the desktop layout (AppShell, NavRail) and shortcuts to integrate the editor and reflect the removed panels.  
- Added lib/openFile.ts for handling file‑open actions, updated package dependencies, and refreshed related documentation and lockfiles.

**Documents updated**

- .kaioken/wiki/Development Guide/Development Guide.md

<details><summary>Changed files</summary>

- `M` .gitignore
- `M` cli/.kaioken/sessions/20260726-221313-3822.digest.md
- `M` cli/.kaioken/sessions/20260726-221313-3822.json
- `M` Overview.md
- `M` cli/.kaioken/wiki/CHANGELOG.md
- `M` Guide.md
- `M` Started.md
- `M` (TUI).md
- `M` cli/.kaioken/wiki_state.yaml
- `M` desktop/package-lock.json
- `M` desktop/package.json
- `M` desktop/src/App.tsx
- `A` desktop/src/components/editor/CodeEditor.tsx
- `A` desktop/src/components/editor/language.ts
- `A` desktop/src/components/editor/theme.ts
- `M` desktop/src/components/explorer/ExplorerSidebar.tsx
- `M` desktop/src/components/explorer/FileTreePanel.tsx
- `M` desktop/src/components/explorer/RecentFilesPanel.tsx
- `D` desktop/src/components/explorer/WebBrowserPanel.tsx
- `D` desktop/src/components/explorer/WikiOutlinePanel.tsx
- `M` desktop/src/components/layout/AppShell.tsx
- `M` desktop/src/components/layout/NavRail.tsx
- `M` desktop/src/lib/api.ts
- `A` desktop/src/lib/openFile.ts
- `M` desktop/src/lib/shortcuts.ts
- `A` desktop/src/routes/Editor.tsx
- `A` desktop/src/store/editor.ts

</details>

## 2026-07-27 17:18 — 41d48a92 → 4ac021ae

27 files changed · 1 documents updated

- Made the explorer sidebar resizable and removed the wiki outline panel, moving wiki functionality out of the explorer.  
- Added a new code editor feature (CodeEditor component, language definitions, theme, editor store, and Editor route) to view and edit files.  
- Implemented file‑opening from the explorer via a new openFile utility and updated keyboard shortcuts, enabling double‑click or shortcut to launch the editor.  
- Updated the application layout (AppShell, NavRail, App.tsx) and dependencies to host the editor route and reflect the UI changes, plus updated documentation and lockfiles.

**Documents updated**

- .kaioken/wiki/Development Guide/Development Guide.md

<details><summary>Changed files</summary>

- `M` .gitignore
- `M` cli/.kaioken/sessions/20260726-221313-3822.digest.md
- `M` cli/.kaioken/sessions/20260726-221313-3822.json
- `M` Overview.md
- `M` cli/.kaioken/wiki/CHANGELOG.md
- `M` Guide.md
- `M` Started.md
- `M` (TUI).md
- `M` cli/.kaioken/wiki_state.yaml
- `M` desktop/package-lock.json
- `M` desktop/package.json
- `M` desktop/src/App.tsx
- `A` desktop/src/components/editor/CodeEditor.tsx
- `A` desktop/src/components/editor/language.ts
- `A` desktop/src/components/editor/theme.ts
- `M` desktop/src/components/explorer/ExplorerSidebar.tsx
- `M` desktop/src/components/explorer/FileTreePanel.tsx
- `M` desktop/src/components/explorer/RecentFilesPanel.tsx
- `D` desktop/src/components/explorer/WebBrowserPanel.tsx
- `D` desktop/src/components/explorer/WikiOutlinePanel.tsx
- `M` desktop/src/components/layout/AppShell.tsx
- `M` desktop/src/components/layout/NavRail.tsx
- `M` desktop/src/lib/api.ts
- `A` desktop/src/lib/openFile.ts
- `M` desktop/src/lib/shortcuts.ts
- `A` desktop/src/routes/Editor.tsx
- `A` desktop/src/store/editor.ts

</details>

## 2026-07-27 17:18 — 269e8dc4 → 41d48a92

45 files changed · 1 documents updated

- Desktop: added a tabbed web browser component with omnibox and search functionality, including new UI files, state management, and API client updates.  
- Desktop: rebuilt the source‑control panel to follow Zed’s model, updating GitChangesPanel, adding a GitDiffModal, and adjusting related explorer components and layout.  
- Desktop: replaced the wiki sidebar outline with a new WikiNavigator component, removing WikiOutlinePanel and updating Wiki.tsx routing and navigation.  
- CLI: extended the daemon with browser‑proxy and file‑write endpoints, plus git write operations and per‑file diff endpoints, accompanied by new handler and test files.

**Documents updated**

- .kaioken/wiki/Development Guide/Development Guide.md

<details><summary>Changed files</summary>

- `M` .gitignore
- `M` cli/.kaioken/sessions/20260726-221313-3822.digest.md
- `M` cli/.kaioken/sessions/20260726-221313-3822.json
- `M` Overview.md
- `M` cli/.kaioken/wiki/CHANGELOG.md
- `M` Guide.md
- `M` Started.md
- `M` (TUI).md
- `M` cli/.kaioken/wiki_state.yaml
- `A` cli/internal/daemon/handlers_browser.go
- `A` cli/internal/daemon/handlers_editor.go
- `M` cli/internal/daemon/handlers_explorer.go
- `A` cli/internal/daemon/handlers_git_test.go
- `M` cli/internal/daemon/mux.go
- `A` cli/internal/gitx/work.go
- `A` cli/internal/gitx/work_test.go
- `M` desktop/package-lock.json
- `M` desktop/package.json
- `M` desktop/src-tauri/tauri.conf.json
- `M` desktop/src/App.tsx
- `A` desktop/src/components/common/ResizeHandle.tsx
- `M` desktop/src/components/explorer/ExplorerSidebar.tsx
- `M` desktop/src/components/explorer/FileTreePanel.tsx
- `M` desktop/src/components/explorer/GitChangesPanel.tsx
- `A` desktop/src/components/explorer/GitDiffModal.tsx
- `M` desktop/src/components/explorer/QuickSwitcher.tsx
- `M` desktop/src/components/explorer/RecentFilesPanel.tsx
- `D` desktop/src/components/explorer/WebBrowserPanel.tsx
- `D` desktop/src/components/explorer/WikiOutlinePanel.tsx
- `M` desktop/src/components/layout/AppShell.tsx
- `M` desktop/src/components/layout/NavRail.tsx
- `A` desktop/src/components/wiki/WikiNavigator.tsx
- `A` desktop/src/lib/__tests__/diff.test.ts
- `A` desktop/src/lib/__tests__/fuzzy.test.ts
- `A` desktop/src/lib/__tests__/omnibox.test.ts
- `M` desktop/src/lib/api.ts
- `M` desktop/src/lib/daemon.ts
- `A` desktop/src/lib/diff.ts
- `A` desktop/src/lib/fuzzy.ts
- `M` desktop/src/lib/shortcuts.ts
- `M` desktop/src/lib/types.ts
- `A` desktop/src/routes/Browser.tsx
- `M` desktop/src/routes/Wiki.tsx
- `A` desktop/src/store/browser.ts
- `M` desktop/src/store/explorer.ts

</details>

## 2026-07-27 17:17 — 269e8dc4 → 0cd329ee

45 files changed · 1 documents updated

- Added a tabbed web browser UI with omnibox and search to the desktop, introducing `Browser.tsx`, a browser store, API handlers (`handlers_browser.go`), and related unit tests while removing the legacy `WebBrowserPanel`.  
- Refactored the source‑control panel to follow Zed’s model, updating `GitChangesPanel`, adding a `GitDiffModal` for diff viewing, and adjusting layout files (`AppShell`, `NavRail`, `ResizeHandle`).  
- Replaced the wiki sidebar outline with a new `WikiNavigator` component, deleting `WikiOutlinePanel` and updating `Wiki.tsx` routes and associated state management.  
- Extended the CLI daemon with browser proxy, file‑write, git write operations, and per‑file diff endpoints (`handlers_browser.go`, `handlers_editor.go`, `work.go`, `mux.go`) and added corresponding test files.

**Documents updated**

- .kaioken/wiki/Development Guide/Development Guide.md

<details><summary>Changed files</summary>

- `M` .gitignore
- `M` cli/.kaioken/sessions/20260726-221313-3822.digest.md
- `M` cli/.kaioken/sessions/20260726-221313-3822.json
- `M` Overview.md
- `M` cli/.kaioken/wiki/CHANGELOG.md
- `M` Guide.md
- `M` Started.md
- `M` (TUI).md
- `M` cli/.kaioken/wiki_state.yaml
- `A` cli/internal/daemon/handlers_browser.go
- `A` cli/internal/daemon/handlers_editor.go
- `M` cli/internal/daemon/handlers_explorer.go
- `A` cli/internal/daemon/handlers_git_test.go
- `M` cli/internal/daemon/mux.go
- `A` cli/internal/gitx/work.go
- `A` cli/internal/gitx/work_test.go
- `M` desktop/package-lock.json
- `M` desktop/package.json
- `M` desktop/src-tauri/tauri.conf.json
- `M` desktop/src/App.tsx
- `A` desktop/src/components/common/ResizeHandle.tsx
- `M` desktop/src/components/explorer/ExplorerSidebar.tsx
- `M` desktop/src/components/explorer/FileTreePanel.tsx
- `M` desktop/src/components/explorer/GitChangesPanel.tsx
- `A` desktop/src/components/explorer/GitDiffModal.tsx
- `M` desktop/src/components/explorer/QuickSwitcher.tsx
- `M` desktop/src/components/explorer/RecentFilesPanel.tsx
- `D` desktop/src/components/explorer/WebBrowserPanel.tsx
- `D` desktop/src/components/explorer/WikiOutlinePanel.tsx
- `M` desktop/src/components/layout/AppShell.tsx
- `M` desktop/src/components/layout/NavRail.tsx
- `A` desktop/src/components/wiki/WikiNavigator.tsx
- `A` desktop/src/lib/__tests__/diff.test.ts
- `A` desktop/src/lib/__tests__/fuzzy.test.ts
- `A` desktop/src/lib/__tests__/omnibox.test.ts
- `M` desktop/src/lib/api.ts
- `M` desktop/src/lib/daemon.ts
- `A` desktop/src/lib/diff.ts
- `A` desktop/src/lib/fuzzy.ts
- `M` desktop/src/lib/shortcuts.ts
- `M` desktop/src/lib/types.ts
- `A` desktop/src/routes/Browser.tsx
- `M` desktop/src/routes/Wiki.tsx
- `A` desktop/src/store/browser.ts
- `M` desktop/src/store/explorer.ts

</details>

## 2026-07-27 17:16 — 269e8dc4 → eed1c542

41 files changed · 1 documents updated

- Rebuilt the wiki sidebar in the desktop app as a dedicated WikiNavigator component, removing the old WikiOutlinePanel and WebBrowserPanel and updating AppShell, NavRail, routes, and the explorer store to use the new navigator.  
- Added diff and fuzzy matching utilities to the desktop library with unit tests, and updated the API, daemon, shortcuts, and type definitions to support the navigator and enhanced search.  
- Extended the CLI daemon with browser proxy and file‑write HTTP handlers, plus git write operation and per‑file diff endpoints, including new handler files, mux registration, and corresponding tests.  
- Updated project configuration and dependencies (package.json, package‑lock.json, tauri.conf.json) and refreshed documentation/changelog files to reflect the new features.

**Documents updated**

- .kaioken/wiki/Development Guide/Development Guide.md

<details><summary>Changed files</summary>

- `M` .gitignore
- `M` cli/.kaioken/sessions/20260726-221313-3822.digest.md
- `M` cli/.kaioken/sessions/20260726-221313-3822.json
- `M` Overview.md
- `M` cli/.kaioken/wiki/CHANGELOG.md
- `M` Guide.md
- `M` Started.md
- `M` (TUI).md
- `M` cli/.kaioken/wiki_state.yaml
- `A` cli/internal/daemon/handlers_browser.go
- `A` cli/internal/daemon/handlers_editor.go
- `M` cli/internal/daemon/handlers_explorer.go
- `A` cli/internal/daemon/handlers_git_test.go
- `M` cli/internal/daemon/mux.go
- `A` cli/internal/gitx/work.go
- `A` cli/internal/gitx/work_test.go
- `M` desktop/package-lock.json
- `M` desktop/package.json
- `M` desktop/src-tauri/tauri.conf.json
- `M` desktop/src/App.tsx
- `A` desktop/src/components/common/ResizeHandle.tsx
- `M` desktop/src/components/explorer/ExplorerSidebar.tsx
- `M` desktop/src/components/explorer/FileTreePanel.tsx
- `M` desktop/src/components/explorer/GitChangesPanel.tsx
- `M` desktop/src/components/explorer/QuickSwitcher.tsx
- `M` desktop/src/components/explorer/RecentFilesPanel.tsx
- `D` desktop/src/components/explorer/WebBrowserPanel.tsx
- `D` desktop/src/components/explorer/WikiOutlinePanel.tsx
- `M` desktop/src/components/layout/AppShell.tsx
- `M` desktop/src/components/layout/NavRail.tsx
- `A` desktop/src/components/wiki/WikiNavigator.tsx
- `A` desktop/src/lib/__tests__/diff.test.ts
- `A` desktop/src/lib/__tests__/fuzzy.test.ts
- `M` desktop/src/lib/api.ts
- `M` desktop/src/lib/daemon.ts
- `A` desktop/src/lib/diff.ts
- `A` desktop/src/lib/fuzzy.ts
- `M` desktop/src/lib/shortcuts.ts
- `M` desktop/src/lib/types.ts
- `M` desktop/src/routes/Wiki.tsx
- `M` desktop/src/store/explorer.ts

</details>

## 2026-07-27 17:16 — 269e8dc4 → 45e5672c

35 files changed · 1 documents updated

- Added new CLI daemon endpoints for browser proxy, file‑write, git write operations, and per‑file diff, implemented in `handlers_browser.go`, `handlers_editor.go`, `handlers_git_test.go`, `work.go`/`work_test.go` and wired via `mux.go`.  
- Updated the desktop frontend to consume these endpoints: revised API layer (`api.ts`, `daemon.ts`, `types.ts`, `shortcuts.ts`), removed `WebBrowserPanel.tsx` and `WikiOutlinePanel.tsx`, and adjusted related Explorer components, layout, navigation, and the Wiki route.  
- Refreshed supporting configuration and documentation: updated `package-lock.json`, `package.json`, `tauri.conf.json`, various markdown guides, wiki files, changelog, and `.gitignore` to reflect the new features.  
- Added test coverage for the git work handlers (`handlers_git_test.go`, `work_test.go`) and modified existing explorer handler tests.

**Documents updated**

- .kaioken/wiki/Development Guide/Development Guide.md

<details><summary>Changed files</summary>

- `M` .gitignore
- `M` cli/.kaioken/sessions/20260726-221313-3822.digest.md
- `M` cli/.kaioken/sessions/20260726-221313-3822.json
- `M` Overview.md
- `M` cli/.kaioken/wiki/CHANGELOG.md
- `M` Guide.md
- `M` Started.md
- `M` (TUI).md
- `M` cli/.kaioken/wiki_state.yaml
- `A` cli/internal/daemon/handlers_browser.go
- `A` cli/internal/daemon/handlers_editor.go
- `M` cli/internal/daemon/handlers_explorer.go
- `A` cli/internal/daemon/handlers_git_test.go
- `M` cli/internal/daemon/mux.go
- `A` cli/internal/gitx/work.go
- `A` cli/internal/gitx/work_test.go
- `M` desktop/package-lock.json
- `M` desktop/package.json
- `M` desktop/src-tauri/tauri.conf.json
- `M` desktop/src/App.tsx
- `M` desktop/src/components/explorer/ExplorerSidebar.tsx
- `M` desktop/src/components/explorer/FileTreePanel.tsx
- `M` desktop/src/components/explorer/GitChangesPanel.tsx
- `M` desktop/src/components/explorer/QuickSwitcher.tsx
- `M` desktop/src/components/explorer/RecentFilesPanel.tsx
- `D` desktop/src/components/explorer/WebBrowserPanel.tsx
- `D` desktop/src/components/explorer/WikiOutlinePanel.tsx
- `M` desktop/src/components/layout/AppShell.tsx
- `M` desktop/src/components/layout/NavRail.tsx
- `M` desktop/src/lib/api.ts
- `M` desktop/src/lib/daemon.ts
- `M` desktop/src/lib/shortcuts.ts
- `M` desktop/src/lib/types.ts
- `M` desktop/src/routes/Wiki.tsx
- `M` desktop/src/store/explorer.ts

</details>

## 2026-07-27 17:15 — 269e8dc4 → 84e3ef5c

35 files changed · 1 documents updated

- Added git write operations (stage, commit, push) and per-file diff endpoints to the CLI daemon, with new handlers in `cli/internal/daemon/handlers_*` and routing updates in `mux.go`.  
- Implemented the core `gitx` work module (`cli/internal/gitx/work.go`) with unit tests (`work_test.go`) and an integration test skeleton (`handlers_git_test.go`) to support the new endpoints.  
- Updated CLI daemon configuration and metadata (`.gitignore`, session digest/json, wiki state) to reflect the new functionality.  
- Refactored the desktop explorer UI: added/modified panels for git changes (`GitChangesPanel.tsx`, `ExplorerSidebar.tsx`, `FileTreePanel.tsx`, `QuickSwitcher.tsx`, `RecentFilesPanel.tsx`), removed `WebBrowserPanel` and `WikiOutlinePanel`, and adjusted layout, navigation, state, API, daemon, shortcuts, and type definitions.  
- Bumped frontend dependencies (`package.json`, `package-lock.json`) and Tauri config (`tauri.conf.json`), and refreshed documentation (`Overview.md`, `Guide.md`, `Started.md`, `(TUI).md`, wiki files, `CHANGELOG.md`).

**Documents updated**

- .kaioken/wiki/Development Guide/Development Guide.md

<details><summary>Changed files</summary>

- `M` .gitignore
- `M` cli/.kaioken/sessions/20260726-221313-3822.digest.md
- `M` cli/.kaioken/sessions/20260726-221313-3822.json
- `M` Overview.md
- `M` cli/.kaioken/wiki/CHANGELOG.md
- `M` Guide.md
- `M` Started.md
- `M` (TUI).md
- `M` cli/.kaioken/wiki_state.yaml
- `M` cli/internal/daemon/handlers_explorer.go
- `A` cli/internal/daemon/handlers_git_test.go
- `M` cli/internal/daemon/mux.go
- `A` cli/internal/gitx/work.go
- `A` cli/internal/gitx/work_test.go
- `M` desktop/package-lock.json
- `M` desktop/package.json
- `M` desktop/src-tauri/tauri.conf.json
- `M` desktop/src/App.tsx
- `M` desktop/src/components/explorer/ExplorerSidebar.tsx
- `M` desktop/src/components/explorer/FileTreePanel.tsx
- `M` desktop/src/components/explorer/GitChangesPanel.tsx
- `M` desktop/src/components/explorer/QuickSwitcher.tsx
- `M` desktop/src/components/explorer/RecentFilesPanel.tsx
- `D` desktop/src/components/explorer/WebBrowserPanel.tsx
- `D` desktop/src/components/explorer/WikiOutlinePanel.tsx
- `M` desktop/src/components/layout/AppShell.tsx
- `M` desktop/src/components/layout/NavRail.tsx
- `M` desktop/src/lib/api.ts
- `M` desktop/src/lib/daemon.ts
- `M` desktop/src/lib/shortcuts.ts
- `M` desktop/src/lib/types.ts
- `M` desktop/src/routes/Wiki.tsx
- `M` desktop/src/store/explorer.ts
- `?` internal/daemon/handlers_browser.go
- `?` internal/daemon/handlers_editor.go

</details>

## 2026-07-27 17:15 — 269e8dc4 → 709c4b9d

35 files changed · 1 documents updated

- Added Git write operation endpoints (commit, push, etc.) to the CLI daemon, exposing them via new handlers in `handlers_explorer.go` and registering routes in `mux.go`, with accompanying unit tests in `handlers_git_test.go`.  
- Implemented a per‑file diff endpoint that returns a diff for a single file, backed by new `work.go`/`work_test.go` in the `gitx` package and wired into the daemon’s router.  
- Updated the desktop client: extended the API layer (`api.ts`, `daemon.ts`, `types.ts`) to call the new Git endpoints, refreshed Explorer UI (sidebar, file tree, Git changes panel, quick switcher, recent files) and removed the unused `WebBrowserPanel.tsx` and `WikiOutlinePanel.tsx`.  
- Adjusted the application shell and navigation (`AppShell.tsx`, `NavRail.tsx`, layout files) to accommodate the updated Explorer panels and updated dependencies (`package.json`, `package-lock.json`, `tauri.conf.json`).  
- Updated documentation and changelog files (`Overview.md`, `Guide.md`, `Started.md`, `(TUI).md`, `CHANGELOG.md`, `wiki_state.yaml`) and session metadata to reflect the new Git write and diff features.

**Documents updated**

- .kaioken/wiki/Development Guide/Development Guide.md

<details><summary>Changed files</summary>

- `M` .gitignore
- `M` cli/.kaioken/sessions/20260726-221313-3822.digest.md
- `M` cli/.kaioken/sessions/20260726-221313-3822.json
- `M` Overview.md
- `M` cli/.kaioken/wiki/CHANGELOG.md
- `M` Guide.md
- `M` Started.md
- `M` (TUI).md
- `M` cli/.kaioken/wiki_state.yaml
- `M` cli/internal/daemon/handlers_explorer.go
- `A` cli/internal/daemon/handlers_git_test.go
- `M` cli/internal/daemon/mux.go
- `A` cli/internal/gitx/work.go
- `A` cli/internal/gitx/work_test.go
- `M` desktop/package-lock.json
- `M` desktop/package.json
- `M` desktop/src-tauri/tauri.conf.json
- `M` desktop/src/App.tsx
- `M` desktop/src/components/explorer/ExplorerSidebar.tsx
- `M` desktop/src/components/explorer/FileTreePanel.tsx
- `M` desktop/src/components/explorer/GitChangesPanel.tsx
- `M` desktop/src/components/explorer/QuickSwitcher.tsx
- `M` desktop/src/components/explorer/RecentFilesPanel.tsx
- `D` desktop/src/components/explorer/WebBrowserPanel.tsx
- `D` desktop/src/components/explorer/WikiOutlinePanel.tsx
- `M` desktop/src/components/layout/AppShell.tsx
- `M` desktop/src/components/layout/NavRail.tsx
- `M` desktop/src/lib/api.ts
- `M` desktop/src/lib/daemon.ts
- `M` desktop/src/lib/shortcuts.ts
- `M` desktop/src/lib/types.ts
- `M` desktop/src/routes/Wiki.tsx
- `M` desktop/src/store/explorer.ts
- `?` internal/daemon/handlers_browser.go
- `?` internal/daemon/handlers_editor.go

</details>

## 2026-07-26 21:29 — f33ec90f → 269e8dc4

267 files changed · 4 documents updated

- Added multi‑provider LLM support (Anthropic, OpenRouter with retry, streaming, and token handling) and updated internal LLM packages.  
- Implemented the workspace explorer UI: new backend handlers, frontend panels (file tree, git changes, context, wiki outline, etc.), layout components, and workspace switcher logic.  
- Created a structured repo knowledge base under `cli/.kaioken/knowledge/` with module definitions, architecture, conventions, tech‑stack docs for each subsystem, plus skills, agent specs, wiki generation/serve, and session storage files.  
- Updated project configuration and documentation: CI workflow, `.gitignore`, README, config files, Makefile, desktop source changes, wiki pages, and added new markdown docs (Support, Logic, Integration, etc.).

**Documents updated**

- .kaioken/wiki/Getting Started/Getting Started.md
- .kaioken/wiki/Getting Started/Using the Terminal User Interface (TUI).md
- .kaioken/wiki/Architecture Overview/Architecture Overview.md
- .kaioken/wiki/Development Guide/Development Guide.md

<details><summary>Changed files</summary>

- `M` .github/workflows/ci.yml
- `M` .gitignore
- `A` AGENTS.md
- `M` README.md
- `A` cli/.kaioken/KNOWLEDGE.md
- `M` cli/.kaioken/config.yaml
- `A` cli/.kaioken/knowledge/kaioken/_module.yaml
- `A` cli/.kaioken/knowledge/kaioken/architecture.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_core/_module.yaml
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_core/architecture.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_core/conventions.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_core/overview.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_core/setup_commands.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_core/tech_stack.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_skills/_module.yaml
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_skills/architecture.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_skills/conventions.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_skills/overview.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_skills/tech_stack.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_state/_module.yaml
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_state/architecture.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_state/conventions.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_state/overview.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/agent_state/tech_stack.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/llm_integration/_module.yaml
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/llm_integration/architecture.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/llm_integration/conventions.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/llm_integration/overview.md
- `A` cli/.kaioken/knowledge/kaioken/chat_agent/llm_integration/tech_stack.md
- `A` cli/.kaioken/knowledge/kaioken/cmd/_module.yaml
- `A` cli/.kaioken/knowledge/kaioken/cmd/architecture.md
- `A` cli/.kaioken/knowledge/kaioken/cmd/conventions.md
- `A` cli/.kaioken/knowledge/kaioken/cmd/overview.md
- `A` cli/.kaioken/knowledge/kaioken/cmd/tech_stack.md
- `A` cli/.kaioken/knowledge/kaioken/config/_module.yaml
- `A` cli/.kaioken/knowledge/kaioken/config/architecture.md
- `A` cli/.kaioken/knowledge/kaioken/config/conventions.md
- `A` cli/.kaioken/knowledge/kaioken/config/overview.md
- `A` cli/.kaioken/knowledge/kaioken/config/setup_commands.md
- `A` cli/.kaioken/knowledge/kaioken/config/tech_stack.md
- `A` cli/.kaioken/knowledge/kaioken/conventions.md
- `A` cli/.kaioken/knowledge/kaioken/gitx/_module.yaml
- `A` cli/.kaioken/knowledge/kaioken/gitx/architecture.md
- `A` cli/.kaioken/knowledge/kaioken/gitx/conventions.md
- `A` cli/.kaioken/knowledge/kaioken/gitx/overview.md
- `A` cli/.kaioken/knowledge/kaioken/gitx/tech_stack.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/codemap/_module.yaml
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/codemap/architecture.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/codemap/conventions.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/codemap/overview.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/codemap/tech_stack.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/planner/_module.yaml
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/planner/architecture.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/planner/conventions.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/planner/overview.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/planner/setup_commands.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/planner/tech_stack.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/wiki_generator/_module.yaml
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/wiki_generator/architecture.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/wiki_generator/conventions.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/wiki_generator/overview.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/wiki_generator/tech_stack.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/wiki_serve/_module.yaml
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/wiki_serve/architecture.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/wiki_serve/conventions.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/wiki_serve/overview.md
- `A` cli/.kaioken/knowledge/kaioken/knowledge_engine/wiki_serve/tech_stack.md
- `A` cli/.kaioken/knowledge/kaioken/overview.md
- `A` cli/.kaioken/knowledge/kaioken/setup_commands.md
- `A` cli/.kaioken/knowledge/kaioken/tech_stack.md
- `A` cli/.kaioken/knowledge/kaioken/tui/_module.yaml
- `A` cli/.kaioken/knowledge/kaioken/tui/architecture.md
- `A` cli/.kaioken/knowledge/kaioken/tui/conventions.md
- `A` cli/.kaioken/knowledge/kaioken/tui/overview.md
- `A` cli/.kaioken/knowledge/kaioken/tui/tech_stack.md
- `A` cli/.kaioken/knowledge/kaioken/version/_module.yaml
- `A` cli/.kaioken/knowledge/kaioken/version/architecture.md
- `A` cli/.kaioken/knowledge/kaioken/version/conventions.md
- `A` cli/.kaioken/knowledge/kaioken/version/overview.md
- `A` cli/.kaioken/knowledge/kaioken/version/tech_stack.md
- `M` cli/.kaioken/sessions/20260726-041643-3695.json
- `A` cli/.kaioken/sessions/20260726-215059-7859.json
- `A` cli/.kaioken/sessions/20260726-221034-3211.json
- `A` cli/.kaioken/sessions/20260726-221313-3822.digest.md
- `A` cli/.kaioken/sessions/20260726-221313-3822.json
- `A` cli/.kaioken/skills/README.md
- `A` cli/.kaioken/skills/add-a-cli-command/SKILL.md
- `A` cli/.kaioken/skills/add-a-skill/SKILL.md
- `A` cli/.kaioken/skills/add-a-tui-command/SKILL.md
- `A` cli/.kaioken/skills/build-the-binary/SKILL.md
- `A` cli/.kaioken/skills/generate-wiki-documentation/SKILL.md
- `A` cli/.kaioken/skills/lint-the-code/SKILL.md
- `A` cli/.kaioken/skills/run-the-test-suite/SKILL.md
- `A` cli/.kaioken/skills/update-dependencies/SKILL.md
- `A` cli/.kaioken/state.json
- `M` Overview.md
- `M` Agent.md
- `M` Flow.md
- `M` Engine.md
- `M` System).md
- `M` (TUI).md
- `A` cli/.kaioken/wiki/CHANGELOG.md
- `M` Handling.md
- `M` Wiki.md
- `M` Invocation.md
- `M` Workflow.md
- `M` Index.md
- `M` Context.md
- `M` Indexing.md
- `M` Skeletons.md
- `M` Settings.md
- `M` Precedence.md
- `M` cli/.kaioken/wiki/Configuration/Configuration.md
- `M` Models.md
- `M` Concurrency.md
- `M` Configuration.md
- `M` Guide.md
- `M` Contributing.md
- `M` Structure.md
- `M` Binary.md
- `M` Started.md
- `M` Repository.md
- `M` Started/Installation.md
- `M` Hooks.md
- `M` Previews.md
- `M` Updates.md
- `M` Refinement.md
- `M` Planning.md
- `M` Scanning.md
- `A` Support.md
- `A` Logic.md
- `A` Integration.md
- `A` Responses.md
- `A` Management.md
- `A` Calling.md
- `A` Integration/_section.yaml
- `M` cli/.kaioken/wiki/README.md
- `M` Tutorial.md
- `M` Palette.md
- `M` Rendering.md
- `M` Footer.md
- `M` Loop.md
- `M` cli/.kaioken/wiki_state.yaml
- `A` cli/AGENTS.md
- `A` cli/KAIOKEN-settings.json
- `M` cli/Makefile
- `M` cli/cmd/kaioken/main.go
- `M` cli/internal/agent/agent.go
- `A` cli/internal/agent/compact.go
- `A` cli/internal/agent/compact_test.go
- `A` cli/internal/agent/context.go
- `M` cli/internal/agent/knowledge.go
- `M` cli/internal/agent/knowledge_test.go
- `A` cli/internal/agent/mode.go
- `A` cli/internal/agent/prompts.go
- `A` cli/internal/agent/prune.go
- `A` cli/internal/agent/reminders.go
- `A` cli/internal/agent/reminders_test.go
- `A` cli/internal/agent/task.go
- `A` cli/internal/agent/todo.go
- `M` cli/internal/agent/tools.go
- `A` cli/internal/agentsmd/agentsmd.go
- `A` cli/internal/agentsmd/agentsmd_test.go
- `A` cli/internal/agentsmd/generate.go
- `A` cli/internal/agentsmd/sources.go
- `M` cli/internal/config/config.go
- `M` cli/internal/config/global.go
- `M` cli/internal/daemon/chatui.go
- `M` cli/internal/daemon/handlers_chat.go
- `M` cli/internal/daemon/handlers_docs.go
- `A` cli/internal/daemon/handlers_explorer.go
- `A` cli/internal/daemon/handlers_explorer_test.go
- `M` cli/internal/daemon/handlers_runs.go
- `M` cli/internal/daemon/handlers_settings.go
- `M` cli/internal/daemon/handlers_workspace.go
- `M` cli/internal/daemon/handlers_workspace_test.go
- `M` cli/internal/daemon/mux.go
- `M` cli/internal/daemon/runs.go
- `M` cli/internal/daemon/workspace.go
- `A` cli/internal/gitx/status.go
- `A` cli/internal/gitx/status_test.go
- `A` cli/internal/llm/anthropic.go
- `A` cli/internal/llm/anthropic_test.go
- `M` cli/internal/llm/openrouter.go
- `A` cli/internal/llm/retry.go
- `M` cli/internal/llm/stream.go
- `A` cli/internal/llm/tokens.go
- `A` cli/internal/memory/DESIGN.md
- `A` cli/internal/memory/digest.go
- `A` cli/internal/memory/digest_test.go
- `A` cli/internal/memory/doc.go
- `A` cli/internal/memory/learn.go
- `A` cli/internal/memory/learn_test.go
- `A` cli/internal/memory/memory.go
- `A` cli/internal/memory/memory_test.go
- `A` cli/internal/memory/reinforce.go
- `A` cli/internal/memory/reinforce_test.go
- `A` cli/internal/memory/session.go
- `M` cli/internal/session/session.go
- `A` cli/internal/setup/setup.go
- `M` cli/internal/skills/generate.go
- `M` cli/internal/skills/skills.go
- `M` cli/internal/tui/commands.go
- `M` cli/internal/tui/explain.go
- `M` cli/internal/tui/logo.go
- `M` cli/internal/tui/tui.go
- `M` cli/internal/tui/tutorial.go
- `M` cli/internal/wiki/wiki.go
- `M` desktop/docs/02-api-contract.md
- `M` desktop/index.html
- `M` desktop/src-tauri/capabilities/default.json
- `M` desktop/src-tauri/tauri.conf.json
- `M` desktop/src/App.tsx
- `M` desktop/src/components/EmptyState.tsx
- `A` desktop/src/components/ErrorBoundary.tsx
- `M` desktop/src/components/Toaster.tsx
- `A` desktop/src/components/chat/ApprovalDialog.tsx
- `A` desktop/src/components/chat/Autocomplete.tsx
- `A` desktop/src/components/chat/DiffView.tsx
- `A` desktop/src/components/chat/ToolCallCard.tsx
- `A` desktop/src/components/common/AsciiArt.tsx
- `A` desktop/src/components/common/CodeBlock.tsx
- `A` desktop/src/components/common/Markdown.tsx
- `A` desktop/src/components/common/Mermaid.tsx
- `A` desktop/src/components/explorer/ContextPanel.tsx
- `A` desktop/src/components/explorer/ExplorerSidebar.tsx
- `A` desktop/src/components/explorer/FileTreePanel.tsx
- `A` desktop/src/components/explorer/GitChangesPanel.tsx
- `A` desktop/src/components/explorer/ModuleStatusPanel.tsx
- `A` desktop/src/components/explorer/QuickSwitcher.tsx
- `A` desktop/src/components/explorer/RecentFilesPanel.tsx
- `A` desktop/src/components/explorer/WebBrowserPanel.tsx
- `A` desktop/src/components/explorer/WikiOutlinePanel.tsx
- `A` desktop/src/components/explorer/fileIcon.tsx
- `M` desktop/src/components/layout/AppShell.tsx
- `M` desktop/src/components/layout/NavRail.tsx
- `M` desktop/src/components/layout/StatusBar.tsx
- `A` desktop/src/components/layout/WorkspaceSwitcher.tsx
- `A` desktop/src/components/ui/index.tsx
- `M` desktop/src/index.css
- `A` desktop/src/lib/__tests__/slash.test.ts
- `M` desktop/src/lib/api.ts
- `M` desktop/src/lib/shortcuts.ts
- `A` desktop/src/lib/slash.ts
- `M` desktop/src/lib/types.ts
- `M` desktop/src/main.tsx
- `M` desktop/src/routes/Activity.tsx
- `M` desktop/src/routes/Cards.tsx
- `M` desktop/src/routes/Chat.tsx
- `M` desktop/src/routes/Settings.tsx
- `M` desktop/src/routes/Welcome.tsx
- `M` desktop/src/routes/Wiki.tsx
- `M` desktop/src/store/chat.ts
- `A` desktop/src/store/explorer.ts
- `M` desktop/src/store/runs.ts
- `A` desktop/src/store/theme.ts
- `M` desktop/src/store/workspace.ts
- `A` docs/opencode-map.md
- `A` verify-dark.png
- `M` website/package-lock.json
- `M` website/package.json
- `M` website/src/components/Mermaid.tsx
- `M` website/src/data/content.ts
- `M` website/src/main.tsx
- `M` website/src/pages/docs/Config.tsx
- `M` website/src/pages/docs/Install.tsx
- `?` PRISM_RAG/

</details>

## 2026-07-26 18:41 — 8a12ad9b → f33ec90f

113 files changed · 1 documents updated

- Updated the website Hero section to stack the '+' button on its own line and removed the provider list beneath the call‑to‑action elements.  
- Added a “working on it” status marker for the GUI application in the relevant documentation and UI indicators.  
- Refactored CLI and daemon code: revised agent knowledge handling, tool interfaces, session management, LLM streaming, and TUI components; introduced new agent compaction, reminder, and task modules.  
- Overhauled the desktop client: updated layout shells, navigation rail, status bar, route pages (Chat, Settings, Wiki, etc.), and state stores; adjusted CI workflow, .gitignore, and added new configuration and wiki files.  
- Expanded and refreshed documentation across the project, including overview guides, API contracts, contribution guidelines, and added new AGENTS.md and related wiki files.

**Documents updated**

- .kaioken/wiki/Development Guide/Development Guide.md

<details><summary>Changed files</summary>

- `M` .github/workflows/ci.yml
- `M` .gitignore
- `M` cli/.kaioken/config.yaml
- `M` cli/.kaioken/sessions/20260726-041643-3695.json
- `M` Overview.md
- `M` Agent.md
- `M` Flow.md
- `M` Engine.md
- `M` System).md
- `M` (TUI).md
- `M` Handling.md
- `M` Wiki.md
- `M` Invocation.md
- `M` Workflow.md
- `M` Index.md
- `M` Context.md
- `M` Indexing.md
- `M` Skeletons.md
- `M` Settings.md
- `M` Precedence.md
- `M` cli/.kaioken/wiki/Configuration/Configuration.md
- `M` Models.md
- `M` Concurrency.md
- `M` Configuration.md
- `M` Guide.md
- `M` Contributing.md
- `M` Structure.md
- `M` Binary.md
- `M` Started.md
- `M` Repository.md
- `M` Started/Installation.md
- `M` Hooks.md
- `M` Previews.md
- `M` Updates.md
- `M` Refinement.md
- `M` Planning.md
- `M` Scanning.md
- `M` cli/.kaioken/wiki/README.md
- `M` Tutorial.md
- `M` Palette.md
- `M` Rendering.md
- `M` Management.md
- `M` Footer.md
- `M` Loop.md
- `M` cli/.kaioken/wiki_state.yaml
- `M` cli/Makefile
- `M` cli/cmd/kaioken/main.go
- `M` cli/internal/agent/agent.go
- `M` cli/internal/agent/knowledge.go
- `M` cli/internal/agent/knowledge_test.go
- `M` cli/internal/agent/tools.go
- `M` cli/internal/daemon/chatui.go
- `M` cli/internal/daemon/handlers_chat.go
- `M` cli/internal/daemon/handlers_runs.go
- `M` cli/internal/daemon/handlers_workspace.go
- `M` cli/internal/daemon/handlers_workspace_test.go
- `M` cli/internal/daemon/mux.go
- `M` cli/internal/daemon/runs.go
- `M` cli/internal/daemon/workspace.go
- `M` cli/internal/llm/openrouter.go
- `M` cli/internal/llm/stream.go
- `M` cli/internal/session/session.go
- `M` cli/internal/skills/generate.go
- `M` cli/internal/tui/commands.go
- `M` cli/internal/tui/explain.go
- `M` cli/internal/tui/logo.go
- `M` cli/internal/tui/tui.go
- `M` cli/internal/tui/tutorial.go
- `M` cli/internal/wiki/wiki.go
- `M` desktop/docs/02-api-contract.md
- `M` desktop/index.html
- `M` desktop/src/App.tsx
- `M` desktop/src/components/EmptyState.tsx
- `M` desktop/src/components/Toaster.tsx
- `M` desktop/src/components/layout/AppShell.tsx
- `M` desktop/src/components/layout/NavRail.tsx
- `M` desktop/src/components/layout/StatusBar.tsx
- `M` desktop/src/index.css
- `M` desktop/src/lib/api.ts
- `M` desktop/src/lib/types.ts
- `M` desktop/src/main.tsx
- `M` desktop/src/routes/Activity.tsx
- `M` desktop/src/routes/Cards.tsx
- `M` desktop/src/routes/Chat.tsx
- `M` desktop/src/routes/Settings.tsx
- `M` desktop/src/routes/Welcome.tsx
- `M` desktop/src/routes/Wiki.tsx
- `M` desktop/src/store/chat.ts
- `M` desktop/src/store/runs.ts
- `M` desktop/src/store/workspace.ts
- `M` website/src/components/sections/Hero.tsx
- `M` website/src/data/roadmap.ts
- `M` website/src/pages/Next.tsx
- `?` AGENTS.md
- `?` KAIOKEN-settings.json
- `?` PRISM_RAG/
- `?` internal/agent/compact.go
- `?` internal/agent/compact_test.go
- `?` internal/agent/context.go
- `?` internal/agent/mode.go
- `?` internal/agent/prompts.go
- `?` internal/agent/prune.go
- `?` internal/agent/reminders.go
- `?` internal/agent/reminders_test.go
- `?` internal/agent/task.go
- `?` internal/agent/todo.go
- `?` internal/agentsmd/agentsmd.go
- `?` internal/agentsmd/agentsmd_test.go
- `?` internal/agentsmd/generate.go
- `?` internal/agentsmd/sources.go
- `?` internal/llm/retry.go
- `?` internal/llm/tokens.go
- `?` internal/setup/setup.go

</details>

## 2026-07-26 16:32 — d4c8cf47 → 8a12ad9b

90 files changed · 3 documents updated

- Added a new `LICENSE` file containing the MIT license text.  
- Applied the MIT license header to a wide range of source code, configuration, and documentation files (e.g., `.go`, `.tsx`, `.md`, `.yaml`, `.json`).  
- Updated the CI workflow (`.github/workflows/ci.yml`) to include a license‑check step.  
- Modified `.gitignore` to ignore the newly introduced `KAIOKEN-settings.json` file.  
- No functional behavior of the software was altered; only licensing metadata was added.

**Documents updated**

- .kaioken/wiki/Development Guide/Development Guide.md
- .kaioken/wiki/Development Guide/Making Changes and Contributing.md
- .kaioken/wiki/Development Guide/Understanding the Repository Structure.md

<details><summary>Changed files</summary>

- `M` .github/workflows/ci.yml
- `M` .gitignore
- `A` LICENSE
- `M` cli/.kaioken/config.yaml
- `M` cli/.kaioken/sessions/20260726-041643-3695.json
- `M` Overview.md
- `M` Agent.md
- `M` Flow.md
- `M` Engine.md
- `M` System).md
- `M` (TUI).md
- `M` Handling.md
- `M` Wiki.md
- `M` Invocation.md
- `M` Workflow.md
- `M` Index.md
- `M` Context.md
- `M` Indexing.md
- `M` Skeletons.md
- `M` Settings.md
- `M` Precedence.md
- `M` cli/.kaioken/wiki/Configuration/Configuration.md
- `M` Models.md
- `M` Concurrency.md
- `M` Configuration.md
- `M` Guide.md
- `M` Binary.md
- `M` Started.md
- `M` Repository.md
- `M` Started/Installation.md
- `M` Hooks.md
- `M` Previews.md
- `M` Updates.md
- `M` Refinement.md
- `M` Planning.md
- `M` Scanning.md
- `M` cli/.kaioken/wiki/README.md
- `M` Tutorial.md
- `M` Palette.md
- `M` Rendering.md
- `M` Management.md
- `M` Footer.md
- `M` Loop.md
- `M` cli/.kaioken/wiki_state.yaml
- `M` cli/Makefile
- `M` cli/internal/agent/agent.go
- `M` cli/internal/agent/knowledge_test.go
- `M` cli/internal/agent/tools.go
- `M` cli/internal/daemon/chatui.go
- `M` cli/internal/daemon/handlers_chat.go
- `M` cli/internal/daemon/handlers_runs.go
- `M` cli/internal/daemon/handlers_workspace.go
- `M` cli/internal/daemon/handlers_workspace_test.go
- `M` cli/internal/daemon/mux.go
- `M` cli/internal/daemon/runs.go
- `M` cli/internal/session/session.go
- `M` cli/internal/tui/commands.go
- `M` cli/internal/tui/explain.go
- `M` cli/internal/tui/logo.go
- `M` cli/internal/tui/tui.go
- `M` cli/internal/tui/tutorial.go
- `M` desktop/docs/02-api-contract.md
- `M` desktop/index.html
- `M` desktop/src/App.tsx
- `M` desktop/src/components/EmptyState.tsx
- `M` desktop/src/components/Toaster.tsx
- `M` desktop/src/components/layout/AppShell.tsx
- `M` desktop/src/components/layout/NavRail.tsx
- `M` desktop/src/components/layout/StatusBar.tsx
- `M` desktop/src/index.css
- `M` desktop/src/lib/api.ts
- `M` desktop/src/lib/types.ts
- `M` desktop/src/main.tsx
- `M` desktop/src/routes/Activity.tsx
- `M` desktop/src/routes/Cards.tsx
- `M` desktop/src/routes/Chat.tsx
- `M` desktop/src/routes/Settings.tsx
- `M` desktop/src/routes/Welcome.tsx
- `M` desktop/src/routes/Wiki.tsx
- `M` desktop/src/store/chat.ts
- `M` desktop/src/store/runs.ts
- `M` desktop/src/store/workspace.ts
- `?` KAIOKEN-settings.json
- `?` internal/agent/compact.go
- `?` internal/agent/context.go
- `?` internal/agent/mode.go
- `?` internal/agent/prompts.go
- `?` internal/agent/prune.go
- `?` internal/agent/task.go
- `?` internal/llm/tokens.go

</details>

## 2026-07-26 04:16 — 8dab4b85 → d4c8cf47

448 files changed · 19 documents updated

**Documents updated**

- .kaioken/wiki/Getting Started/Basic CLI Commands Overview.md
- .kaioken/wiki/Getting Started/Building the Binary.md
- .kaioken/wiki/Getting Started/Getting Started.md
- .kaioken/wiki/Getting Started/Initializing a Repository.md
- .kaioken/wiki/Getting Started/Installation.md
- .kaioken/wiki/Getting Started/Serving the Generated Wiki.md
- .kaioken/wiki/Getting Started/Using the Terminal User Interface (TUI).md
- .kaioken/wiki/Architecture Overview/Architecture Overview.md
- .kaioken/wiki/Architecture Overview/Chat Agent.md
- .kaioken/wiki/Architecture Overview/Component Interactions and Data Flow.md
- .kaioken/wiki/Architecture Overview/Dual Nature Chat Agent and Knowledge Engine.md
- .kaioken/wiki/Architecture Overview/Knowledge Engine (Wiki System).md
- .kaioken/wiki/Architecture Overview/Terminal User Interface (TUI).md
- .kaioken/wiki/Chat Agent/Agent Core Loop and Session Handling.md
- .kaioken/wiki/Chat Agent/Chat Agent.md
- .kaioken/wiki/Chat Agent/Knowledge Integration from the Wiki.md
- .kaioken/wiki/Chat Agent/LLM Interaction and Tool Invocation.md
- .kaioken/wiki/Chat Agent/Tool System Definition, Execution, and Approval Workflow.md
- .kaioken/wiki/Knowledge Engine/Incremental Wiki Updates.md

<details><summary>Changed files</summary>

- `D` .ainow/KNOWLEDGE.md
- `D` .ainow/config.yaml
- `D` .ainow/modules.yaml
- `D` .ainow/state.json
- `D` .claude/settings.local.json
- `A` .github/workflows/ci.yml
- `M` .gitignore
- `A` Overview.md
- `A` Agent.md
- `A` Flow.md
- `A` Engine.md
- `A` System).md
- `A` (TUI).md
- `A` Overview/_section.yaml
- `A` Handling.md
- `A` Wiki.md
- `A` Invocation.md
- `A` Workflow.md
- `A` Agent/_section.yaml
- `A` Index.md
- `A` Context.md
- `A` Indexing.md
- `A` Skeletons.md
- `A` Files.md
- `A` Indexing/_section.yaml
- `A` Settings.md
- `A` Precedence.md
- `A` Models.md
- `A` Concurrency.md
- `A` Configuration.md
- `A` Project.md
- `A` Guide.md
- `A` Quality.md
- `A` Contributing.md
- `A` Tests.md
- `A` Environment.md
- `A` Structure.md
- `A` Guide/_section.yaml
- `A` Binary.md
- `A` Started.md
- `A` Repository.md
- `A` Started/Installation.md
- `A` Started/_section.yaml
- `A` Hooks.md
- `A` Build.md
- `A` Previews.md
- `A` Integration.md
- `A` Basics.md
- `A` History.md
- `A` Integration/_section.yaml
- `A` Updates.md
- `A` Refinement.md
- `A` Planning.md
- `A` Scanning.md
- `A` Engine/_section.yaml
- `A` Documentation.md
- `A` Server.md
- `A` Wiki/_section.yaml
- `A` Generation.md
- `A` Invalidation.md
- `A` Format.md
- `A` System.md
- `A` System/_section.yaml
- `A` Tutorial.md
- `A` Palette.md
- `A` Rendering.md
- `A` Management.md
- `A` Footer.md
- `A` Loop.md
- `A` (TUI)/_section.yaml
- `D` .qoder/better-harness/2026-07-25/183142-ai_now_know/canvas.json
- `D` .qoder/better-harness/2026-07-25/183142-ai_now_know/findings.json
- `D` .qoder/better-harness/2026-07-25/183142-ai_now_know/report.canvas.status.json
- `D` .qoder/better-harness/2026-07-25/183142-ai_now_know/report.canvas.tsx
- `D` Makefile
- `M` README.md
- `A` cli/.kaioken/architecture.md
- `A` cli/.kaioken/config.yaml
- `A` cli/.kaioken/modules.yaml
- `A` cli/.kaioken/sessions/20260725-181958-3440.json
- `A` cli/.kaioken/sessions/20260725-182204-1691.json
- `A` cli/.kaioken/sessions/20260725-184330-8469.json
- `A` cli/.kaioken/sessions/20260725-192505-3277.json
- `A` cli/.kaioken/sessions/20260726-024611-3571.json
- `A` cli/.kaioken/sessions/20260726-041643-3695.json
- `A` cli/.kaioken/wiki/Configuration/Configuration.md
- `A` cli/.kaioken/wiki/Configuration/_section.yaml
- `A` cli/.kaioken/wiki/README.md
- `A` cli/.kaioken/wiki_plan.yaml
- `A` cli/.kaioken/wiki_state.yaml
- `A` cli/Makefile
- `A` cli/cmd/kaioken/main.go
- `A` cli/go.mod
- `A` cli/go.sum
- `A` cli/internal/agent/agent.go
- `A` cli/internal/agent/agent_test.go
- `A` cli/internal/agent/diff.go
- `A` cli/internal/agent/diff_test.go
- `A` cli/internal/agent/knowledge.go
- `A` cli/internal/agent/knowledge_test.go
- `A` cli/internal/agent/tools.go
- `A` cli/internal/codemap/bundle.go
- `A` cli/internal/codemap/codemap.go
- `A` cli/internal/codemap/codemap_test.go
- `A` cli/internal/codemap/index.go
- `A` cli/internal/codemap/parse_go.go
- `A` cli/internal/codemap/parse_lines.go
- `A` cli/internal/config/config.go
- `A` cli/internal/config/config_test.go
- `A` cli/internal/config/global.go
- `A` cli/internal/config/global_test.go
- `A` cli/internal/daemon/approvals.go
- `A` cli/internal/daemon/chatui.go
- `A` cli/internal/daemon/daemon.go
- `A` cli/internal/daemon/daemon_test.go
- `A` cli/internal/daemon/handlers_chat.go
- `A` cli/internal/daemon/handlers_docs.go
- `A` cli/internal/daemon/handlers_docs_test.go
- `A` cli/internal/daemon/handlers_runs.go
- `A` cli/internal/daemon/handlers_settings.go
- `A` cli/internal/daemon/handlers_system.go
- `A` cli/internal/daemon/handlers_workspace.go
- `A` cli/internal/daemon/handlers_workspace_test.go
- `A` cli/internal/daemon/hub.go
- `A` cli/internal/daemon/hub_test.go
- `A` cli/internal/daemon/jsonx.go
- `A` cli/internal/daemon/mux.go
- `A` cli/internal/daemon/runs.go
- `A` cli/internal/daemon/runs_test.go
- `A` cli/internal/daemon/sse.go
- `A` cli/internal/daemon/sse_test.go
- `A` cli/internal/daemon/workspace.go
- `A` cli/internal/daemon/workspace_test.go
- `A` cli/internal/generate/generate.go
- `A` cli/internal/gitx/gitx.go
- `A` cli/internal/gitx/gitx_test.go
- `A` cli/internal/gitx/hook.go
- `A` cli/internal/gitx/hook_test.go
- `A` cli/internal/llm/budget.go
- `A` cli/internal/llm/budget_test.go
- `A` cli/internal/llm/openrouter.go
- `A` cli/internal/llm/openrouter_test.go
- `A` cli/internal/llm/stream.go
- `A` cli/internal/llm/stream_test.go
- `A` cli/internal/plan/plan.go
- `A` cli/internal/plan/plan_test.go
- `A` cli/internal/scan/scan.go
- `A` cli/internal/serve/serve.go
- `A` cli/internal/serve/serve_test.go
- `A` cli/internal/session/session.go
- `A` cli/internal/session/session_test.go
- `A` cli/internal/skills/generate.go
- `A` cli/internal/skills/skills.go
- `A` cli/internal/skills/skills_test.go
- `A` cli/internal/state/state.go
- `A` cli/internal/tui/commands.go
- `A` cli/internal/tui/composer_test.go
- `A` cli/internal/tui/explain.go
- `A` cli/internal/tui/explain_test.go
- `A` cli/internal/tui/logo.go
- `A` cli/internal/tui/logo_test.go
- `A` cli/internal/tui/main_test.go
- `A` cli/internal/tui/markdown.go
- `A` cli/internal/tui/markdown_test.go
- `A` cli/internal/tui/palette.go
- `A` cli/internal/tui/palette_test.go
- `A` cli/internal/tui/provider_test.go
- `A` cli/internal/tui/status_test.go
- `A` cli/internal/tui/tui.go
- `A` cli/internal/tui/tutorial.go
- `A` cli/internal/tui/tutorial_test.go
- `A` cli/internal/version/version.go
- `A` cli/internal/wiki/brief.go
- `A` cli/internal/wiki/estimate.go
- `A` cli/internal/wiki/estimate_test.go
- `A` cli/internal/wiki/facts.go
- `A` cli/internal/wiki/facts_test.go
- `A` cli/internal/wiki/passes.go
- `A` cli/internal/wiki/polish.go
- `A` cli/internal/wiki/polish_test.go
- `A` cli/internal/wiki/provenance.go
- `A` cli/internal/wiki/provenance_test.go
- `A` cli/internal/wiki/update.go
- `A` cli/internal/wiki/update_test.go
- `A` cli/internal/wiki/verify.go
- `A` cli/internal/wiki/verify_test.go
- `A` cli/internal/wiki/wiki.go
- `D` cmd/kaioken/main.go
- `A` desktop/AGENT_BRIEF.md
- `A` desktop/PLAN.md
- `A` desktop/README.md
- `A` desktop/docs/01-architecture.md
- `A` desktop/docs/02-api-contract.md
- `A` desktop/docs/03-go-daemon.md
- `A` desktop/docs/04-rust-shell.md
- `A` desktop/docs/05-frontend.md
- `A` desktop/docs/06-screens.md
- `A` desktop/docs/07-build-release.md
- `A` desktop/docs/08-testing.md
- `A` desktop/docs/09-risks.md
- `A` desktop/docs/10-tasks.md
- `A` desktop/index.html
- `A` desktop/package-lock.json
- `A` desktop/package.json
- `A` desktop/scripts/build-sidecar.mjs
- `A` desktop/src-tauri/Cargo.lock
- `A` desktop/src-tauri/Cargo.toml
- `A` desktop/src-tauri/build.rs
- `A` desktop/src-tauri/capabilities/default.json
- `A` desktop/src-tauri/icons/128x128.png
- `A` desktop/src-tauri/icons/128x128@2x.png
- `A` desktop/src-tauri/icons/32x32.png
- `A` desktop/src-tauri/icons/64x64.png
- `A` desktop/src-tauri/icons/Square107x107Logo.png
- `A` desktop/src-tauri/icons/Square142x142Logo.png
- `A` desktop/src-tauri/icons/Square150x150Logo.png
- `A` desktop/src-tauri/icons/Square284x284Logo.png
- `A` desktop/src-tauri/icons/Square30x30Logo.png
- `A` desktop/src-tauri/icons/Square310x310Logo.png
- `A` desktop/src-tauri/icons/Square44x44Logo.png
- `A` desktop/src-tauri/icons/Square71x71Logo.png
- `A` desktop/src-tauri/icons/Square89x89Logo.png
- `A` desktop/src-tauri/icons/StoreLogo.png
- `A` desktop/src-tauri/icons/android/mipmap-anydpi-v26/ic_launcher.xml
- `A` desktop/src-tauri/icons/android/mipmap-hdpi/ic_launcher.png
- `A` desktop/src-tauri/icons/android/mipmap-hdpi/ic_launcher_foreground.png
- `A` desktop/src-tauri/icons/android/mipmap-hdpi/ic_launcher_round.png
- `A` desktop/src-tauri/icons/android/mipmap-mdpi/ic_launcher.png
- `A` desktop/src-tauri/icons/android/mipmap-mdpi/ic_launcher_foreground.png
- `A` desktop/src-tauri/icons/android/mipmap-mdpi/ic_launcher_round.png
- `A` desktop/src-tauri/icons/android/mipmap-xhdpi/ic_launcher.png
- `A` desktop/src-tauri/icons/android/mipmap-xhdpi/ic_launcher_foreground.png
- `A` desktop/src-tauri/icons/android/mipmap-xhdpi/ic_launcher_round.png
- `A` desktop/src-tauri/icons/android/mipmap-xxhdpi/ic_launcher.png
- `A` desktop/src-tauri/icons/android/mipmap-xxhdpi/ic_launcher_foreground.png
- `A` desktop/src-tauri/icons/android/mipmap-xxhdpi/ic_launcher_round.png
- `A` desktop/src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher.png
- `A` desktop/src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_foreground.png
- `A` desktop/src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_round.png
- `A` desktop/src-tauri/icons/android/values/ic_launcher_background.xml
- `A` desktop/src-tauri/icons/icon.icns
- `A` desktop/src-tauri/icons/icon.ico
- `A` desktop/src-tauri/icons/icon.png
- `A` desktop/src-tauri/icons/ios/AppIcon-20x20@1x.png
- `A` desktop/src-tauri/icons/ios/AppIcon-20x20@2x-1.png
- `A` desktop/src-tauri/icons/ios/AppIcon-20x20@2x.png
- `A` desktop/src-tauri/icons/ios/AppIcon-20x20@3x.png
- `A` desktop/src-tauri/icons/ios/AppIcon-29x29@1x.png
- `A` desktop/src-tauri/icons/ios/AppIcon-29x29@2x-1.png
- `A` desktop/src-tauri/icons/ios/AppIcon-29x29@2x.png
- `A` desktop/src-tauri/icons/ios/AppIcon-29x29@3x.png
- `A` desktop/src-tauri/icons/ios/AppIcon-40x40@1x.png
- `A` desktop/src-tauri/icons/ios/AppIcon-40x40@2x-1.png
- `A` desktop/src-tauri/icons/ios/AppIcon-40x40@2x.png
- `A` desktop/src-tauri/icons/ios/AppIcon-40x40@3x.png
- `A` desktop/src-tauri/icons/ios/AppIcon-512@2x.png
- `A` desktop/src-tauri/icons/ios/AppIcon-60x60@2x.png
- `A` desktop/src-tauri/icons/ios/AppIcon-60x60@3x.png
- `A` desktop/src-tauri/icons/ios/AppIcon-76x76@1x.png
- `A` desktop/src-tauri/icons/ios/AppIcon-76x76@2x.png
- `A` desktop/src-tauri/icons/ios/AppIcon-83.5x83.5@2x.png
- `A` desktop/src-tauri/src/commands.rs
- `A` desktop/src-tauri/src/daemon.rs
- `A` desktop/src-tauri/src/lib.rs
- `A` desktop/src-tauri/src/main.rs
- `A` desktop/src-tauri/tauri.conf.json
- `A` desktop/src/App.tsx
- `A` desktop/src/components/CommandPalette.tsx
- `A` desktop/src/components/EmptyState.tsx
- `A` desktop/src/components/ShortcutHelp.tsx
- `A` desktop/src/components/Toaster.tsx
- `A` desktop/src/components/layout/AppShell.tsx
- `A` desktop/src/components/layout/NavRail.tsx
- `A` desktop/src/components/layout/StatusBar.tsx
- `A` desktop/src/index.css
- `A` desktop/src/lib/__tests__/events.test.ts
- `A` desktop/src/lib/__tests__/sse.test.ts
- `A` desktop/src/lib/api.ts
- `A` desktop/src/lib/daemon.ts
- `A` desktop/src/lib/errors.ts
- `A` desktop/src/lib/events.ts
- `A` desktop/src/lib/format.ts
- `A` desktop/src/lib/shortcuts.ts
- `A` desktop/src/lib/sse.ts
- `A` desktop/src/lib/types.ts
- `A` desktop/src/lib/utils.ts
- `A` desktop/src/main.tsx
- `A` desktop/src/routes/Activity.tsx
- `A` desktop/src/routes/Cards.tsx
- `A` desktop/src/routes/Chat.tsx
- `A` desktop/src/routes/Settings.tsx
- `A` desktop/src/routes/Welcome.tsx
- `A` desktop/src/routes/Wiki.tsx
- `A` desktop/src/store/chat.ts
- `A` desktop/src/store/conn.ts
- `A` desktop/src/store/runs.ts
- `A` desktop/src/store/toast.ts
- `A` desktop/src/store/workspace.ts
- `A` desktop/src/vite-env.d.ts
- `A` desktop/tsconfig.app.json
- `A` desktop/tsconfig.json
- `A` desktop/tsconfig.node.json
- `A` desktop/vite.config.ts
- `D` go.mod
- `D` go.sum
- `D` internal/agent/agent.go
- `D` internal/agent/agent_test.go
- `D` internal/agent/diff.go
- `D` internal/agent/knowledge.go
- `D` internal/agent/knowledge_test.go
- `D` internal/agent/tools.go
- `D` internal/codemap/bundle.go
- `D` internal/codemap/codemap.go
- `D` internal/codemap/codemap_test.go
- `D` internal/codemap/index.go
- `D` internal/codemap/parse_go.go
- `D` internal/codemap/parse_lines.go
- `D` internal/config/config.go
- `D` internal/config/config_test.go
- `D` internal/config/global.go
- `D` internal/config/global_test.go
- `D` internal/generate/generate.go
- `D` internal/gitx/gitx.go
- `D` internal/gitx/gitx_test.go
- `D` internal/gitx/hook.go
- `D` internal/gitx/hook_test.go
- `D` internal/llm/budget.go
- `D` internal/llm/budget_test.go
- `D` internal/llm/openrouter.go
- `D` internal/llm/openrouter_test.go
- `D` internal/llm/stream.go
- `D` internal/llm/stream_test.go
- `D` internal/plan/plan.go
- `D` internal/plan/plan_test.go
- `D` internal/scan/scan.go
- `D` internal/serve/serve.go
- `D` internal/serve/serve_test.go
- `D` internal/session/session.go
- `D` internal/session/session_test.go
- `D` internal/skills/generate.go
- `D` internal/skills/skills.go
- `D` internal/skills/skills_test.go
- `D` internal/state/state.go
- `D` internal/tui/commands.go
- `D` internal/tui/composer_test.go
- `D` internal/tui/explain.go
- `D` internal/tui/explain_test.go
- `D` internal/tui/logo.go
- `D` internal/tui/logo_test.go
- `D` internal/tui/main_test.go
- `D` internal/tui/markdown.go
- `D` internal/tui/markdown_test.go
- `D` internal/tui/palette.go
- `D` internal/tui/palette_test.go
- `D` internal/tui/provider_test.go
- `D` internal/tui/status_test.go
- `D` internal/tui/tui.go
- `D` internal/tui/tutorial.go
- `D` internal/tui/tutorial_test.go
- `D` internal/version/version.go
- `D` internal/wiki/brief.go
- `D` internal/wiki/estimate.go
- `D` internal/wiki/estimate_test.go
- `D` internal/wiki/facts.go
- `D` internal/wiki/facts_test.go
- `D` internal/wiki/passes.go
- `D` internal/wiki/polish.go
- `D` internal/wiki/polish_test.go
- `D` internal/wiki/provenance.go
- `D` internal/wiki/provenance_test.go
- `D` internal/wiki/update.go
- `D` internal/wiki/update_test.go
- `D` internal/wiki/verify.go
- `D` internal/wiki/verify_test.go
- `D` internal/wiki/wiki.go
- `A` website/components.json
- `A` website/index.html
- `A` website/package-lock.json
- `A` website/package.json
- `A` website/public/favicon.svg
- `A` website/public/kaioken/architecture.md
- `A` website/public/kaioken/modules.yaml
- `A` website/public/kaioken/wiki/Configuration/Configuration.md
- `A` website/public/kaioken/wiki/Configuration/_section.yaml
- `A` website/public/kaioken/wiki/README.md
- `A` website/public/kaioken/wiki_plan.yaml
- `A` website/public/kaioken/wiki_state.yaml
- `A` website/public/shots/wiki_doc.png
- `A` website/public/shots/wiki_index.png
- `A` website/scripts/gen-wiki-manifest.mjs
- `A` website/src/App.tsx
- `A` website/src/bits/FaultyTerminal.tsx
- `A` website/src/components/AsciiArt.tsx
- `A` website/src/components/CodeBlock.tsx
- `A` website/src/components/GithubMark.tsx
- `A` website/src/components/Icon.tsx
- `A` website/src/components/LinkButton.tsx
- `A` website/src/components/Markdown.tsx
- `A` website/src/components/Mermaid.tsx
- `A` website/src/components/SectionHeading.tsx
- `A` website/src/components/SiteFooter.tsx
- `A` website/src/components/SiteHeader.tsx
- `A` website/src/components/TerminalDemo.tsx
- `A` website/src/components/TerminalWindow.tsx
- `A` website/src/components/docs/parts.tsx
- `A` website/src/components/sections/Commands.tsx
- `A` website/src/components/sections/Features.tsx
- `A` website/src/components/sections/Hero.tsx
- `A` website/src/components/sections/Multiplier.tsx
- `A` website/src/components/sections/OutputTree.tsx
- `A` website/src/components/sections/Pipeline.tsx
- `A` website/src/components/sections/Quality.tsx
- `A` website/src/components/sections/QuickStart.tsx
- `A` website/src/components/ui/badge.tsx
- `A` website/src/components/ui/button.tsx
- `A` website/src/components/ui/tabs.tsx
- `A` website/src/data/content.ts
- `A` website/src/data/docs-nav.ts
- `A` website/src/data/roadmap.ts
- `A` website/src/data/wiki-manifest.json
- `A` website/src/data/wiki.ts
- `A` website/src/index.css
- `A` website/src/lib/utils.ts
- `A` website/src/main.tsx
- `A` website/src/pages/Home.tsx
- `A` website/src/pages/Next.tsx
- `A` website/src/pages/Showcase.tsx
- `A` website/src/pages/docs/Cards.tsx
- `A` website/src/pages/docs/CommandsDoc.tsx
- `A` website/src/pages/docs/Config.tsx
- `A` website/src/pages/docs/DocsIndex.tsx
- `A` website/src/pages/docs/DocsLayout.tsx
- `A` website/src/pages/docs/Install.tsx
- `A` website/src/pages/docs/OutputDoc.tsx
- `A` website/src/pages/docs/Skills.tsx
- `A` website/src/pages/docs/Tui.tsx
- `A` website/src/pages/docs/Update.tsx
- `A` website/src/pages/docs/Wiki.tsx
- `A` website/src/pages/preview/PreviewDoc.tsx
- `A` website/src/pages/preview/PreviewIndex.tsx
- `A` website/src/pages/preview/PreviewLayout.tsx
- `A` website/src/vite-env.d.ts
- `A` website/tsconfig.app.json
- `A` website/tsconfig.json
- `A` website/tsconfig.node.json
- `A` website/vercel.json
- `A` website/vite.config.ts
- `A` wiki

</details>

