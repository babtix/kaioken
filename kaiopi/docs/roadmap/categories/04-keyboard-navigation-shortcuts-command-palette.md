# Category 4: Keyboard Navigation, Shortcuts & Command Palette

> **Range**: `#UX-0301` to `#UX-0400` (100 Features)    
> **Subsystems**: `packages/tui`, `packages/coding-agent`    
> **Focus Area**: Ergonomics, keybindings, modal shortcuts, fuzzy command filtering, and hands-on-the-keyboard efficiency.  

---

## Global Implementation Plan: Category 4

### 1. Strategic Objective
Enable complete, lightning-fast hands-on-the-keyboard control with Vim-style keybindings, fuzzy command palettes, and custom JSON keymaps.

### 2. Execution Phases & Milestones

| Phase | Milestone Scope | Core Focus & Deliverables | Feature Slice |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Immediate Friction Elimination** | Add global shortcut triggers, Vim navigation keys (j/k, g/G), and Escape key dismissals across all modals (Features UX-0301 to UX-0330). | `#UX-0301` – `#UX-0330` |
| **Phase 2** | **Architectural Deepening** | Implement fuzzy auto-complete selector, contextual quick-action menus (Alt+Enter), and history search (Ctrl+R) (Features UX-0331 to UX-0370). | `#UX-0331` – `#UX-0370` |
| **Phase 3** | **Hardening & Intelligence** | Provide multi-level undo/redo stacks, customizable keymap JSON overrides, and visual keyboard cheat-sheets (Features UX-0371 to UX-0400). | `#UX-0371` – `#UX-0400` |

### 3. Core Architectural Invariants & Guarantees
- **Invariant 1 (Public Pi Extension Seams)**: Zero core forks or monkey-patching of `@mario/pi`; clean extension lifecycle hooks.
- **Invariant 10 (100% Offline-Testable)**: Zero hard network dependencies; all mocks, parsers, and UI components must be fully verifiable offline.
- **Defensive Error Boundaries**: Every user interaction, render cycle, and file parser must fail soft without crashing the TUI or host process.

### 4. Verification & Testing Checklist
- [x] Run domain unit test suite: `npx vitest run packages/tui/test`
- [x] Verify zero-allocation memory pooling and no event listener leaks
- [x] Test graceful fallback on dumb terminals (`TERM=dumb`) or non-TTY outputs
- [x] Validate edge-case inputs (empty strings, huge context files, circular links)
- [x] Verify integration with fake Pi test harness (`test/fake-pi.ts`)

---

## Detailed Features Catalog (#UX-0301 – #UX-0400)

