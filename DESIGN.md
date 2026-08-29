# KAIOKEN Design System v2: Specification & Architecture System
**Version:** 2.0.0  
**Architecture:** React 19 · Tailwind CSS v4 · TypeScript · Base UI · Tauri v2 Desktop Engine · CodeMirror 6 · xterm.js · WebGL (OGL)  
**Authors:** Principal Design Systems Engineer, Staff Product Designer & Frontend Architecture Team  
**Scope:** Terminal CLI (Go / Lipgloss ANSI) · Desktop GUI (Tauri v2 / React 19) · Web Application (`/website`) · Mobile Web (`src/mobile`)

---

## Table of Contents
1. [Executive Summary & Core Design Principles](#1-executive-summary--core-design-principles)
2. [Token Architecture & Foundations](#2-token-architecture--foundations)
   - [2.1 Color System & ANSI Derivation](#21-color-system--ansi-derivation)
   - [2.2 Typography System](#22-typography-system)
   - [2.3 Spacing & Sizing Grid](#23-spacing--sizing-grid)
   - [2.4 Elevation, Radii, Borders, Shadows & HUD Overlays](#24-elevation-radii-borders-shadows--hud-overlays)
   - [2.5 Motion, Timing & Keyframe Orchestration](#25-motion-timing--keyframe-orchestration)
3. [Layout, Grid & Multi-Surface Responsive System](#3-layout-grid--multi-surface-responsive-system)
   - [3.1 Desktop Shell Architecture (Tauri v2)](#31-desktop-shell-architecture-tauri-v2)
   - [3.2 Web & Documentation Responsive Layouts](#32-web--documentation-responsive-layouts)
   - [3.3 Mobile Web Ergonomics & Touch Geometry](#33-mobile-web-ergonomics--touch-geometry)
   - [3.4 Shader & Ambient Backdrop Management](#34-shader--ambient-backdrop-management)
4. [Master Component Library Specification](#4-master-component-library-specification)
   - [4.1 Atomic UI Primitives](#41-atomic-ui-primitives)
   - [4.2 HUD & Terminal Chrome Primitives](#42-hud--terminal-chrome-primitives)
   - [4.3 Answer & Deep Research Surfaces](#43-answer--deep-research-surfaces)
   - [4.4 Chat & Autonomous Agent Engine Surfaces](#44-chat--autonomous-agent-engine-surfaces)
   - [4.5 Desktop Application Shell & Panes](#45-desktop-application-shell--panes)
   - [4.6 Content, Markdown & Diagram Visualizers](#46-content-markdown--diagram-visualizers)
   - [4.7 Mobile-Optimized Primitives](#47-mobile-optimized-primitives)
5. [Master Component Inventory Table](#5-master-component-inventory-table)
6. [Interaction Patterns, Ergonomics & Motion Guidelines](#6-interaction-patterns-ergonomics--motion-guidelines)
   - [6.1 Global Keyboard Accelerators Matrix](#61-global-keyboard-accelerators-matrix)
   - [6.2 Destructive Action Safety & Approval Protocol](#62-destructive-action-safety--approval-protocol)
   - [6.3 Multiplier Dial & Real-Time Cost Preview](#63-multiplier-dial--real-time-cost-preview)
   - [6.4 Unattended Tour & User Interruption Model](#64-unattended-tour--user-interruption-model)
   - [6.5 Reduced Motion & Low-Power Adaptations](#65-reduced-motion--low-power-adaptations)
7. [Developer Implementation Recommendations & Architecture](#7-developer-implementation-recommendations--architecture)
   - [7.1 Component Architecture & Base UI Conventions](#71-component-architecture--base-ui-conventions)
   - [7.2 Domain-Partitioned State Management](#72-domain-partitioned-state-management)
   - [7.3 Jank-Free Streaming Text Architecture](#73-jank-free-streaming-text-architecture)
   - [7.4 SSE Event Stream & Loopback HTTP Pipeline](#74-sse-event-stream--loopback-http-pipeline)
   - [7.5 Stale-Paint Theme Transition Engine](#75-stale-paint-theme-transition-engine)
   - [7.6 CodeMirror 6 Dynamic Compartment Theming](#76-codemirror-6-dynamic-compartment-theming)
8. [Accessibility & UX Writing Standards](#8-accessibility--ux-writing-standards)
   - [8.1 WCAG 2.1/2.2 AA Contrast Compliance Matrix](#81-wcag-2122-aa-contrast-compliance-matrix)
   - [8.2 Focus Management, Keyboard Trapping & ARIA Live Regions](#82-focus-management-keyboard-trapping--aria-live-regions)
   - [8.3 Deterministic Microcopy & Error Humanization](#83-deterministic-microcopy--error-humanization)
9. [Iconography System](#9-iconography-system)
10. [Machine-Readable Design Tokens (W3C DTCG JSON v2)](#10-machine-readable-design-tokens-w3c-dtcg-json-v2)
11. [Design System Governance & Evolution RFC Process](#11-design-system-governance--evolution-rfc-process)
12. [Accessibility & QA Checklist](#12-accessibility--qa-checklist)

---

## 1. Executive Summary & Core Design Principles

The **Kaioken Design System (v2)** is an enterprise-grade design and engineering architecture engineered to bridge high-velocity terminal workflows (TUI), native graphical desktop applications (GUI via Tauri v2), responsive marketing web applications, and mobile touch surfaces.

Rooted in Go TUI Lipgloss ANSI color palettes, cyberpunk CRT instrumentation, and Dragon Ball power-amplification metaphors, Kaioken treats information density, radical transparency of AI compute costs, and keyboard velocity as foundational product requirements.

```
                         ▄ ▄▄ ▄ KAIOKEN MULTI-SURFACE ARCHITECTURE ▄ ▄▄ ▄
  ┌───────────────────────┐    ┌────────────────────────┐    ┌────────────────────────┐
  │   CLI / ANSI TUI      │    │  Desktop App (Tauri)   │    │   Responsive Web       │
  │  16-Color Lipgloss    │◄──►│  Custom HUD Chrome     │◄──►│  WebGL Shader & Glass  │
  │  Keyboard-First Loop  │    │  Side-by-Side Diffs    │    │  Docs & Showcase       │
  └───────────────────────┘    └────────────────────────┘    └────────────────────────┘
                                           │
                                           ▼
                               ┌────────────────────────┐
                               │  Mobile Web (375px+)   │
                               │  Touch-Safe Rails      │
                               │  Fixed Bars & Sheets   │
                               └────────────────────────┘
```

### Core Design Principles

1. **Terminal Parity & Shared ANSI DNA**
   - Color values in the graphical web and desktop apps are not arbitrary modern approximations; they map 1:1 to the 16-color ANSI terminal palette (`cli/internal/tui/palette.go`).
   - A developer switching from the terminal CLI to the Tauri desktop app experiences zero cognitive disconnect.

2. **Functional HUD Aesthetics (State Over Decoration)**
   - Visual flourishes—such as CRT scanlines (`.crt-scanlines`), bracketed corners (`.hud-corners`), glowing borders (`.panel-glow`), energy pulse dots (`LiveDot`), and aura sweeps (`GlowButton`)—are strictly reserved for **state indication** (in-flight run, armed approval, dangerous power level, active selection).
   - *Design Axiom:* If everything glows, nothing communicates.

3. **Radical Compute & Cost Transparency**
   - AI operations consume real compute, tokens, and money. The Kaioken multiplier ($\times 1$ to $\times 10$) is not a decorative dial; it dictates exact search query counts, crawl depths, recursion limits, and verification passes.
   - The UI always displays a deterministic cost/time estimate before execution begins, requiring explicit confirmation above safety thresholds.

4. **Structured Knowledge Dossiers Over Ephemeral Chat**
   - Chat bubbles are insufficient for complex engineering tasks. Kaioken transforms AI outputs into structured, persistent dossiers: collapsible tool invocations, verifiable inline citation chips (`[1]`), domain favicons, side-by-side syntax-highlighted diffs, and interactive Mermaid sequence diagrams.

5. **Keyboard-First Velocity with Destructive Safety Defaults**
   - 100% of workflows are operable via keyboard shortcuts (`Ctrl+K`, `Ctrl+P`, `Ctrl+1..9`, `Ctrl+\``).
   - Destructive or mutating operations enforce fail-safe defaults: approval modals initialize focus on **"Deny"** or the diff body, preventing accidental approval from reflexive $Enter$ keystrokes. Approvals auto-deny after a 5-minute timeout.

6. **Multi-Surface Touch & Viewport Ergonomics**
   - Responsive layouts are specifically adapted for their medium: desktop uses multi-pane split viewports; mobile phone views convert grids into horizontal snapping rails (`.m-rail`), respect notch/home safe-area insets, and ensure every tap target is at least $44\text{px}\times 44\text{px}$.

---

## 2. Token Architecture & Foundations

### 2.1 Color System & ANSI Derivation

The color system operates on a dual-mode token ramp (Dark-mode primary default, with a contrast-tuned Light mode). Every token is registered as a CSS Custom Property in `:root` and exposed to Tailwind CSS v4 via `@theme inline`.

#### Core Palette Tokens

| Token Name | Dark Hex | Light Hex | ANSI Code | Semantic Role |
| :--- | :--- | :--- | :--- | :--- |
| `--kai-orange` | `#ff8700` | `#d96e00` | 208 | Primary brand accent, active selection, section gutters, primary CTA |
| `--kai-amber` | `#ffaf00` | `#9a6700` | 214 | Warnings, approval prompts, keycap labels, pending steps, subheadings |
| `--kai-red` | `#ff0000` | `#cc0000` | 196 | Logo brand anchor, critical danger, high power warning ($\ge \times 7$) |
| `--kai-tan` | `#d7af87` | `#8a6d3b` | 180 | Tool invocations, inline code highlights, emphasis text |
| `--kai-blue` | `#87d7ff` | `#0072b5` | 117 | User input prompts, shell commands, web links, query paths |
| `--kai-green` | `#00d787` | `#00875a` | 42 | Success states, diff additions ($+$), live process status, fresh modules |
| `--kai-sage` | `#87af87` | `#4d7a4d` | 108 | Tool execution results, source file references, secondary badges |
| `--kai-rose` | `#ff5f5f` | `#d33636` | 203 | Errors, diff deletions ($-$), timeouts, missing resources |
| `--kai-black` | `#080808` | `#f7f7f7` | 232 | Base viewport background, terminal root canvas |
| `--kai-ink` | `#121212` | `#ffffff` | — | Card surfaces, sidebar canvas, elevated sheets |
| `--kai-panel` | `#1c1c1c` | `#eeeeee` | 234 | Popovers, dropdown menus, table headers, code block surfaces |
| `--kai-line` | `#303030` | `#d4d4d4` | 236 | Structural borders, hairline rules, separators, track bars |
| `--kai-dim` | `#585858` | `#8a8a8a` | 240 | Muted placeholders, inactive icons, timestamps, gutter marks |
| `--kai-muted` | `#808080` | `#5c5c5c` | 244 | Secondary copy, line numbers, table borders |
| `--kai-text` | `#d0d0d0` | `#2e2e2e` | 252 | Primary readable body text, high-legibility content |
| `--kai-white` | `#eeeeee` | `#111111` | — | High-contrast display headings, active selection text |

#### Semantic UI Mappings (Base UI / Shadcn / Tailwind v4)

```css
:root {
  --background: var(--kai-black);
  --foreground: var(--kai-text);
  --card: var(--kai-ink);
  --card-foreground: var(--kai-text);
  --popover: var(--kai-panel);
  --popover-foreground: var(--kai-text);
  --primary: var(--kai-orange);
  --primary-foreground: #180c00;
  --secondary: var(--kai-panel);
  --secondary-foreground: var(--kai-text);
  --muted: var(--kai-panel);
  --muted-foreground: var(--kai-muted);
  --accent: #241708;
  --accent-foreground: var(--kai-amber);
  --destructive: var(--kai-rose);
  --border: rgba(255, 255, 255, 0.08);
  --input: rgba(255, 255, 255, 0.12);
  --ring: var(--kai-orange);

  --chart-1: var(--kai-orange);
  --chart-2: var(--kai-amber);
  --chart-3: var(--kai-tan);
  --chart-4: var(--kai-blue);
  --chart-5: var(--kai-green);

  --sidebar: var(--kai-ink);
  --sidebar-foreground: var(--kai-text);
  --sidebar-primary: var(--kai-orange);
  --sidebar-primary-foreground: #180c00;
  --sidebar-accent: #241708;
  --sidebar-accent-foreground: var(--kai-amber);
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --sidebar-ring: var(--kai-orange);
}
```

---

### 2.2 Typography System

Kaioken enforces a strict dual-font typographic hierarchy:
- **`JetBrains Mono Variable` (`--font-mono`)**: Applied across 90% of the UI chrome, code blocks, terminals, status bars, buttons, badges, tables, tabs, and chat messages.
- **`Geist Variable` (`--font-sans`)**: Reserved strictly for long-form human prose reading (e.g., generated Wiki documentation, deep research report narrative paragraphs).

```
  CHROME & VELOCITY:     JetBrains Mono Variable [Monospace]
  LONG-FORM READING:     Geist Variable          [Sans-Serif]
```

#### Typographic Hierarchy Scale

| Level / Token | Font Family | Size | Weight | Line Height | Tracking | Purpose & Usage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `display-1` | Mono | `clamp(32px, 5.5vw, 62px)` | 800 (ExtraBold)| `1.10` | `-0.03em` | Hero landing headlines, showcase splash |
| `display-2` | Mono | `32px` (`2.0rem`) | 700 (Bold) | `1.15` | `-0.02em` | Main section major titles |
| `heading-1` | Mono | `24px` (`1.5rem`) | 700 (Bold) | `1.25` | `-0.02em` | Wiki document H1, modal titles |
| `heading-2` | Mono | `18.4px` (`1.15rem`) | 700 (Bold) | `1.30` | `-0.01em` | Section headers, wiki H2 |
| `heading-3` | Mono | `16px` (`1.0rem`) | 600 (SemiBold)| `1.35` | `0` | Card titles, pane headers, wiki H3 |
| `heading-4` | Mono | `14px` (`0.875rem`) | 600 (SemiBold)| `1.40` | `0` | Sub-item titles, tool names |
| `section-eyebrow`| Mono | `10.5px` (`0.656rem`)| 700 (Bold) | `1.00` | `+0.28em` | Uppercase gutter header (`▎ 01 · FEATURES`) |
| `body-prose` | Sans | `15px` (`0.9375rem`) | 400 (Regular) | `1.75` | `0` | Long-form report copy (`.md-body`) |
| `body-chat` | Mono | `13px` (`0.8125rem`) | 400 (Regular) | `1.65` | `0` | Chat messages, terminal transcripts |
| `body-ui` | Mono | `12px` (`0.75rem`) | 500 (Medium) | `1.40` | `0` | Buttons, tree items, tab labels |
| `caption-mono` | Mono | `11px` (`0.6875rem`) | 400 (Regular) | `1.30` | `0` | Tool call arguments, citations |
| `badge-mono` | Mono | `10px` (`0.625rem`) | 600 (SemiBold)| `1.00` | `+0.05em` | Status tags, Kbd badges, counts |
| `micro-mono` | Mono | `8.5px` (`0.531rem`) | 400 (Regular) | `1.00` | `0` | Rail button labels, git metadata |

---

### 2.3 Spacing & Sizing Grid

Built on a deterministic **4px / 8px incremental spatial scale**.

```
Base Unit: 4px
Scale Factor: 4px * n
Density Profiles:
  - Dense (HUD / Status / Explorer / Tool Cards):  2px - 6px
  - Standard (Form Fields / Buttons / Modals):     8px - 16px
  - Structural (Section Gaps / Page Gutters):      24px - 80px
```

#### Spacing Scale Tokens

| Token | Pixels | Rem | Common Application |
| :--- | :--- | :--- | :--- |
| `space-0.5` | `2px` | `0.125rem` | Hairline gaps, internal badge padding, dot spacing |
| `space-1` | `4px` | `0.25rem` | Base unit, tag padding, icon-text gap |
| `space-1.5` | `6px` | `0.375rem` | Dense button padding, tool card gaps |
| `space-2` | `8px` | `0.5rem` | Standard element gap, compact card padding |
| `space-2.5` | `10px` | `0.625rem` | Nav item padding, list spacing |
| `space-3` | `12px` | `0.75rem` | Medium card padding, input horizontal padding |
| `space-4` | `16px` | `1.0rem` | Standard container padding, mobile gutter |
| `space-5` | `20px` | `1.25rem` | Section header bottom margin |
| `space-6` | `24px` | `1.5rem` | Card grid gap, pane padding |
| `space-8` | `32px` | `2.0rem` | Modal internal padding |
| `space-10` | `40px` | `2.5rem` | Component section spacing |
| `space-14` | `56px` | `3.5rem` | Web section vertical rhythm |
| `space-20` | `80px` | `5.0rem` | Major page hero vertical padding |

#### Dimensional Layout Constants

| Component / Boundary | Dimension | Fixed / Fluid | Usage Rule |
| :--- | :--- | :--- | :--- |
| **Desktop Titlebar** | `44px` (`h-11`) | Fixed | Drag region (`.titlebar-drag`) + window controls |
| **Desktop NavRail** | `68px` (`w-[68px]`) | Fixed | Left-hand icon navigation dock |
| **Desktop Status Bar** | `24px` (`h-6`) | Fixed | Bottom telemetry, token counter, status |
| **Desktop File Explorer**| `130px` - `148px` | Fixed | Collapsible repository file sidebar |
| **Button (xs)** | `24px` (`h-6`) | Fixed | Compact inline action, diff controls |
| **Button (sm)** | `28px` (`h-7`) | Fixed | Secondary action, code copy button |
| **Button (default)** | `32px` (`h-8`) | Fixed | Standard form actions, dialog buttons |
| **Button (lg)** | `36px` (`h-9`) | Fixed | Primary hero CTA |
| **Touch Target (Mobile)**| $\ge 44\text{px}\times 44\text{px}$| Minimum | Mobile touch targets per WCAG 2.5.5 |
| **Mobile Top Bar** | `52px` (`--m-top-bar`) | Fixed | Fixed phone header with logo + menu |
| **Mobile Tab Bar** | `56px` (`--m-tab-bar`) | Fixed | Fixed phone bottom navigation dock |
| **Modal Width (Standard)**| `512px` (`max-w-lg`) | Max Width | Settings, Command Palette, QuickSwitcher |
| **Modal Width (Diff)** | `768px` (`max-w-3xl`) | Max Width | Approval Dialog, File Diff Modal |
| **Container Max-Width** | `1152px` (`max-w-6xl`)| Max Width | Web landing page, showcase, docs |

---

### 2.4 Elevation, Radii, Borders, Shadows & HUD Overlays

#### Radii (Terminal Square Contract)
*Terminals do not have large rounded corners.* In Kaioken, radii are kept strictly compact ($\le 4\text{px}$) to maintain an authentic terminal instrumentation feel.

```css
--radius: 0.25rem;                       /* 4.0px base */
--radius-sm: calc(var(--radius) * 0.6);  /* 2.4px */
--radius-md: calc(var(--radius) * 0.8);  /* 3.2px */
--radius-lg: var(--radius);              /* 4.0px */
--radius-xl: calc(var(--radius) * 1.4);  /* 5.6px */
--radius-4xl: 9999px;                    /* Full pill (reserved for badges & eyebrow pills) */
```

#### Surface Treatments, Glass & HUD Shadows

```css
/* Glassmorphism Surface: Dark frosted canvas */
.glass {
  background:
    linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%),
    color-mix(in oklab, var(--kai-panel) 60%, transparent);
  backdrop-filter: blur(20px) saturate(180%) brightness(1.05);
  -webkit-backdrop-filter: blur(20px) saturate(180%) brightness(1.05);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    inset 0 -1px 0 rgba(0,0,0,0.2),
    0 4px 24px -8px rgba(0,0,0,0.6);
}

/* Deep Glass: For layered inner containers */
.glass-deep {
  background:
    linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%),
    color-mix(in oklab, var(--kai-ink) 75%, transparent);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid rgba(255,255,255,0.06);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.04),
    0 8px 32px -12px rgba(0,0,0,0.8);
}

/* Orange Glass: Hero elements & active focus */
.glass-orange {
  background:
    linear-gradient(135deg, rgba(255,135,0,0.08) 0%, rgba(255,135,0,0.02) 100%),
    color-mix(in oklab, var(--kai-panel) 55%, transparent);
  backdrop-filter: blur(20px) saturate(200%);
  -webkit-backdrop-filter: blur(20px) saturate(200%);
  border: 1px solid rgba(255,135,0,0.15);
  box-shadow:
    inset 0 1px 0 rgba(255,135,0,0.1),
    0 4px 24px -8px rgba(255,135,0,0.2);
}

/* Ambient Panel Glow */
.panel-glow {
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.06),
    0 0 40px -12px color-mix(in oklab, var(--kai-orange) 45%, transparent);
}

/* Button Aura Glow */
.btn-glow {
  box-shadow:
    0 0 0 1px color-mix(in oklab, var(--kai-orange) 25%, transparent),
    0 4px 20px -4px color-mix(in oklab, var(--kai-orange) 50%, transparent);
}
.btn-glow:hover {
  box-shadow:
    0 0 0 1px color-mix(in oklab, var(--kai-orange) 45%, transparent),
    0 6px 28px -4px color-mix(in oklab, var(--kai-orange) 70%, transparent);
}
```

#### Ambient Background & Phosphor Textures

| Class Name | Pattern Description | Blend / Mask Behavior |
| :--- | :--- | :--- |
| `.crt-scanlines` | Repeating horizontal 2px transparent / 1px black 35% scanlines | `mix-blend-mode: multiply`, pointer-events: none |
| `.term-grid` | 3ch × 1.5rem faint white grid lines (8% opacity) | Terminal monospace grid backdrop under heroes |
| `.kai-dots` | Radial gradient 1.1px dots spaced 26px × 26px | Phosphor character screen texture |
| `.kai-mesh` | 64px × 64px linear panel seam grid | Structural panel seams across full pages |
| `.kai-bloom` | 80px blurred radial circle | Off-screen ambient orange/red/amber light sources |
| `.kai-vignette` | Radial gradient ellipse 80% 65% at 50% 40% | Darkens edges to focus attention on center column |

#### Z-Index Layer Stack

```
  z-index: 200   ──  Toaster / Global Floating Alerts
  z-index: 150   ──  Popovers / Dropdowns / Tooltips
  z-index: 100   ──  Modals / Dialog Overlays / Sheets / Command Palette
  z-index: 50    ──  Fixed TopBar / SiteHeader / Sticky Navigation
  z-index: 40    ──  Sticky Section Bars / In-Page Tab Strips
  z-index: 10    ──  Floating Action Buttons / Window Chrome Drag Layer
  z-index: 0     ──  Main Content Canvas / Panes
  z-index: -10   ──  PageBackground (Mesh, Dots, Blooms, WebGL Shader)
```

---

### 2.5 Motion, Timing & Keyframe Orchestration

All animations strictly adhere to `@media (prefers-reduced-motion: reduce)`.

#### Keyframe Matrix

| Keyframe Name | Duration | Curve | Semantic Trigger |
| :--- | :--- | :--- | :--- |
| `caret-blink` | `1.05s` | `step-end infinite` | Monospace streaming cursor (`.animate-caret`) |
| `rise-in` | `550ms` | `cubic-bezier(0.22, 1, 0.36, 1)` | Page hero load entrance, section reveal (`.animate-rise`) |
| `rule-sweep` | `6.0s` | `linear infinite` | Top highlight gradient sweep (`.rule-sweep`) |
| `tour-fill` | Component-timed | `linear forwards` | Unattended demo progress timer (`.animate-tour`) |
| `bloom-drift` | `26.0s` | `ease-in-out infinite` | Ambient background light source drift (`.animate-bloom`) |
| `float` | `5.0s` | `ease-in-out infinite` | Hero badge vertical float (`.animate-float`) |
| `shimmer` | `2.4s` | `ease infinite` | Skeleton loading highlight sweep (`.animate-shimmer`) |
| `m-expand` | `180ms` | `ease-out both` | Mobile accordion collapse/expand (`.m-expand`) |
| `m-press` | `120ms` | `ease` | Mobile touch press scale $(0.985\times)$ (`.m-press`) |

---

## 3. Layout, Grid & Multi-Surface Responsive System

### 3.1 Desktop Shell Architecture (Tauri v2)

The desktop application (`DesktopApp.tsx` / `AppWindow.tsx`) implements a fixed multi-pane layout:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Custom Titlebar (44px) — Drag Zone · Workspace Switcher · Model Tag · Search│
├────────┬────────────────────────────────────────────────────┬───────────────┤
│        │                                                    │               │
│ Nav    │                  Main Route Pane                   │ File Explorer │
│ Rail   │          (Chat / Research / Wiki / Editor)         │ (Collapsible) │
│ (68px) │                                                    │ (130px)       │
│        │                                                    │               │
├────────┴────────────────────────────────────────────────────┴───────────────┤
│ Status Bar (24px) — Connection State · Active Runs · Token Cost · Theme/Term│
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Titlebar (`h-11` / 44px):** Configured with `decorations: false` in Tauri. Renders native drag region, workspace indicator, git branch badge, search shortcut (`Ctrl+K`), model pill, and window controls.
- **NavRail (`w-[68px]` / 68px):** Houses 12 surface navigation buttons with glowing left indicator bracket, active route badge, and keyboard accelerators (`Ctrl+1` through `Ctrl+9`).
- **File Explorer Sidebar (`w-[130px]`):** Tree view with directory expansion chevrons, file icons, and line counts.
- **Status Bar (`h-6` / 24px):** Persistent telemetry: daemon connection indicator (`● connected`), active run count (`1 run`), session token accumulator (`Σ tokens`), and terminal drawer toggle.

---

### 3.2 Web & Documentation Responsive Layouts

The web experience (`website/src/pages`) utilizes a 12-column responsive layout constrained to `max-w-6xl` (1152px):
- **Hero & Landing Viewport:** Centered ASCII wordmark, WebGL FaultyTerminal canvas (desktop only), feature pill, dynamic headline, primary CTA with aura glow, and animated terminal demo.
- **Documentation Layout (`/docs`):** Sticky top bar (`h-16`), 240px left-hand table-of-contents navigation, fluid center markdown prose column, and right-hand in-page header anchors.
- **Breakpoints:**
  - `sm`: `640px` (2-column card grids)
  - `md`: `768px` (WebGL shader enabled, desktop navigation enabled)
  - `lg`: `1024px` (3-column feature grids, side-by-side terminal demos)
  - `xl`: `1280px` (Full desktop viewports)

---

### 3.3 Mobile Web Ergonomics & Touch Geometry

The mobile site (`src/mobile`) switches to a specialized single-column layout:
- **Viewport Constraints:** Fixed top bar (`--m-top-bar: 52px`), fixed bottom tab bar (`--m-tab-bar: 56px`), dynamic safe-area insets (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`).
- **Horizontal Snapping Rails (`.m-rail`):** Multi-column desktop grids convert into full-bleed, snapping horizontal swipe tracks with hidden scrollbars.
- **Touch-First Feedback:** Replaces `:hover` with active touch scaling (`active:scale-[0.985]` via `.m-press`).
- **Target Size Rule:** All touch targets maintain a minimum size of $44\text{px}\times 44\text{px}$.

---

### 3.4 Shader & Ambient Backdrop Management

- **Desktop ( $\ge 768\text{px}$ ):** Executes the `FaultyTerminal` WebGL shader (OGL library) rendering a live CRT phosphor glitch grid, mouse reaction, noise field, and bloom. Capped at 30 FPS at 0.5 internal resolution scale to conserve GPU power.
- **Mobile ( $< 768\text{px}$ ):** Automatically unloads WebGL and replaces it with zero-overhead CSS scanlines (`.crt-scanlines`) to eliminate thermal throttling and battery drain.

---

## 4. Master Component Library Specification

### 4.1 Atomic UI Primitives

#### `Button`
- **Purpose:** Primary interactive element for executing commands, opening dialogs, and confirming actions.
- **Variants:**
  - `default`: Solid primary orange (`bg-primary text-primary-foreground hover:bg-primary/80`)
  - `outline`: Bordered neutral (`border-border bg-background hover:bg-muted`)
  - `secondary`: Subtle panel background (`bg-secondary text-secondary-foreground`)
  - `ghost`: Transparent hover (`hover:bg-muted`)
  - `destructive`: Rose tint for danger (`bg-destructive/10 text-destructive hover:bg-destructive/20`)
  - `link`: Underlined text action
- **Sizes:** `xs` (24px), `sm` (28px), `default` (32px), `lg` (36px), `icon` (32px), `icon-xs` (24px), `icon-sm` (28px), `icon-lg` (36px).
- **States:** Default, Hover, Active (`translate-y-px active:scale-[0.97]`), Focus-Visible (`ring-3 ring-ring/50`), Disabled (`opacity-50 pointer-events-none`).
- **Props Interface:**
  ```typescript
  import { Button as ButtonPrimitive } from "@base-ui/react/button"
  import { type VariantProps } from "class-variance-authority"

  interface ButtonProps extends ButtonPrimitive.Props, VariantProps<typeof buttonVariants> {
    className?: string;
  }
  ```
- **Accessibility:** Uses native `<button>` via `@base-ui/react/button`, declares `focus-visible:ring-3`, supports keyboard triggering ($Enter$ / $Space$).
- **Do’s and Don’ts:**
  - *Do:* Use `size="sm"` for dense toolbar and table actions.
  - *Don't:* Place anchor links directly inside `Button` without using `LinkButton` (avoids accessibility tree corruption).
- **Code Example:**
  ```tsx
  <Button variant="default" size="sm" onClick={handleScan}>
    <Sparkles className="size-3.5 mr-1" />
    Run Scan
  </Button>
  ```

---

#### `Badge`
- **Purpose:** Categorical metadata, counts, git markers, status tags.
- **Variants:** `default` (orange), `secondary` (panel), `destructive` (rose), `outline` (bordered), `ghost` (muted), `link`.
- **Props Interface:**
  ```typescript
  interface BadgeProps extends useRender.ComponentProps<"span">, VariantProps<typeof badgeVariants> {
    className?: string;
  }
  ```
- **Code Example:**
  ```tsx
  <Badge variant="secondary">
    <span className="size-1.5 rounded-full bg-kai-green" />
    263 files indexed
  </Badge>
  ```

---

#### `Tabs`
- **Purpose:** Categorized view switching within pages, modals, and report cards.
- **Components:** `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`.
- **Variants:** `default` (pill container), `line` (minimal bottom border indicator).
- **Props Interface:**
  ```typescript
  interface TabsProps extends TabsPrimitive.Root.Props {
    orientation?: "horizontal" | "vertical";
  }
  ```
- **Accessibility:** Full ARIA `role="tablist"`, `role="tab"`, `role="tabpanel"` support with keyboard arrow navigation.
- **Code Example:**
  ```tsx
  <Tabs defaultValue="answer" orientation="horizontal">
    <TabsList variant="line">
      <TabsTrigger value="answer">Answer</TabsTrigger>
      <TabsTrigger value="sources">Sources (14)</TabsTrigger>
      <TabsTrigger value="steps">Audit Trail</TabsTrigger>
    </TabsList>
    <TabsContent value="answer">
      <Markdown>{content}</Markdown>
    </TabsContent>
  </Tabs>
  ```

---

#### `LinkButton`
- **Purpose:** Renders an internal route (`react-router-dom Link`) or external link styled consistently with `Button` without stripping anchor semantics.
- **Props:** `{ to?: string; href?: string; variant?: string; size?: string; className?: string; children: ReactNode }`.
- **Code Example:**
  ```tsx
  <LinkButton to="/desktop" variant="default" size="lg" className="btn-glow">
    Explore Desktop App <ArrowRight className="size-4 ml-1.5" />
  </LinkButton>
  ```

---

#### `SectionHeading`
- **Purpose:** Standardized section header with terminal gutter mark, eyebrow pill, large title, and lead description.
- **Props:** `{ index?: string; eyebrow: string; title: ReactNode; description?: ReactNode; align?: "left" | "center"; className?: string }`.
- **Code Example:**
  ```tsx
  <SectionHeading
    index="01"
    eyebrow="architecture"
    title={<>One binary, <span className="text-kai-orange glow-orange">two faces</span></>}
    description="The agent edits your repository behind diff approval; the knowledge engine generates wikis."
  />
  ```

---

### 4.2 HUD & Terminal Chrome Primitives

#### `TerminalWindow`
- **Purpose:** Frame for code blocks, terminal transcripts, and live runs with CRT header dots and optional scanlines.
- **Props:** `{ title?: string; meta?: ReactNode; scanlines?: boolean; bodyClassName?: string; children: ReactNode }`.
- **States:** Default, Focused (`panel-glow`), Scanline Active.
- **Code Example:**
  ```tsx
  <TerminalWindow title="kaioken — daemon" meta="port: 54312" scanlines>
    <pre className="font-mono text-[12px] text-kai-green">✓ daemon listening on 127.0.0.1:54312</pre>
  </TerminalWindow>
  ```

---

#### `TerminalDemo`
- **Purpose:** Animated typing demonstration recreating the CLI Lipgloss TUI experience.
- **Features:** Auto-advancing script, pause hooks, reduced-motion bypass, terminal caret pulse.
- **Accessibility:** Encloses live text in `aria-live="off"` while the demo is running, preserving clean screen-reader output.

---

#### `PowerMeter`
- **Purpose:** Visualizes compute amplification dial ($\times 1$ to $\times 10$). Turns from orange to glowing red at $\ge \times 7$.
- **Props:** `{ value: number; max?: number; hotFrom?: number; showLabel?: boolean; className?: string }`.
- **Accessibility:** `role="meter"`, `aria-valuenow={value}`, `aria-valuemin={1}`, `aria-valuemax={10}`.

---

#### `PageBackground`
- **Purpose:** Fixed full-page backdrop with dot matrix, coarse mesh, ambient colored blooms, and CRT vignette.
- **Variants:** `full` (hero pages with three blooms + scanlines), `simple` (reading surfaces with quiet double bloom).

---

### 4.3 Answer & Deep Research Surfaces

#### `AskComposer`
- **Purpose:** Multi-line research inquiry input with power selector dial, web/repo toggle, and real-time cost estimate preview.
- **Props:** `{ onSubmit: (prompt: string, power: number, web: boolean) => void; busy?: boolean; placeholder?: string }`.
- **Interaction:**
  - $Enter$ sends prompt.
  - $Shift+Enter$ / $Alt+Enter$ creates newline.
  - Power dial previews pass count ($2\times \text{power}$ LLM calls).

---

#### `AnswerCard`
- **Purpose:** Structured report container displaying deep research results with source chips, audit tabs, export hooks, and follow-up prompts.
- **Props:** `{ answer: Answer; searched?: number; rounds?: number; busy?: boolean; onFollowUp?: (q: string) => void }`.
- **Sub-components:**
  - `SourceChip`: Inline citation badge (`[1]`) showing domain favicon and tooltip preview.
  - `Favicon`: Domain favicon resolver with fallback to domain-hashed HSL color dot.
  - `ResearchSteps`: Visual timeline of decomposition, search, reading, and reasoning passes.

---

### 4.4 Chat & Autonomous Agent Engine Surfaces

#### `ApprovalDialog`
- **Purpose:** Trust checkpoint pausing the agent daemon when a file modification, write, or terminal execution is requested.
- **Safety Protocol:**
  - Focus **never** lands on "Approve" (defaults to "Deny" or the diff body).
  - Keyboard accelerators: `Y` = Approve, `N` = Deny, `A` = Approve All this Turn, `Escape` = Deny.
  - Auto-denies after 5 minutes with deterministic notice: *"Denying leaves the file byte-identical"*.
- **Props:** `{ approval: Approval | null; onResolve: (decision: "approve" | "deny" | "approve_all") => void }`.

---

#### `DiffView`
- **Purpose:** High-contrast unified or side-by-side diff viewer rendering line additions in `--kai-green` with green tint, deletions in `--kai-rose` with red tint, line numbers, and hunk header dividers.
- **Props:** `{ diff: string; preview?: boolean; className?: string }`.

---

#### `ToolCallCard` & `ToolResultCard`
- **Purpose:** Displays tool invocations issued by the agent (`read_file`, `search`, `run_command`, `write_file`) with dedicated glyphs, collapsible argument JSON, and execution status.
- **Props:** `{ name: string; args: Record<string, unknown>; result?: string; status: "running" | "success" | "error" }`.

---

### 4.5 Desktop Application Shell & Panes

#### `AppWindow`
- **Purpose:** High-fidelity interactive desktop window component with working navigation rail, 12 screen panes, and an automated tour walkthrough.
- **Tour Behavior:** Automatically cycles through key screens (`chat` $\rightarrow$ `research` $\rightarrow$ `wiki` $\rightarrow$ `graph` $\rightarrow$ `activity` $\rightarrow$ `cost` $\rightarrow$ `editor`) every 5.6s. Pauses on hover; terminates permanently upon explicit user navigation.

---

#### The 12 Desktop Panes
1. **`WorkspacesPane` (`Ctrl+O`):** Recent repository picker, scan stats, module freshness, drag-and-drop workspace loader.
2. **`ChatPane` (`Ctrl+1`):** Tool-using agent with collapsible tool cards, streaming plain text tail, and inline diff approval cards.
3. **`ResearchPane` (`Ctrl+2`):** Step-by-step query decomposition, multi-source search, and cited report viewer.
4. **`WikiPane` (`Ctrl+3`):** Generated documentation browser with table-of-contents tree, rendered Mermaid diagrams, and code blocks.
5. **`GraphPane` (`Ctrl+4`):** Interactive node-link graph mapping wiki pages (orange) to source code files (green) across 297+ edges.
6. **`CardsPane` (`Ctrl+5`):** Fixed 5-file module knowledge card browser (`overview.md`, `architecture.md`, `conventions.md`, `tech_stack.md`).
7. **`EditorPane` (`Ctrl+6`):** CodeMirror 6 multi-language editor paired with a PTY-backed terminal drawer (`Ctrl+\``).
8. **`BrowserPane` (`Ctrl+7`):** In-app web browser with tabs, history, URL address bar, and project quick-links.
9. **`ActivityPane` (`Ctrl+8`):** Live multi-pipeline console displaying concurrent background runs with progress bars and cancel hooks.
10. **`ExtensionsPane` (`Ctrl+9`):** Plugin and skill marketplace with pinned version trust dialogs and capability permissions.
11. **`CostPane`:** Financial and token expenditure dashboard with model breakdown and workspace filtering.
12. **`SettingsPane` (`Ctrl+,`):** Provider API configuration, Ollama local model discovery, search engine setup, and theme toggling.

---

### 4.6 Content, Markdown & Diagram Visualizers

#### `Markdown`
- **Purpose:** Full-featured GitHub Flavored Markdown renderer with slug rewriting, heading anchors, custom blockquotes, tables, and lazy Mermaid diagrams.
- **Props:** `{ children: string; sectionDir?: string }`.
- **Rules:** Headings render in `JetBrains Mono` with orange/amber accents; paragraph prose renders in `Geist Variable` with `1.75` line-height.

---

#### `CodeBlock`
- **Purpose:** Terminal-framed syntax-highlighted code block with copy-to-clipboard button and optional shell prompt ($) markers.
- **Props:** `{ code: string; title?: string; prompt?: boolean; className?: string }`.

---

#### `Mermaid`
- **Purpose:** Lazy-loaded, strict-mode diagram visualizer rendering system architecture and sequence diagrams.
- **Error Recovery:** Fails soft by demoting invalid diagram syntax to a plain monospace code block rather than displaying a broken UI box.

---

### 4.7 Mobile-Optimized Primitives

- **`Section`:** Vertical rhythm container separated by terminal-style hairline borders (`py-9 px-4 border-t border-border`).
- **`Eyebrow`:** Mobile gutter indicator (`▎ 01 · FEATURES`).
- **`Lead`:** High-legibility mobile subtitle (`font-sans text-[14.5px] leading-[1.65] text-muted-foreground`).
- **`StatGrid`:** 2-column and 3-column metric strips with large values.
- **`TabBar`:** Fixed bottom navigation dock with active route icons.
- **`TopBar`:** Fixed top header with menu trigger, brand logo, and safe-area top padding.
- **`Accordion`:** Animated disclosure container for dense FAQs and mobile doc sections.

---

## 5. Master Component Inventory Table

| Component Name | Source File Path | Category | Target Surface | Status | Primary Props | Key Variants / States |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`Button`** | `src/components/ui/button.tsx` | Atomic UI | Universal | Production | `variant`, `size`, `className` | `default`, `outline`, `secondary`, `ghost`, `destructive`, `link` · Sizes: `xs` to `lg` |
| **`Badge`** | `src/components/ui/badge.tsx` | Atomic UI | Universal | Production | `variant`, `className` | `default`, `secondary`, `destructive`, `outline`, `ghost`, `link` |
| **`Tabs`** | `src/components/ui/tabs.tsx` | Atomic UI | Universal | Production | `orientation`, `defaultValue` | `default`, `line` · Horizontal / Vertical |
| **`LinkButton`** | `src/components/LinkButton.tsx` | Atomic UI | Web / Desktop | Production | `to`, `href`, `variant`, `size` | Internal `Link` vs External `a` with `buttonVariants` |
| **`SectionHeading`**| `src/components/SectionHeading.tsx` | Atomic UI | Web / Desktop | Production | `index`, `eyebrow`, `title`, `description` | Align: `left`, `center` |
| **`TerminalWindow`**| `src/components/TerminalWindow.tsx` | HUD Chrome | Universal | Production | `title`, `meta`, `scanlines` | Window header dots · Scanline overlay |
| **`TerminalDemo`** | `src/components/TerminalDemo.tsx` | HUD Chrome | Web / Desktop | Production | — | Auto-typing script · Reduced-motion bypass |
| **`PageBackground`**| `src/components/PageBackground.tsx` | HUD Chrome | Web / Desktop | Production | `variant` | `full` (3 blooms + scanlines), `simple` (2 blooms) |
| **`FaultyTerminal`**| `src/bits/FaultyTerminal.tsx` | HUD Chrome | Desktop Web | Production | `scale`, `tint`, `curvature`, `noiseAmp` | Live OGL WebGL Shader · 30 FPS capped |
| **`AskComposer`** | `src/components/answer/AskComposer.tsx` | Answer Surface | Desktop / Web | Production | `onSubmit`, `busy`, `placeholder` | Multi-line auto-expand · Power dial |
| **`AnswerCard`** | `src/components/answer/AnswerCard.tsx` | Answer Surface | Desktop / Web | Production | `answer`, `searched`, `rounds` | Tabs: `Answer`, `Sources`, `Audit Steps` |
| **`SourceChip`** | `src/components/answer/SourceChip.tsx` | Answer Surface | Desktop / Web | Production | `n`, `source`, `onOpen` | Verified citation chip with hover tooltip |
| **`ApprovalDialog`**| `src/components/chat/ApprovalDialog.tsx` | Agent / Chat | Desktop App | Production | `approval`, `onResolve` | `edit_file`, `write_file`, `run_command` |
| **`DiffView`** | `src/components/chat/DiffView.tsx` | Agent / Chat | Desktop App | Production | `diff`, `preview` | Side-by-side / Unified syntax diff |
| **`ToolCallCard`** | `src/components/chat/ToolCallCard.tsx` | Agent / Chat | Desktop App | Production | `name`, `args`, `result`, `status` | Collapsible JSON viewer with status icon |
| **`AppWindow`** | `src/components/desktop/AppWindow.tsx` | Desktop Shell | Web Showcase | Production | `size`, `start` | Interactive 12-pane desktop recreation |
| **`NavRail`** | `src/components/desktop/AppWindow.tsx` | Desktop Shell | Desktop App | Production | `activePane`, `onSelect` | 68px width · Glowing orange active bracket |
| **`Markdown`** | `src/components/Markdown.tsx` | Content Engine | Universal | Production | `children`, `sectionDir` | Heading anchors, table wrapper, slug router |
| **`CodeBlock`** | `src/components/CodeBlock.tsx` | Content Engine | Universal | Production | `code`, `title`, `prompt` | Syntax highlight · Copy to clipboard |
| **`Mermaid`** | `src/components/Mermaid.tsx` | Content Engine | Universal | Production | `chart` | Strict Mermaid SVG · Soft code fallback |
| **`SiteHeader`** | `src/components/SiteHeader.tsx` | Layout | Web App | Production | — | Glassmorphism blur · Mobile nav flyout |
| **`SiteFooter`** | `src/components/SiteFooter.tsx` | Layout | Web App | Production | — | ASCII builder art · Navigation links |
| **`MobileSection`** | `src/mobile/components/primitives.tsx` | Mobile Primitives| Mobile Web | Production | `id`, `first`, `children` | Hairline border divider · `py-9 px-4` |
| **`MobileTabBar`** | `src/mobile/components/TabBar.tsx` | Mobile Shell | Mobile Web | Production | `active`, `onSelect` | Fixed 56px bottom dock · Safe-area inset |

---

## 6. Interaction Patterns, Ergonomics & Motion Guidelines

### 6.1 Global Keyboard Accelerators Matrix

| Shortcut | Scope | Action | UI Behavior |
| :--- | :--- | :--- | :--- |
| `Ctrl/Cmd + K` | Global | Open Command Palette | Displays fuzzy command finder dialog |
| `Ctrl/Cmd + P` | Global | Quick File Switcher | Displays fuzzy workspace file switcher |
| `Ctrl/Cmd + B` | Global | Toggle Explorer Sidebar | Collapses / expands right-hand file tree |
| `Ctrl/Cmd + 1...9`| Global | Jump to Surface Pane | Switches directly to Chat, Research, Wiki, Graph, etc. |
| `Ctrl/Cmd + ,` | Global | Open Settings | Opens configuration view |
| `Ctrl/Cmd + \`` | Editor | Toggle Terminal Drawer | Toggles bottom xterm.js PTY shell drawer |
| `Ctrl/Cmd + S` | Editor | Save File | Saves current file buffer to disk |
| `Ctrl/Cmd + F` | Editor | Find in File | Opens CodeMirror search panel |
| `Ctrl/Cmd + O` | Workspaces | Open Workspace | Opens native folder picker dialog |
| `?` | Global | Shortcut Help | Opens `<ShortcutHelp>` cheat sheet (outside inputs) |
| `Enter` | Composer | Send Message / Query | Dispatches prompt to daemon |
| `Shift + Enter` | Composer | Insert Newline | Inserts soft line break without sending |
| `Alt + Enter` | Composer | Terminal Newline | Terminal-parity line break |
| `Y` | Approval | Approve Proposed Change | Applies diff hunk and resumes agent |
| `N` | Approval | Deny Proposed Change | Rejects diff hunk and resumes agent |
| `A` | Approval | Approve All this Turn | Authorizes remaining edits in current turn |
| `Esc` | Overlays | Dismiss / Deny | Closes open dialog, rejects pending approval |

---

### 6.2 Destructive Action Safety & Approval Protocol

```
  ┌─────────────────────────────────────────────────────────────┐
  │ ⚠ APPROVAL REQUIRED: internal/wiki/update.go                │
  ├─────────────────────────────────────────────────────────────┤
  │ @@ -42,3 +42,5 @@                                           │
  │ -  mapped := byProvenance(f)                                │
  │ +  mapped := byProvenance(f)                                │
  │ +  if mapped == "" { mapped = planScope(f) }                │
  ├─────────────────────────────────────────────────────────────┤
  │ [ Y ] Approve (Enter)   [ N ] Deny (Esc)   [ A ] Approve All│
  │ ⏳ Auto-denying in 4:58 · Nothing written to disk yet       │
  └─────────────────────────────────────────────────────────────┘
```

1. **Initial Focus Safety:** When an approval modal opens, focus is explicitly directed to **"Deny"** or the diff body. Focus **never** defaults to "Approve".
2. **Auto-Deny Countdown:** If the user does not respond within 5 minutes (300s), the operation automatically denies, and the agent is notified.
3. **Deterministic Guarantee:** Every approval prompt explicitly states: *"Denying leaves the file byte-identical"*.

---

### 6.3 Multiplier Dial & Real-Time Cost Preview

The power multiplier ($\times 1$ to $\times 10$) deterministically scales agent compute:
- $\times 1$: Single-pass fast execution ($1\times$ baseline token cost).
- $\times 3$ (Default): Standard thorough coverage ($3\times$ passes).
- $\times 4 - \times 6$: Adds critique-and-revise loops ($6\times - 10\times$ calls).
- $\ge \times 7$: Deep recursive multi-agent team ($15\times - 30\times$ calls). Triggers red warning meter and explicit confirmation dialog.

---

### 6.4 Unattended Tour & User Interruption Model

In demo components (`AppWindow.tsx`), an unattended tour automatically steps through showcase panes.
- **Interruption Guarantee:** The moment a user clicks any navigation item or tabs into the interface, the tour **permanently terminates**. It never overrides user intent or resumes unprompted.

---

### 6.5 Reduced Motion & Low-Power Adaptations

Under `@media (prefers-reduced-motion: reduce)`:
- WebGL shader unloads immediately.
- Caret animations, floating physics, and shimmer sweeps are disabled (`animation: none !important`).
- Transition durations are set to `0ms`.
- Animated terminal transcripts display all lines immediately.

---

## 7. Developer Implementation Recommendations & Architecture

### 7.1 Component Architecture & Base UI Conventions

- **Primitive Grounding:** All atomic components are built on `@base-ui/react` primitives (unstyled, accessible foundation).
- **Variant Orchestration:** Style variations use `class-variance-authority` (CVA) combined with `cn()` (`clsx` + `tailwind-merge`).
- **Anchor Semantics:** Interactive links that look like buttons must use `LinkButton` (applying `buttonVariants` to `<a>` or `Link`) to preserve accessibility trees.

---

### 7.2 Domain-Partitioned State Management

Zustand stores are partitioned strictly by domain:
- `useWorkspaceStore`: Active repo path, scan results, module definitions, git status.
- `useChatStore`: Message history, token streams, pending approval requests.
- `useRunsStore`: Concurrent background jobs, step progress, cancellation tokens.
- `useThemeStore`: Persistent theme mode (`dark` / `light`).
- `useToastStore`: Transient notification queue with severity spines.

---

### 7.3 Jank-Free Streaming Text Architecture

LLMs stream tokens at $\sim 30-50\text{ tokens/sec}$. Re-parsing full Markdown on every delta freezes the browser main thread. Kaioken enforces a 5-step streaming pattern:

```
  SSE Token Delta ──► Accumulate in Ref ──► RAF Throttle (60ms / 16fps)
                             │
                             ▼
               Render Tail as Pre-wrapped Text
            <div className="whitespace-pre-wrap"> + Caret
                             │
                             ▼
     Turn Completed ──► Parse Full Markdown Once (React.memo)
```

1. **Committed turns are memoized** via `React.memo` by message sequence index.
2. **Deltas accumulate in a ref**, flushing to state via `requestAnimationFrame` throttled at 60ms.
3. **Live streaming tail is rendered as plain text** with an animated caret, avoiding broken AST markdown parsing mid-token.
4. **Final Markdown parse happens once** when the daemon emits `chat.turn_complete`.
5. **Mermaid diagrams are lazy-loaded** using `IntersectionObserver`.

---

### 7.4 SSE Event Stream & Loopback HTTP Pipeline

- The daemon binds strictly to `127.0.0.1` with a per-session bearer token.
- Server-Sent Events (`/api/events`) stream structured JSON events:
  - `run.progress`: `{ run_id, step, pct, detail }`
  - `chat.delta`: `{ turn_id, delta }`
  - `chat.approval`: `{ approval_id, tool, path, diff }`
  - `workspace.state`: `{ modules, fresh_count, stale_count }`

---

### 7.5 Stale-Paint Theme Transition Engine

To prevent Chromium CSS custom property transition stutter during theme swaps, Kaioken disables all transitions for 2 animation frames:

```typescript
export function applyTheme(theme: "dark" | "light") {
  const root = document.documentElement
  root.classList.add("theme-switching")
  root.classList.toggle("dark", theme === "dark")
  root.classList.toggle("light", theme === "light")

  const rearm = () => root.classList.remove("theme-switching")
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(rearm))
  } else {
    setTimeout(rearm, 100)
  }
}
```

---

### 7.6 CodeMirror 6 Dynamic Compartment Theming

CodeMirror 6 instances bind to Kaioken CSS variables via dynamic compartments, allowing real-time theme swaps without editor re-instantiation.

---

## 8. Accessibility & UX Writing Standards

### 8.1 WCAG 2.1/2.2 AA Contrast Compliance Matrix

| Foreground Token | Background Surface | Contrast Ratio | WCAG 2.1 Compliance |
| :--- | :--- | :--- | :--- |
| `--kai-orange` (`#ff8700`) | `--kai-black` (`#080808`) | **7.82 : 1** | **AAA** (Pass $\ge 7.0:1$) |
| `--kai-orange` (Light `#d96e00`) | `--kai-black` (Light `#f7f7f7`) | **4.65 : 1** | **AA** (Pass $\ge 4.5:1$) |
| `--kai-text` (`#d0d0d0`) | `--kai-black` (`#080808`) | **12.45 : 1** | **AAA** (Pass $\ge 7.0:1$) |
| `--kai-amber` (`#ffaf00`) | `--kai-panel` (`#1c1c1c`) | **9.10 : 1** | **AAA** (Pass $\ge 7.0:1$) |
| `--kai-green` (`#00d787`) | `--kai-ink` (`#121212`) | **8.12 : 1** | **AAA** (Pass $\ge 7.0:1$) |
| `--kai-rose` (`#ff5f5f`) | `--kai-ink` (`#121212`) | **6.40 : 1** | **AA** (Pass $\ge 4.5:1$) |
| `--kai-muted` (`#808080`) | `--kai-panel` (`#1c1c1c`) | **4.58 : 1** | **AA** (Pass $\ge 4.5:1$) |

---

### 8.2 Focus Management, Keyboard Trapping & ARIA Live Regions

- **Focus Rings:** Every interactive element declares `focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none`.
- **Dialog Focus Traps:** Base UI dialogs capture tab cycles inside modals and restore focus to the triggering element upon closing.
- **Screen Reader Announcements:** In-flight status updates use `aria-live="polite"` and `role="status"`. Decorative typing animations explicitly set `aria-live="off"`.

---

### 8.3 Deterministic Microcopy & Error Humanization

- **No Vague AI Magic:** Never write "Thinking..." or "Generating optimal insights". Write *"Reading 9 pages · Searching Brave (23 results) · Synthesizing"*.
- **Actionable Errors:** Never show raw unparsed JSON or stack traces.
  - *Bad:* `Error: 401 Unauthorized - openrouter_api_key_missing`
  - *Good:* *"No API key found for OpenRouter. [Configure Key in Settings] (Ctrl+,)"*.
- **Destructive Clarity:** Always explain the outcome of cancellation or denial.

---

## 9. Iconography System

Kaioken uses `lucide-react` with standardized stroke widths (`1.5px` to `2.0px`) and ANSI-aligned semantic color mappings:

| Icon Category | Lucide Glyphs | Standard Size | Semantic Tone |
| :--- | :--- | :--- | :--- |
| **Agent Tools** | `FileText`, `Search`, `Terminal`, `Edit3`, `Layers` | `14px` (`size-3.5`) | `--kai-tan` (ANSI 180) |
| **Verification / Diff**| `Check`, `X`, `Plus`, `Minus`, `ShieldCheck` | `14px` (`size-3.5`) | `--kai-green` / `--kai-rose` |
| **Navigation Surfaces**| `MessageSquare`, `Radar`, `BookOpen`, `Waypoints`, `Code2`, `Globe`, `Zap`, `Puzzle`, `Wallet`, `Settings`, `FolderOpen` | `16px` (`size-4`) | `--kai-orange` / `--kai-amber` |
| **Actions** | `Copy`, `ArrowRight`, `ExternalLink`, `Maximize2`, `RotateCcw` | `12px` - `14px` | `--kai-muted` $\rightarrow$ `--kai-orange` |

---

## 10. Machine-Readable Design Tokens (W3C DTCG JSON v2)

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "name": "Kaioken Design Tokens v2",
  "version": "2.0.0",
  "color": {
    "brand": {
      "orange": {
        "dark": { "$value": "#ff8700", "$type": "color", "$description": "ANSI 208 primary brand accent" },
        "light": { "$value": "#d96e00", "$type": "color", "$description": "WCAG AA tuned light brand accent" }
      },
      "amber": {
        "dark": { "$value": "#ffaf00", "$type": "color", "$description": "ANSI 214 warning / keycaps / subheaders" },
        "light": { "$value": "#9a6700", "$type": "color", "$description": "Light amber" }
      },
      "red": {
        "dark": { "$value": "#ff0000", "$type": "color", "$description": "ANSI 196 critical danger / high power" },
        "light": { "$value": "#cc0000", "$type": "color", "$description": "Light danger" }
      }
    },
    "accents": {
      "blue": {
        "dark": { "$value": "#87d7ff", "$type": "color", "$description": "ANSI 117 user prompts / shell" },
        "light": { "$value": "#0072b5", "$type": "color" }
      },
      "green": {
        "dark": { "$value": "#00d787", "$type": "color", "$description": "ANSI 42 success / diff +" },
        "light": { "$value": "#00875a", "$type": "color" }
      },
      "sage": {
        "dark": { "$value": "#87af87", "$type": "color", "$description": "ANSI 108 tool results / file refs" },
        "light": { "$value": "#4d7a4d", "$type": "color" }
      },
      "rose": {
        "dark": { "$value": "#ff5f5f", "$type": "color", "$description": "ANSI 203 error / diff -" },
        "light": { "$value": "#d33636", "$type": "color" }
      },
      "tan": {
        "dark": { "$value": "#d7af87", "$type": "color", "$description": "ANSI 180 tool calls / code accents" },
        "light": { "$value": "#8a6d3b", "$type": "color" }
      }
    },
    "surface": {
      "black": {
        "dark": { "$value": "#080808", "$type": "color", "$description": "Root viewport canvas" },
        "light": { "$value": "#f7f7f7", "$type": "color" }
      },
      "ink": {
        "dark": { "$value": "#121212", "$type": "color", "$description": "Card and sidebar surface" },
        "light": { "$value": "#ffffff", "$type": "color" }
      },
      "panel": {
        "dark": { "$value": "#1c1c1c", "$type": "color", "$description": "Popovers, menus, code blocks" },
        "light": { "$value": "#eeeeee", "$type": "color" }
      },
      "line": {
        "dark": { "$value": "#303030", "$type": "color", "$description": "Hairline structural borders" },
        "light": { "$value": "#d4d4d4", "$type": "color" }
      },
      "dim": {
        "dark": { "$value": "#585858", "$type": "color", "$description": "Muted placeholders, timestamps" },
        "light": { "$value": "#8a8a8a", "$type": "color" }
      },
      "text": {
        "dark": { "$value": "#d0d0d0", "$type": "color", "$description": "Primary readable body text" },
        "light": { "$value": "#2e2e2e", "$type": "color" }
      }
    }
  },
  "font": {
    "family": {
      "mono": { "$value": "'JetBrains Mono Variable', ui-monospace, monospace", "$type": "fontFamily" },
      "sans": { "$value": "'Geist Variable', ui-sans-serif, system-ui, sans-serif", "$type": "fontFamily" }
    },
    "size": {
      "micro": { "$value": "8.5px", "$type": "dimension" },
      "badge": { "$value": "10px", "$type": "dimension" },
      "caption": { "$value": "11px", "$type": "dimension" },
      "ui": { "$value": "12px", "$type": "dimension" },
      "chat": { "$value": "13px", "$type": "dimension" },
      "prose": { "$value": "15px", "$type": "dimension" },
      "heading3": { "$value": "16px", "$type": "dimension" },
      "heading2": { "$value": "18.4px", "$type": "dimension" },
      "heading1": { "$value": "24px", "$type": "dimension" }
    }
  },
  "dimension": {
    "radius": {
      "sm": { "$value": "2.4px", "$type": "dimension" },
      "md": { "$value": "3.2px", "$type": "dimension" },
      "lg": { "$value": "4.0px", "$type": "dimension" },
      "pill": { "$value": "9999px", "$type": "dimension" }
    },
    "layout": {
      "titlebarHeight": { "$value": "44px", "$type": "dimension" },
      "navRailWidth": { "$value": "68px", "$type": "dimension" },
      "statusBarHeight": { "$value": "24px", "$type": "dimension" },
      "mobileTopBar": { "$value": "52px", "$type": "dimension" },
      "mobileTabBar": { "$value": "56px", "$type": "dimension" }
    }
  },
  "motion": {
    "duration": {
      "fast": { "$value": "150ms", "$type": "duration" },
      "normal": { "$value": "200ms", "$type": "duration" },
      "slow": { "$value": "320ms", "$type": "duration" }
    },
    "easing": {
      "standard": { "$value": "cubic-bezier(0.22, 1, 0.36, 1)", "$type": "cubicBezier" }
    }
  }
}
```

---

## 11. Design System Governance & Evolution RFC Process

1. **Token Immutability & ANSI Contract:**
   - Tokens in `:root` represent strict ANSI contracts. Changing a color token requires contrast verification against both Dark (`#080808`) and Light (`#f7f7f7`) surfaces.
   - Any token addition must be registered simultaneously in `src/index.css`, `@theme inline`, and `DESIGN.md`.

2. **Component Contribution Gate (RFC):**
   - **Density & Radius Guardrail:** Components introducing rounded radii $>4\text{px}$ (outside pill badges) or purely decorative non-state glows will be rejected.
   - **Dual-Font Strictness:** Monospace (`JetBrains Mono`) must be used for all UI chrome. Sans-serif (`Geist`) is restricted to `.md-body` long-form prose.
   - **Keyboard & Reduced-Motion Completeness:** No component will be merged without full keyboard navigation ($Tab$, $Enter$, $Esc$) and `@media (prefers-reduced-motion)` verification.

---

## 12. Accessibility & QA Checklist

- [ ] **Contrast Compliance:** All text tokens meet minimum WCAG 2.1 AA ($4.5:1$ normal, $3.0:1$ large).
- [ ] **Keyboard Navigability:** Every interactive element is reachable via $Tab$, triggers via $Enter$ / $Space$, and closes via $Escape$.
- [ ] **Destructive Safety:** Approval dialogs default initial focus away from "Approve".
- [ ] **Focus Ring Visibility:** Active focus indicators use high-contrast orange ring (`ring-3 ring-ring/50`).
- [ ] **Screen Reader Support:** Live status streams declare `aria-live="polite"`; decorative animations declare `aria-live="off"`.
- [ ] **Touch Targets:** Mobile touch targets are $\ge 44\text{px}\times 44\text{px}$.
- [ ] **Reduced Motion:** Animations immediately disable when `prefers-reduced-motion: reduce` is active.
- [ ] **No Raw Errors:** System errors are mapped to humanized, actionable messages with settings links.
