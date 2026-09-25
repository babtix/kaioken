# Category 7: AST Symbol Indexing & Code Oracle

> **Range**: `#UX-0601` to `#UX-0700` (100 Features)    
> **Subsystems**: `kaioken/index`    
> **Focus Area**: Tree-sitter WASM grammars, symbol extraction, re-export resolution, and cross-file references.  

---

## Global Implementation Plan: Category 7

### 1. Strategic Objective
Deliver comprehensive AST symbol indexing across 10+ programming languages with Tree-sitter WASM grammars, cross-file references, and fuzzy lookups.

### 2. Execution Phases & Milestones

| Phase | Milestone Scope | Core Focus & Deliverables | Feature Slice |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Immediate Friction Elimination** | Set up Tree-sitter WASM parser pools with memory recycling and regex fallback extractors (Features UX-0601 to UX-0630). | `#UX-0601` – `#UX-0630` |
| **Phase 2** | **Architectural Deepening** | Implement multi-hop re-export chain traversal, scope-aware anchor resolution, and partial symbol fuzzy matching (Features UX-0631 to UX-0670). | `#UX-0631` – `#UX-0670` |
| **Phase 3** | **Hardening & Intelligence** | Deploy incremental AST delta indexing for modified files, symbol definition preview cards, and structural linker graphs (Features UX-0671 to UX-0700). | `#UX-0671` – `#UX-0700` |

### 3. Core Architectural Invariants & Guarantees
- **Invariant 1 (Public Pi Extension Seams)**: Zero core forks or monkey-patching of `@mario/pi`; clean extension lifecycle hooks.
- **Invariant 10 (100% Offline-Testable)**: Zero hard network dependencies; all mocks, parsers, and UI components must be fully verifiable offline.
- **Defensive Error Boundaries**: Every user interaction, render cycle, and file parser must fail soft without crashing the TUI or host process.

### 4. Verification & Testing Checklist
- [x] Run domain unit test suite: `npx vitest run kaioken/index/test`
- [x] Verify zero-allocation memory pooling and no event listener leaks
- [x] Test graceful fallback on dumb terminals (`TERM=dumb`) or non-TTY outputs
- [x] Validate edge-case inputs (empty strings, huge context files, circular links)
- [x] Verify integration with fake Pi test harness (`test/fake-pi.ts`)

---

## Detailed Features Catalog (#UX-0601 – #UX-0700)

