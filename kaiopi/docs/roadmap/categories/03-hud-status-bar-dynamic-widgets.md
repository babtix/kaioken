# Category 3: HUD, Status Bar & Dynamic Widgets

> **Range**: `#UX-0201` to `#UX-0300` (100 Features)    
> **Subsystems**: `.pi/extensions/kaioken/ui/header.ts`, `.pi/extensions/kaioken/commands`    
> **Focus Area**: Enhancements to status monitors, HUD gauges, telemetry readouts, persistent in-flight counters, and background meters.  

---

## Global Implementation Plan: Category 3

### 1. Strategic Objective
Provide instant operational awareness via a non-intrusive, zero-allocation HUD displaying real-time telemetry, token spend velocity, and repository health.

### 2. Execution Phases & Milestones

| Phase | Milestone Scope | Core Focus & Deliverables | Feature Slice |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Immediate Friction Elimination** | Implement core status bar pills for model context window utilization and token burn rates (Features UX-0201 to UX-0230). | `#UX-0201` – `#UX-0230` |
| **Phase 2** | **Architectural Deepening** | Add miniaturized sparklines, dirty worktree indicators, and background task progress meters (Features UX-0231 to UX-0270). | `#UX-0231` – `#UX-0270` |
| **Phase 3** | **Hardening & Intelligence** | Deploy interactive hover tooltips, dual-repo comparison views, and lightweight zero-allocation polling loops (Features UX-0271 to UX-0300). | `#UX-0271` – `#UX-0300` |

### 3. Core Architectural Invariants & Guarantees
- **Invariant 1 (Public Pi Extension Seams)**: Zero core forks or monkey-patching of `@mario/pi`; clean extension lifecycle hooks.
- **Invariant 10 (100% Offline-Testable)**: Zero hard network dependencies; all mocks, parsers, and UI components must be fully verifiable offline.
- **Defensive Error Boundaries**: Every user interaction, render cycle, and file parser must fail soft without crashing the TUI or host process.

### 4. Verification & Testing Checklist
- [ ] Run domain unit test suite: `npx vitest run .pi/extensions/kaioken/test/layout.test.ts`
- [ ] Verify zero-allocation memory pooling and no event listener leaks
- [ ] Test graceful fallback on dumb terminals (`TERM=dumb`) or non-TTY outputs
- [ ] Validate edge-case inputs (empty strings, huge context files, circular links)
- [ ] Verify integration with fake Pi test harness (`test/fake-pi.ts`)

---

## Detailed Features Catalog (#UX-0201 – #UX-0300)