### [UX-0301] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for slash command palette
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with slash command palette require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for slash command palette with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0302] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for chat transcript message list
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with chat transcript message list require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for chat transcript message list with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0303] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for wiki document table of contents
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with wiki document table of contents require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for wiki document table of contents with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0304] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for knowledge card browser
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with knowledge card browser require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for knowledge card browser with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0305] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for AST symbol declaration search
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with AST symbol declaration search require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for ast symbol declaration search with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0306] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for drift report file selector
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with drift report file selector require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for drift report file selector with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0307] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for search results ranking list
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with search results ranking list require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for search results ranking list with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0308] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for worktree task switcher
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with worktree task switcher require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for worktree task switcher with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0309] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for module planning editor
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with module planning editor require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for module planning editor with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0310] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for spend confirmation prompt
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with spend confirmation prompt require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for spend confirmation prompt with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0311] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for test failure stack trace viewer
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with test failure stack trace viewer require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for test failure stack trace viewer with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0312] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for web research source picker
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with web research source picker require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for web research source picker with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0313] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for skill catalog explorer
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with skill catalog explorer require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for skill catalog explorer with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0314] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for dependency graph node inspector
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with dependency graph node inspector require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for dependency graph node inspector with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0315] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for header telemetry HUD
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with header telemetry HUD require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for header telemetry hud with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0316] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for interactive diff patch chunk selector
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with interactive diff patch chunk selector require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for interactive diff patch chunk selector with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0317] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for file risk flag review modal
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with file risk flag review modal require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for file risk flag review modal with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0318] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for theme color picker
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with theme color picker require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for theme color picker with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0319] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for live web preview control panel
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with live web preview control panel require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for live web preview control panel with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0320] Vim-style navigation hotkey (`j`/`k`, `g`/`G`) for help documentation browser
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with help documentation browser require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement vim-style navigation hotkey (`j`/`k`, `g`/`g`) for help documentation browser with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0321] Fuzzy search and auto-complete quick selector for slash command palette
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with slash command palette require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for slash command palette with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0322] Fuzzy search and auto-complete quick selector for chat transcript message list
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with chat transcript message list require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for chat transcript message list with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0323] Fuzzy search and auto-complete quick selector for wiki document table of contents
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with wiki document table of contents require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for wiki document table of contents with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0324] Fuzzy search and auto-complete quick selector for knowledge card browser
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with knowledge card browser require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for knowledge card browser with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0325] Fuzzy search and auto-complete quick selector for AST symbol declaration search
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with AST symbol declaration search require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for ast symbol declaration search with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0326] Fuzzy search and auto-complete quick selector for drift report file selector
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with drift report file selector require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for drift report file selector with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0327] Fuzzy search and auto-complete quick selector for search results ranking list
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with search results ranking list require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for search results ranking list with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0328] Fuzzy search and auto-complete quick selector for worktree task switcher
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with worktree task switcher require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for worktree task switcher with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0329] Fuzzy search and auto-complete quick selector for module planning editor
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with module planning editor require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for module planning editor with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0330] Fuzzy search and auto-complete quick selector for spend confirmation prompt
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with spend confirmation prompt require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for spend confirmation prompt with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0331] Fuzzy search and auto-complete quick selector for test failure stack trace viewer
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with test failure stack trace viewer require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for test failure stack trace viewer with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0332] Fuzzy search and auto-complete quick selector for web research source picker
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with web research source picker require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for web research source picker with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0333] Fuzzy search and auto-complete quick selector for skill catalog explorer
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with skill catalog explorer require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for skill catalog explorer with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0334] Fuzzy search and auto-complete quick selector for dependency graph node inspector
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with dependency graph node inspector require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for dependency graph node inspector with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0335] Fuzzy search and auto-complete quick selector for header telemetry HUD
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with header telemetry HUD require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for header telemetry hud with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0336] Fuzzy search and auto-complete quick selector for interactive diff patch chunk selector
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with interactive diff patch chunk selector require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for interactive diff patch chunk selector with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0337] Fuzzy search and auto-complete quick selector for file risk flag review modal
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with file risk flag review modal require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for file risk flag review modal with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0338] Fuzzy search and auto-complete quick selector for theme color picker
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with theme color picker require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for theme color picker with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0339] Fuzzy search and auto-complete quick selector for live web preview control panel
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with live web preview control panel require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for live web preview control panel with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0340] Fuzzy search and auto-complete quick selector for help documentation browser
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with help documentation browser require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy search and auto-complete quick selector for help documentation browser with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0341] Dedicated global hotkey shortcut to immediately toggle slash command palette
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with slash command palette require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle slash command palette with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0342] Dedicated global hotkey shortcut to immediately toggle chat transcript message list
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with chat transcript message list require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle chat transcript message list with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0343] Dedicated global hotkey shortcut to immediately toggle wiki document table of contents
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with wiki document table of contents require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle wiki document table of contents with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0344] Dedicated global hotkey shortcut to immediately toggle knowledge card browser
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with knowledge card browser require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle knowledge card browser with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0345] Dedicated global hotkey shortcut to immediately toggle AST symbol declaration search
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with AST symbol declaration search require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle ast symbol declaration search with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0346] Dedicated global hotkey shortcut to immediately toggle drift report file selector
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with drift report file selector require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle drift report file selector with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0347] Dedicated global hotkey shortcut to immediately toggle search results ranking list
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with search results ranking list require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle search results ranking list with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0348] Dedicated global hotkey shortcut to immediately toggle worktree task switcher
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with worktree task switcher require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle worktree task switcher with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0349] Dedicated global hotkey shortcut to immediately toggle module planning editor
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with module planning editor require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle module planning editor with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0350] Dedicated global hotkey shortcut to immediately toggle spend confirmation prompt
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with spend confirmation prompt require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle spend confirmation prompt with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0351] Dedicated global hotkey shortcut to immediately toggle test failure stack trace viewer
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with test failure stack trace viewer require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle test failure stack trace viewer with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0352] Dedicated global hotkey shortcut to immediately toggle web research source picker
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with web research source picker require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle web research source picker with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0353] Dedicated global hotkey shortcut to immediately toggle skill catalog explorer
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with skill catalog explorer require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle skill catalog explorer with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0354] Dedicated global hotkey shortcut to immediately toggle dependency graph node inspector
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with dependency graph node inspector require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle dependency graph node inspector with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0355] Dedicated global hotkey shortcut to immediately toggle header telemetry HUD
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with header telemetry HUD require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle header telemetry hud with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0356] Dedicated global hotkey shortcut to immediately toggle interactive diff patch chunk selector
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with interactive diff patch chunk selector require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle interactive diff patch chunk selector with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0357] Dedicated global hotkey shortcut to immediately toggle file risk flag review modal
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with file risk flag review modal require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle file risk flag review modal with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0358] Dedicated global hotkey shortcut to immediately toggle theme color picker
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with theme color picker require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle theme color picker with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0359] Dedicated global hotkey shortcut to immediately toggle live web preview control panel
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with live web preview control panel require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle live web preview control panel with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0360] Dedicated global hotkey shortcut to immediately toggle help documentation browser
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with help documentation browser require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement dedicated global hotkey shortcut to immediately toggle help documentation browser with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0361] Multi-level undo/redo keyboard stack for slash command palette
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with slash command palette require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for slash command palette with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0362] Multi-level undo/redo keyboard stack for chat transcript message list
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with chat transcript message list require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for chat transcript message list with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0363] Multi-level undo/redo keyboard stack for wiki document table of contents
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with wiki document table of contents require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for wiki document table of contents with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0364] Multi-level undo/redo keyboard stack for knowledge card browser
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with knowledge card browser require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for knowledge card browser with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0365] Multi-level undo/redo keyboard stack for AST symbol declaration search
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with AST symbol declaration search require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for ast symbol declaration search with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0366] Multi-level undo/redo keyboard stack for drift report file selector
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with drift report file selector require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for drift report file selector with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0367] Multi-level undo/redo keyboard stack for search results ranking list
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with search results ranking list require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for search results ranking list with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0368] Multi-level undo/redo keyboard stack for worktree task switcher
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with worktree task switcher require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for worktree task switcher with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0369] Multi-level undo/redo keyboard stack for module planning editor
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with module planning editor require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for module planning editor with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0370] Multi-level undo/redo keyboard stack for spend confirmation prompt
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with spend confirmation prompt require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for spend confirmation prompt with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0371] Multi-level undo/redo keyboard stack for test failure stack trace viewer
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with test failure stack trace viewer require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for test failure stack trace viewer with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0372] Multi-level undo/redo keyboard stack for web research source picker
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with web research source picker require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for web research source picker with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0373] Multi-level undo/redo keyboard stack for skill catalog explorer
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with skill catalog explorer require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for skill catalog explorer with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0374] Multi-level undo/redo keyboard stack for dependency graph node inspector
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with dependency graph node inspector require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for dependency graph node inspector with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0375] Multi-level undo/redo keyboard stack for header telemetry HUD
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with header telemetry HUD require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for header telemetry hud with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0376] Multi-level undo/redo keyboard stack for interactive diff patch chunk selector
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with interactive diff patch chunk selector require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for interactive diff patch chunk selector with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0377] Multi-level undo/redo keyboard stack for file risk flag review modal
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with file risk flag review modal require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for file risk flag review modal with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0378] Multi-level undo/redo keyboard stack for theme color picker
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with theme color picker require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for theme color picker with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0379] Multi-level undo/redo keyboard stack for live web preview control panel
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with live web preview control panel require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for live web preview control panel with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0380] Multi-level undo/redo keyboard stack for help documentation browser
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with help documentation browser require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-level undo/redo keyboard stack for help documentation browser with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0381] Interactive tab-completion cycling across slash command palette
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with slash command palette require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across slash command palette with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0382] Interactive tab-completion cycling across chat transcript message list
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with chat transcript message list require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across chat transcript message list with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0383] Interactive tab-completion cycling across wiki document table of contents
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with wiki document table of contents require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across wiki document table of contents with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0384] Interactive tab-completion cycling across knowledge card browser
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with knowledge card browser require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across knowledge card browser with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0385] Interactive tab-completion cycling across AST symbol declaration search
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with AST symbol declaration search require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across ast symbol declaration search with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0386] Interactive tab-completion cycling across drift report file selector
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with drift report file selector require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across drift report file selector with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0387] Interactive tab-completion cycling across search results ranking list
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with search results ranking list require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across search results ranking list with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0388] Interactive tab-completion cycling across worktree task switcher
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with worktree task switcher require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across worktree task switcher with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0389] Interactive tab-completion cycling across module planning editor
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with module planning editor require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across module planning editor with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0390] Interactive tab-completion cycling across spend confirmation prompt
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with spend confirmation prompt require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across spend confirmation prompt with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0391] Interactive tab-completion cycling across test failure stack trace viewer
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with test failure stack trace viewer require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across test failure stack trace viewer with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0392] Interactive tab-completion cycling across web research source picker
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with web research source picker require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across web research source picker with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0393] Interactive tab-completion cycling across skill catalog explorer
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with skill catalog explorer require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across skill catalog explorer with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0394] Interactive tab-completion cycling across dependency graph node inspector
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with dependency graph node inspector require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across dependency graph node inspector with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0395] Interactive tab-completion cycling across header telemetry HUD
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with header telemetry HUD require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across header telemetry hud with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0396] Interactive tab-completion cycling across interactive diff patch chunk selector
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with interactive diff patch chunk selector require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across interactive diff patch chunk selector with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0397] Interactive tab-completion cycling across file risk flag review modal
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with file risk flag review modal require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across file risk flag review modal with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0398] Interactive tab-completion cycling across theme color picker
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with theme color picker require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across theme color picker with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0399] Interactive tab-completion cycling across live web preview control panel
- **Subsystem**: `packages/tui` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with live web preview control panel require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across live web preview control panel with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0400] Interactive tab-completion cycling across help documentation browser
- **Subsystem**: `packages/coding-agent` | **Category**: Keyboard Navigation, Shortcuts & Command Palette | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with help documentation browser require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive tab-completion cycling across help documentation browser with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

---