### [UX-0601] WASM parser pool recycling reducing memory churn during TypeScript / TSX class and interface declarations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with TypeScript / TSX class and interface declarations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement wasm parser pool recycling reducing memory churn during typescript / tsx class and interface declarations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0602] WASM parser pool recycling reducing memory churn during JavaScript / JSX function and constant exports
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with JavaScript / JSX function and constant exports require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement wasm parser pool recycling reducing memory churn during javascript / jsx function and constant exports with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0603] WASM parser pool recycling reducing memory churn during Python classes, methods, and decorated functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with Python classes, methods, and decorated functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement wasm parser pool recycling reducing memory churn during python classes, methods, and decorated functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0604] WASM parser pool recycling reducing memory churn during Go struct, interface, and package functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Go struct, interface, and package functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement wasm parser pool recycling reducing memory churn during go struct, interface, and package functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0605] WASM parser pool recycling reducing memory churn during Rust structs, traits, enums, and impl blocks
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with Rust structs, traits, enums, and impl blocks require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement wasm parser pool recycling reducing memory churn during rust structs, traits, enums, and impl blocks with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0606] WASM parser pool recycling reducing memory churn during Java classes, records, and spring annotations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with Java classes, records, and spring annotations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement wasm parser pool recycling reducing memory churn during java classes, records, and spring annotations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0607] WASM parser pool recycling reducing memory churn during C/C++ structs, namespaces, and template functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with C/C++ structs, namespaces, and template functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement wasm parser pool recycling reducing memory churn during c/c++ structs, namespaces, and template functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0608] WASM parser pool recycling reducing memory churn during C# classes, interfaces, and record types
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with C# classes, interfaces, and record types require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement wasm parser pool recycling reducing memory churn during c# classes, interfaces, and record types with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0609] WASM parser pool recycling reducing memory churn during Ruby module definitions and method symbols
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Ruby module definitions and method symbols require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement wasm parser pool recycling reducing memory churn during ruby module definitions and method symbols with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0610] WASM parser pool recycling reducing memory churn during SQL schema tables, procedures, and view definitions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with SQL schema tables, procedures, and view definitions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement wasm parser pool recycling reducing memory churn during sql schema tables, procedures, and view definitions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0611] Multi-hop re-export chain traversal engine resolving TypeScript / TSX class and interface declarations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with TypeScript / TSX class and interface declarations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-hop re-export chain traversal engine resolving typescript / tsx class and interface declarations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0612] Multi-hop re-export chain traversal engine resolving JavaScript / JSX function and constant exports
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with JavaScript / JSX function and constant exports require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-hop re-export chain traversal engine resolving javascript / jsx function and constant exports with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0613] Multi-hop re-export chain traversal engine resolving Python classes, methods, and decorated functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with Python classes, methods, and decorated functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-hop re-export chain traversal engine resolving python classes, methods, and decorated functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0614] Multi-hop re-export chain traversal engine resolving Go struct, interface, and package functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Go struct, interface, and package functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-hop re-export chain traversal engine resolving go struct, interface, and package functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0615] Multi-hop re-export chain traversal engine resolving Rust structs, traits, enums, and impl blocks
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with Rust structs, traits, enums, and impl blocks require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-hop re-export chain traversal engine resolving rust structs, traits, enums, and impl blocks with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0616] Multi-hop re-export chain traversal engine resolving Java classes, records, and spring annotations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with Java classes, records, and spring annotations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-hop re-export chain traversal engine resolving java classes, records, and spring annotations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0617] Multi-hop re-export chain traversal engine resolving C/C++ structs, namespaces, and template functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with C/C++ structs, namespaces, and template functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-hop re-export chain traversal engine resolving c/c++ structs, namespaces, and template functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0618] Multi-hop re-export chain traversal engine resolving C# classes, interfaces, and record types
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with C# classes, interfaces, and record types require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-hop re-export chain traversal engine resolving c# classes, interfaces, and record types with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0619] Multi-hop re-export chain traversal engine resolving Ruby module definitions and method symbols
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Ruby module definitions and method symbols require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-hop re-export chain traversal engine resolving ruby module definitions and method symbols with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0620] Multi-hop re-export chain traversal engine resolving SQL schema tables, procedures, and view definitions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with SQL schema tables, procedures, and view definitions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement multi-hop re-export chain traversal engine resolving sql schema tables, procedures, and view definitions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0621] Fuzzy symbol lookup query engine matching partial TypeScript / TSX class and interface declarations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with TypeScript / TSX class and interface declarations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy symbol lookup query engine matching partial typescript / tsx class and interface declarations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0622] Fuzzy symbol lookup query engine matching partial JavaScript / JSX function and constant exports
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with JavaScript / JSX function and constant exports require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy symbol lookup query engine matching partial javascript / jsx function and constant exports with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0623] Fuzzy symbol lookup query engine matching partial Python classes, methods, and decorated functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with Python classes, methods, and decorated functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy symbol lookup query engine matching partial python classes, methods, and decorated functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0624] Fuzzy symbol lookup query engine matching partial Go struct, interface, and package functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Go struct, interface, and package functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy symbol lookup query engine matching partial go struct, interface, and package functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0625] Fuzzy symbol lookup query engine matching partial Rust structs, traits, enums, and impl blocks
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with Rust structs, traits, enums, and impl blocks require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy symbol lookup query engine matching partial rust structs, traits, enums, and impl blocks with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0626] Fuzzy symbol lookup query engine matching partial Java classes, records, and spring annotations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with Java classes, records, and spring annotations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy symbol lookup query engine matching partial java classes, records, and spring annotations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0627] Fuzzy symbol lookup query engine matching partial C/C++ structs, namespaces, and template functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with C/C++ structs, namespaces, and template functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy symbol lookup query engine matching partial c/c++ structs, namespaces, and template functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0628] Fuzzy symbol lookup query engine matching partial C# classes, interfaces, and record types
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with C# classes, interfaces, and record types require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy symbol lookup query engine matching partial c# classes, interfaces, and record types with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0629] Fuzzy symbol lookup query engine matching partial Ruby module definitions and method symbols
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Ruby module definitions and method symbols require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy symbol lookup query engine matching partial ruby module definitions and method symbols with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0630] Fuzzy symbol lookup query engine matching partial SQL schema tables, procedures, and view definitions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with SQL schema tables, procedures, and view definitions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement fuzzy symbol lookup query engine matching partial sql schema tables, procedures, and view definitions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0631] Contextual anchor resolution using AST parent scope boundaries for TypeScript / TSX class and interface declarations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with TypeScript / TSX class and interface declarations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement contextual anchor resolution using ast parent scope boundaries for typescript / tsx class and interface declarations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0632] Contextual anchor resolution using AST parent scope boundaries for JavaScript / JSX function and constant exports
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with JavaScript / JSX function and constant exports require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement contextual anchor resolution using ast parent scope boundaries for javascript / jsx function and constant exports with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0633] Contextual anchor resolution using AST parent scope boundaries for Python classes, methods, and decorated functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with Python classes, methods, and decorated functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement contextual anchor resolution using ast parent scope boundaries for python classes, methods, and decorated functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0634] Contextual anchor resolution using AST parent scope boundaries for Go struct, interface, and package functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Go struct, interface, and package functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement contextual anchor resolution using ast parent scope boundaries for go struct, interface, and package functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0635] Contextual anchor resolution using AST parent scope boundaries for Rust structs, traits, enums, and impl blocks
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with Rust structs, traits, enums, and impl blocks require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement contextual anchor resolution using ast parent scope boundaries for rust structs, traits, enums, and impl blocks with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0636] Contextual anchor resolution using AST parent scope boundaries for Java classes, records, and spring annotations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with Java classes, records, and spring annotations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement contextual anchor resolution using ast parent scope boundaries for java classes, records, and spring annotations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0637] Contextual anchor resolution using AST parent scope boundaries for C/C++ structs, namespaces, and template functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with C/C++ structs, namespaces, and template functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement contextual anchor resolution using ast parent scope boundaries for c/c++ structs, namespaces, and template functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0638] Contextual anchor resolution using AST parent scope boundaries for C# classes, interfaces, and record types
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with C# classes, interfaces, and record types require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement contextual anchor resolution using ast parent scope boundaries for c# classes, interfaces, and record types with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0639] Contextual anchor resolution using AST parent scope boundaries for Ruby module definitions and method symbols
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Ruby module definitions and method symbols require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement contextual anchor resolution using ast parent scope boundaries for ruby module definitions and method symbols with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0640] Contextual anchor resolution using AST parent scope boundaries for SQL schema tables, procedures, and view definitions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with SQL schema tables, procedures, and view definitions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement contextual anchor resolution using ast parent scope boundaries for sql schema tables, procedures, and view definitions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0641] Interactive symbol definition card rendering source snippet of TypeScript / TSX class and interface declarations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with TypeScript / TSX class and interface declarations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive symbol definition card rendering source snippet of typescript / tsx class and interface declarations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0642] Interactive symbol definition card rendering source snippet of JavaScript / JSX function and constant exports
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with JavaScript / JSX function and constant exports require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive symbol definition card rendering source snippet of javascript / jsx function and constant exports with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0643] Interactive symbol definition card rendering source snippet of Python classes, methods, and decorated functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with Python classes, methods, and decorated functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive symbol definition card rendering source snippet of python classes, methods, and decorated functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0644] Interactive symbol definition card rendering source snippet of Go struct, interface, and package functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Go struct, interface, and package functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive symbol definition card rendering source snippet of go struct, interface, and package functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0645] Interactive symbol definition card rendering source snippet of Rust structs, traits, enums, and impl blocks
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with Rust structs, traits, enums, and impl blocks require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive symbol definition card rendering source snippet of rust structs, traits, enums, and impl blocks with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0646] Interactive symbol definition card rendering source snippet of Java classes, records, and spring annotations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with Java classes, records, and spring annotations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive symbol definition card rendering source snippet of java classes, records, and spring annotations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0647] Interactive symbol definition card rendering source snippet of C/C++ structs, namespaces, and template functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with C/C++ structs, namespaces, and template functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive symbol definition card rendering source snippet of c/c++ structs, namespaces, and template functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0648] Interactive symbol definition card rendering source snippet of C# classes, interfaces, and record types
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with C# classes, interfaces, and record types require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive symbol definition card rendering source snippet of c# classes, interfaces, and record types with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0649] Interactive symbol definition card rendering source snippet of Ruby module definitions and method symbols
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Ruby module definitions and method symbols require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive symbol definition card rendering source snippet of ruby module definitions and method symbols with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0650] Interactive symbol definition card rendering source snippet of SQL schema tables, procedures, and view definitions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with SQL schema tables, procedures, and view definitions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement interactive symbol definition card rendering source snippet of sql schema tables, procedures, and view definitions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0651] Extensible grammar registry enabling AST parsing for TypeScript / TSX class and interface declarations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with TypeScript / TSX class and interface declarations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement extensible grammar registry enabling ast parsing for typescript / tsx class and interface declarations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0652] Extensible grammar registry enabling AST parsing for JavaScript / JSX function and constant exports
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with JavaScript / JSX function and constant exports require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement extensible grammar registry enabling ast parsing for javascript / jsx function and constant exports with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0653] Extensible grammar registry enabling AST parsing for Python classes, methods, and decorated functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with Python classes, methods, and decorated functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement extensible grammar registry enabling ast parsing for python classes, methods, and decorated functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0654] Extensible grammar registry enabling AST parsing for Go struct, interface, and package functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Go struct, interface, and package functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement extensible grammar registry enabling ast parsing for go struct, interface, and package functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0655] Extensible grammar registry enabling AST parsing for Rust structs, traits, enums, and impl blocks
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with Rust structs, traits, enums, and impl blocks require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement extensible grammar registry enabling ast parsing for rust structs, traits, enums, and impl blocks with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0656] Extensible grammar registry enabling AST parsing for Java classes, records, and spring annotations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with Java classes, records, and spring annotations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement extensible grammar registry enabling ast parsing for java classes, records, and spring annotations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0657] Extensible grammar registry enabling AST parsing for C/C++ structs, namespaces, and template functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with C/C++ structs, namespaces, and template functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement extensible grammar registry enabling ast parsing for c/c++ structs, namespaces, and template functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0658] Extensible grammar registry enabling AST parsing for C# classes, interfaces, and record types
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with C# classes, interfaces, and record types require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement extensible grammar registry enabling ast parsing for c# classes, interfaces, and record types with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0659] Extensible grammar registry enabling AST parsing for Ruby module definitions and method symbols
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Ruby module definitions and method symbols require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement extensible grammar registry enabling ast parsing for ruby module definitions and method symbols with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0660] Extensible grammar registry enabling AST parsing for SQL schema tables, procedures, and view definitions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with SQL schema tables, procedures, and view definitions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement extensible grammar registry enabling ast parsing for sql schema tables, procedures, and view definitions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0661] Regex fallback declaration extractor indexing symbols for TypeScript / TSX class and interface declarations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with TypeScript / TSX class and interface declarations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement regex fallback declaration extractor indexing symbols for typescript / tsx class and interface declarations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0662] Regex fallback declaration extractor indexing symbols for JavaScript / JSX function and constant exports
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with JavaScript / JSX function and constant exports require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement regex fallback declaration extractor indexing symbols for javascript / jsx function and constant exports with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0663] Regex fallback declaration extractor indexing symbols for Python classes, methods, and decorated functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with Python classes, methods, and decorated functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement regex fallback declaration extractor indexing symbols for python classes, methods, and decorated functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0664] Regex fallback declaration extractor indexing symbols for Go struct, interface, and package functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Go struct, interface, and package functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement regex fallback declaration extractor indexing symbols for go struct, interface, and package functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0665] Regex fallback declaration extractor indexing symbols for Rust structs, traits, enums, and impl blocks
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with Rust structs, traits, enums, and impl blocks require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement regex fallback declaration extractor indexing symbols for rust structs, traits, enums, and impl blocks with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0666] Regex fallback declaration extractor indexing symbols for Java classes, records, and spring annotations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with Java classes, records, and spring annotations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement regex fallback declaration extractor indexing symbols for java classes, records, and spring annotations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0667] Regex fallback declaration extractor indexing symbols for C/C++ structs, namespaces, and template functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with C/C++ structs, namespaces, and template functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement regex fallback declaration extractor indexing symbols for c/c++ structs, namespaces, and template functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0668] Regex fallback declaration extractor indexing symbols for C# classes, interfaces, and record types
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with C# classes, interfaces, and record types require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement regex fallback declaration extractor indexing symbols for c# classes, interfaces, and record types with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0669] Regex fallback declaration extractor indexing symbols for Ruby module definitions and method symbols
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Ruby module definitions and method symbols require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement regex fallback declaration extractor indexing symbols for ruby module definitions and method symbols with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0670] Regex fallback declaration extractor indexing symbols for SQL schema tables, procedures, and view definitions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with SQL schema tables, procedures, and view definitions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement regex fallback declaration extractor indexing symbols for sql schema tables, procedures, and view definitions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0671] Exported vs internal visibility filter toggling display of TypeScript / TSX class and interface declarations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with TypeScript / TSX class and interface declarations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement exported vs internal visibility filter toggling display of typescript / tsx class and interface declarations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0672] Exported vs internal visibility filter toggling display of JavaScript / JSX function and constant exports
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with JavaScript / JSX function and constant exports require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement exported vs internal visibility filter toggling display of javascript / jsx function and constant exports with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0673] Exported vs internal visibility filter toggling display of Python classes, methods, and decorated functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with Python classes, methods, and decorated functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement exported vs internal visibility filter toggling display of python classes, methods, and decorated functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0674] Exported vs internal visibility filter toggling display of Go struct, interface, and package functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Go struct, interface, and package functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement exported vs internal visibility filter toggling display of go struct, interface, and package functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0675] Exported vs internal visibility filter toggling display of Rust structs, traits, enums, and impl blocks
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with Rust structs, traits, enums, and impl blocks require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement exported vs internal visibility filter toggling display of rust structs, traits, enums, and impl blocks with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0676] Exported vs internal visibility filter toggling display of Java classes, records, and spring annotations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with Java classes, records, and spring annotations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement exported vs internal visibility filter toggling display of java classes, records, and spring annotations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0677] Exported vs internal visibility filter toggling display of C/C++ structs, namespaces, and template functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with C/C++ structs, namespaces, and template functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement exported vs internal visibility filter toggling display of c/c++ structs, namespaces, and template functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0678] Exported vs internal visibility filter toggling display of C# classes, interfaces, and record types
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with C# classes, interfaces, and record types require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement exported vs internal visibility filter toggling display of c# classes, interfaces, and record types with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0679] Exported vs internal visibility filter toggling display of Ruby module definitions and method symbols
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Ruby module definitions and method symbols require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement exported vs internal visibility filter toggling display of ruby module definitions and method symbols with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0680] Exported vs internal visibility filter toggling display of SQL schema tables, procedures, and view definitions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with SQL schema tables, procedures, and view definitions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement exported vs internal visibility filter toggling display of sql schema tables, procedures, and view definitions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0681] Incremental AST delta indexing updating only changed files for TypeScript / TSX class and interface declarations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with TypeScript / TSX class and interface declarations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement incremental ast delta indexing updating only changed files for typescript / tsx class and interface declarations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0682] Incremental AST delta indexing updating only changed files for JavaScript / JSX function and constant exports
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with JavaScript / JSX function and constant exports require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement incremental ast delta indexing updating only changed files for javascript / jsx function and constant exports with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0683] Incremental AST delta indexing updating only changed files for Python classes, methods, and decorated functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with Python classes, methods, and decorated functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement incremental ast delta indexing updating only changed files for python classes, methods, and decorated functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0684] Incremental AST delta indexing updating only changed files for Go struct, interface, and package functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Go struct, interface, and package functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement incremental ast delta indexing updating only changed files for go struct, interface, and package functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0685] Incremental AST delta indexing updating only changed files for Rust structs, traits, enums, and impl blocks
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with Rust structs, traits, enums, and impl blocks require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement incremental ast delta indexing updating only changed files for rust structs, traits, enums, and impl blocks with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0686] Incremental AST delta indexing updating only changed files for Java classes, records, and spring annotations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with Java classes, records, and spring annotations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement incremental ast delta indexing updating only changed files for java classes, records, and spring annotations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0687] Incremental AST delta indexing updating only changed files for C/C++ structs, namespaces, and template functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with C/C++ structs, namespaces, and template functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement incremental ast delta indexing updating only changed files for c/c++ structs, namespaces, and template functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0688] Incremental AST delta indexing updating only changed files for C# classes, interfaces, and record types
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with C# classes, interfaces, and record types require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement incremental ast delta indexing updating only changed files for c# classes, interfaces, and record types with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0689] Incremental AST delta indexing updating only changed files for Ruby module definitions and method symbols
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Ruby module definitions and method symbols require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement incremental ast delta indexing updating only changed files for ruby module definitions and method symbols with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0690] Incremental AST delta indexing updating only changed files for SQL schema tables, procedures, and view definitions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with SQL schema tables, procedures, and view definitions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement incremental ast delta indexing updating only changed files for sql schema tables, procedures, and view definitions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0691] Structural symbol dependency graph linker connecting TypeScript / TSX class and interface declarations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with TypeScript / TSX class and interface declarations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement structural symbol dependency graph linker connecting typescript / tsx class and interface declarations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0692] Structural symbol dependency graph linker connecting JavaScript / JSX function and constant exports
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with JavaScript / JSX function and constant exports require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement structural symbol dependency graph linker connecting javascript / jsx function and constant exports with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0693] Structural symbol dependency graph linker connecting Python classes, methods, and decorated functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with Python classes, methods, and decorated functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement structural symbol dependency graph linker connecting python classes, methods, and decorated functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0694] Structural symbol dependency graph linker connecting Go struct, interface, and package functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Go struct, interface, and package functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement structural symbol dependency graph linker connecting go struct, interface, and package functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0695] Structural symbol dependency graph linker connecting Rust structs, traits, enums, and impl blocks
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with Rust structs, traits, enums, and impl blocks require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement structural symbol dependency graph linker connecting rust structs, traits, enums, and impl blocks with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0696] Structural symbol dependency graph linker connecting Java classes, records, and spring annotations
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Visual Polish & Aesthetics
- **User Experience Need**: Users interacting with Java classes, records, and spring annotations require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement structural symbol dependency graph linker connecting java classes, records, and spring annotations with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0697] Structural symbol dependency graph linker connecting C/C++ structs, namespaces, and template functions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Real-Time Terminal Streaming
- **User Experience Need**: Users interacting with C/C++ structs, namespaces, and template functions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement structural symbol dependency graph linker connecting c/c++ structs, namespaces, and template functions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0698] Structural symbol dependency graph linker connecting C# classes, interfaces, and record types
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Performance & Low-Latency
- **User Experience Need**: Users interacting with C# classes, interfaces, and record types require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement structural symbol dependency graph linker connecting c# classes, interfaces, and record types with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0699] Structural symbol dependency graph linker connecting Ruby module definitions and method symbols
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Resilience & Fail-Soft Recovery
- **User Experience Need**: Users interacting with Ruby module definitions and method symbols require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement structural symbol dependency graph linker connecting ruby module definitions and method symbols with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

### [UX-0700] Structural symbol dependency graph linker connecting SQL schema tables, procedures, and view definitions
- **Subsystem**: `kaioken/index` | **Category**: AST Symbol Indexing & Code Oracle | **Tier**: Developer Ergonomics
- **User Experience Need**: Users interacting with SQL schema tables, procedures, and view definitions require immediate visual feedback, zero perceptual lag, clear status indicators, and resilient behavior under edge cases.
- **Technical Implementation**: Implement structural symbol dependency graph linker connecting sql schema tables, procedures, and view definitions with defensive error boundaries, theme-aware terminal styling via `@earendil-works/pi-tui`, zero-allocation memory pooling, and comprehensive Vitest unit test coverage.
- **Quality Guarantee**: Complies strictly with Invariant 1 (public Pi seams only) and Invariant 10 (100% offline-testable with no external network dependency).

---