### [UX-0201] Real-time telemetry metric displaying active model context window utilization
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with active model context window utilization require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying active model context window utilization with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0202] Real-time telemetry metric displaying real-time token spend velocity (tokens/sec)
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with real-time token spend velocity (tokens/sec) require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying real-time token spend velocity (tokens/sec) with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0203] Real-time telemetry metric displaying repository file count freshness ratio
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with repository file count freshness ratio require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying repository file count freshness ratio with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0204] Real-time telemetry metric displaying unverified git working tree dirty status
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with unverified git working tree dirty status require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying unverified git working tree dirty status with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0205] Real-time telemetry metric displaying in-flight background task count
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with in-flight background task count require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying in-flight background task count with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0206] Real-time telemetry metric displaying active HTTP preview server port and health
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with active HTTP preview server port and health require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying active http preview server port and health with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0207] Real-time telemetry metric displaying staleness index percentage
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with staleness index percentage require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying staleness index percentage with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0208] Real-time telemetry metric displaying grounded vs ungrounded claim ratio
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with grounded vs ungrounded claim ratio require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying grounded vs ungrounded claim ratio with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0209] Real-time telemetry metric displaying active worktree task branch name
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with active worktree task branch name require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying active worktree task branch name with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0210] Real-time telemetry metric displaying AST symbol index cache hit rate
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with AST symbol index cache hit rate require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying ast symbol index cache hit rate with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0211] Real-time telemetry metric displaying system memory RSS overhead
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with system memory RSS overhead require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying system memory rss overhead with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0212] Real-time telemetry metric displaying model request round-trip latency (ms)
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with model request round-trip latency (ms) require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying model request round-trip latency (ms) with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0213] Real-time telemetry metric displaying detected test framework name and version
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with detected test framework name and version require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying detected test framework name and version with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0214] Real-time telemetry metric displaying active git hooks execution state
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with active git hooks execution state require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying active git hooks execution state with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0215] Real-time telemetry metric displaying number of discovered agent skills
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with number of discovered agent skills require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying number of discovered agent skills with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0216] Real-time telemetry metric displaying number of generated wiki chapters
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with number of generated wiki chapters require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying number of generated wiki chapters with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0217] Real-time telemetry metric displaying number of indexed knowledge cards
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with number of indexed knowledge cards require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying number of indexed knowledge cards with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0218] Real-time telemetry metric displaying secret scanner risk alert counter
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with secret scanner risk alert counter require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying secret scanner risk alert counter with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0219] Real-time telemetry metric displaying web research quota and rate limits
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with web research quota and rate limits require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying web research quota and rate limits with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0220] Real-time telemetry metric displaying live SSE connected client count
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with live SSE connected client count require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement real-time telemetry metric displaying live sse connected client count with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0221] Miniaturized sparkline graphing trend for active model context window utilization
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with active model context window utilization require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for active model context window utilization with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0222] Miniaturized sparkline graphing trend for real-time token spend velocity (tokens/sec)
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with real-time token spend velocity (tokens/sec) require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for real-time token spend velocity (tokens/sec) with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0223] Miniaturized sparkline graphing trend for repository file count freshness ratio
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with repository file count freshness ratio require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for repository file count freshness ratio with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0224] Miniaturized sparkline graphing trend for unverified git working tree dirty status
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with unverified git working tree dirty status require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for unverified git working tree dirty status with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0225] Miniaturized sparkline graphing trend for in-flight background task count
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with in-flight background task count require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for in-flight background task count with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0226] Miniaturized sparkline graphing trend for active HTTP preview server port and health
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with active HTTP preview server port and health require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for active http preview server port and health with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0227] Miniaturized sparkline graphing trend for staleness index percentage
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with staleness index percentage require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for staleness index percentage with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0228] Miniaturized sparkline graphing trend for grounded vs ungrounded claim ratio
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with grounded vs ungrounded claim ratio require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for grounded vs ungrounded claim ratio with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0229] Miniaturized sparkline graphing trend for active worktree task branch name
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with active worktree task branch name require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for active worktree task branch name with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0230] Miniaturized sparkline graphing trend for AST symbol index cache hit rate
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with AST symbol index cache hit rate require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for ast symbol index cache hit rate with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0231] Miniaturized sparkline graphing trend for system memory RSS overhead
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with system memory RSS overhead require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for system memory rss overhead with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0232] Miniaturized sparkline graphing trend for model request round-trip latency (ms)
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with model request round-trip latency (ms) require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for model request round-trip latency (ms) with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0233] Miniaturized sparkline graphing trend for detected test framework name and version
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with detected test framework name and version require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for detected test framework name and version with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0234] Miniaturized sparkline graphing trend for active git hooks execution state
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with active git hooks execution state require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for active git hooks execution state with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0235] Miniaturized sparkline graphing trend for number of discovered agent skills
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with number of discovered agent skills require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for number of discovered agent skills with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0236] Miniaturized sparkline graphing trend for number of generated wiki chapters
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with number of generated wiki chapters require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for number of generated wiki chapters with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0237] Miniaturized sparkline graphing trend for number of indexed knowledge cards
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with number of indexed knowledge cards require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for number of indexed knowledge cards with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0238] Miniaturized sparkline graphing trend for secret scanner risk alert counter
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with secret scanner risk alert counter require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for secret scanner risk alert counter with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0239] Miniaturized sparkline graphing trend for web research quota and rate limits
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with web research quota and rate limits require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for web research quota and rate limits with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0240] Miniaturized sparkline graphing trend for live SSE connected client count
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with live SSE connected client count require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement miniaturized sparkline graphing trend for live sse connected client count with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0241] Interactive status bar click/hover trigger for active model context window utilization
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with active model context window utilization require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for active model context window utilization with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0242] Interactive status bar click/hover trigger for real-time token spend velocity (tokens/sec)
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with real-time token spend velocity (tokens/sec) require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for real-time token spend velocity (tokens/sec) with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0243] Interactive status bar click/hover trigger for repository file count freshness ratio
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with repository file count freshness ratio require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for repository file count freshness ratio with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0244] Interactive status bar click/hover trigger for unverified git working tree dirty status
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with unverified git working tree dirty status require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for unverified git working tree dirty status with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0245] Interactive status bar click/hover trigger for in-flight background task count
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with in-flight background task count require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for in-flight background task count with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0246] Interactive status bar click/hover trigger for active HTTP preview server port and health
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with active HTTP preview server port and health require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for active http preview server port and health with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0247] Interactive status bar click/hover trigger for staleness index percentage
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with staleness index percentage require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for staleness index percentage with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0248] Interactive status bar click/hover trigger for grounded vs ungrounded claim ratio
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with grounded vs ungrounded claim ratio require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for grounded vs ungrounded claim ratio with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0249] Interactive status bar click/hover trigger for active worktree task branch name
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with active worktree task branch name require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for active worktree task branch name with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0250] Interactive status bar click/hover trigger for AST symbol index cache hit rate
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with AST symbol index cache hit rate require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for ast symbol index cache hit rate with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0251] Interactive status bar click/hover trigger for system memory RSS overhead
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with system memory RSS overhead require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for system memory rss overhead with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0252] Interactive status bar click/hover trigger for model request round-trip latency (ms)
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with model request round-trip latency (ms) require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for model request round-trip latency (ms) with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0253] Interactive status bar click/hover trigger for detected test framework name and version
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with detected test framework name and version require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for detected test framework name and version with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0254] Interactive status bar click/hover trigger for active git hooks execution state
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with active git hooks execution state require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for active git hooks execution state with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0255] Interactive status bar click/hover trigger for number of discovered agent skills
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with number of discovered agent skills require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for number of discovered agent skills with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0256] Interactive status bar click/hover trigger for number of generated wiki chapters
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with number of generated wiki chapters require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for number of generated wiki chapters with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0257] Interactive status bar click/hover trigger for number of indexed knowledge cards
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with number of indexed knowledge cards require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for number of indexed knowledge cards with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0258] Interactive status bar click/hover trigger for secret scanner risk alert counter
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with secret scanner risk alert counter require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for secret scanner risk alert counter with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0259] Interactive status bar click/hover trigger for web research quota and rate limits
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with web research quota and rate limits require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for web research quota and rate limits with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0260] Interactive status bar click/hover trigger for live SSE connected client count
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with live SSE connected client count require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive status bar click/hover trigger for live sse connected client count with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0261] Persistent background progress indicator tracking active model context window utilization
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with active model context window utilization require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking active model context window utilization with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0262] Persistent background progress indicator tracking real-time token spend velocity (tokens/sec)
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with real-time token spend velocity (tokens/sec) require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking real-time token spend velocity (tokens/sec) with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0263] Persistent background progress indicator tracking repository file count freshness ratio
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with repository file count freshness ratio require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking repository file count freshness ratio with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0264] Persistent background progress indicator tracking unverified git working tree dirty status
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with unverified git working tree dirty status require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking unverified git working tree dirty status with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0265] Persistent background progress indicator tracking in-flight background task count
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with in-flight background task count require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking in-flight background task count with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0266] Persistent background progress indicator tracking active HTTP preview server port and health
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with active HTTP preview server port and health require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking active http preview server port and health with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0267] Persistent background progress indicator tracking staleness index percentage
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with staleness index percentage require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking staleness index percentage with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0268] Persistent background progress indicator tracking grounded vs ungrounded claim ratio
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with grounded vs ungrounded claim ratio require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking grounded vs ungrounded claim ratio with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0269] Persistent background progress indicator tracking active worktree task branch name
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with active worktree task branch name require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking active worktree task branch name with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0270] Persistent background progress indicator tracking AST symbol index cache hit rate
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with AST symbol index cache hit rate require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking ast symbol index cache hit rate with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0271] Persistent background progress indicator tracking system memory RSS overhead
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with system memory RSS overhead require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking system memory rss overhead with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0272] Persistent background progress indicator tracking model request round-trip latency (ms)
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with model request round-trip latency (ms) require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking model request round-trip latency (ms) with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0273] Persistent background progress indicator tracking detected test framework name and version
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with detected test framework name and version require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking detected test framework name and version with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0274] Persistent background progress indicator tracking active git hooks execution state
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with active git hooks execution state require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking active git hooks execution state with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0275] Persistent background progress indicator tracking number of discovered agent skills
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with number of discovered agent skills require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking number of discovered agent skills with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0276] Persistent background progress indicator tracking number of generated wiki chapters
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with number of generated wiki chapters require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking number of generated wiki chapters with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0277] Persistent background progress indicator tracking number of indexed knowledge cards
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with number of indexed knowledge cards require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking number of indexed knowledge cards with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0278] Persistent background progress indicator tracking secret scanner risk alert counter
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with secret scanner risk alert counter require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking secret scanner risk alert counter with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0279] Persistent background progress indicator tracking web research quota and rate limits
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with web research quota and rate limits require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking web research quota and rate limits with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0280] Persistent background progress indicator tracking live SSE connected client count
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with live SSE connected client count require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement persistent background progress indicator tracking live sse connected client count with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0281] Color-shifting warning badge indicating critical threshold in active model context window utilization
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with active model context window utilization require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in active model context window utilization with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0282] Color-shifting warning badge indicating critical threshold in real-time token spend velocity (tokens/sec)
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with real-time token spend velocity (tokens/sec) require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in real-time token spend velocity (tokens/sec) with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0283] Color-shifting warning badge indicating critical threshold in repository file count freshness ratio
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with repository file count freshness ratio require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in repository file count freshness ratio with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0284] Color-shifting warning badge indicating critical threshold in unverified git working tree dirty status
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with unverified git working tree dirty status require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in unverified git working tree dirty status with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0285] Color-shifting warning badge indicating critical threshold in in-flight background task count
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with in-flight background task count require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in in-flight background task count with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0286] Color-shifting warning badge indicating critical threshold in active HTTP preview server port and health
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with active HTTP preview server port and health require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in active http preview server port and health with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0287] Color-shifting warning badge indicating critical threshold in staleness index percentage
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with staleness index percentage require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in staleness index percentage with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0288] Color-shifting warning badge indicating critical threshold in grounded vs ungrounded claim ratio
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with grounded vs ungrounded claim ratio require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in grounded vs ungrounded claim ratio with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0289] Color-shifting warning badge indicating critical threshold in active worktree task branch name
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with active worktree task branch name require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in active worktree task branch name with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0290] Color-shifting warning badge indicating critical threshold in AST symbol index cache hit rate
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with AST symbol index cache hit rate require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in ast symbol index cache hit rate with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0291] Color-shifting warning badge indicating critical threshold in system memory RSS overhead
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with system memory RSS overhead require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in system memory rss overhead with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0292] Color-shifting warning badge indicating critical threshold in model request round-trip latency (ms)
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with model request round-trip latency (ms) require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in model request round-trip latency (ms) with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0293] Color-shifting warning badge indicating critical threshold in detected test framework name and version
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with detected test framework name and version require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in detected test framework name and version with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0294] Color-shifting warning badge indicating critical threshold in active git hooks execution state
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with active git hooks execution state require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in active git hooks execution state with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0295] Color-shifting warning badge indicating critical threshold in number of discovered agent skills
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with number of discovered agent skills require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in number of discovered agent skills with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0296] Color-shifting warning badge indicating critical threshold in number of generated wiki chapters
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with number of generated wiki chapters require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in number of generated wiki chapters with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0297] Color-shifting warning badge indicating critical threshold in number of indexed knowledge cards
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with number of indexed knowledge cards require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in number of indexed knowledge cards with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0298] Color-shifting warning badge indicating critical threshold in secret scanner risk alert counter
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with secret scanner risk alert counter require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in secret scanner risk alert counter with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0299] Color-shifting warning badge indicating critical threshold in web research quota and rate limits
- **Subsystem**: `.pi/extensions/kaioken/ui/header.ts` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with web research quota and rate limits require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in web research quota and rate limits with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0300] Color-shifting warning badge indicating critical threshold in live SSE connected client count
- **Subsystem**: `.pi/extensions/kaioken/commands` | **Category**: HUD, Status Bar & Dynamic Widgets | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with live SSE connected client count require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement color-shifting warning badge indicating critical threshold in live sse connected client count with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

---
