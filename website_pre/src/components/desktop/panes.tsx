import { useEffect, useState } from "react"
import { useTypewriter } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * High-fidelity CSS recreations of the desktop app's screens.
 *
 * Every pane matches the real app's layout — sourced directly from
 * screenshots of the running application. The data shown is the
 * kaioken repository's own (real module names, file paths, stats).
 */

/* ── shared primitives ──────────────────────────────────────────────────── */

function Aside({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("hidden w-[148px] shrink-0 flex-col gap-0.5 border-r border-border bg-card/60 p-2 md:flex", className)}>
      <p className="px-1 pb-1 text-[8px] tracking-[0.18em] text-kai-dim uppercase">{label}</p>
      {children}
    </div>
  )
}

function AsideRow({ children, active, sub, depth = 0 }: { children: React.ReactNode; active?: boolean; sub?: string; depth?: number }) {
  return (
    <div className={cn("rounded-sm px-1.5 py-[3px] text-[9px] leading-tight", active ? "bg-accent text-kai-amber" : "text-kai-muted")} style={{ paddingLeft: `${6 + depth * 8}px` }}>
      <span className="block truncate">{children}</span>
      {sub ? <span className="mt-0.5 block truncate text-[7.5px] text-kai-dim">{sub}</span> : null}
    </div>
  )
}

function Body({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex min-w-0 flex-1 flex-col gap-2 overflow-hidden p-3", className)}>{children}</div>
}

function Tag({ children, tone = "dim" }: { children: React.ReactNode; tone?: "dim" | "orange" | "amber" | "green" | "blue" | "sage" | "rose" }) {
  const tones = { dim: "border-border text-kai-dim", orange: "border-kai-orange/40 text-kai-orange", amber: "border-kai-amber/40 text-kai-amber", green: "border-kai-green/40 text-kai-green", blue: "border-kai-blue/40 text-kai-blue", sage: "border-kai-sage/40 text-kai-sage", rose: "border-kai-rose/40 text-kai-rose" }
  return <span className={cn("rounded-[3px] border px-1 py-px text-[7.5px] leading-[1.4]", tones[tone])}>{children}</span>
}

function Bar({ pct, tone = "bg-kai-orange", run }: { pct: number; tone?: string; run?: boolean }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-kai-line/70">
      <div className={cn("h-full rounded-full transition-[width] duration-[1400ms] ease-out", tone)} style={{ width: run ? `${pct}%` : "4%" }} />
    </div>
  )
}

/** Right-side file explorer panel — appears on most screens */
function FileExplorer() {
  return (
    <div className="hidden w-[130px] shrink-0 flex-col border-l border-border bg-card/40 lg:flex">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        <span className="text-[7.5px] text-kai-dim">263 files</span>
      </div>
      <div className="flex-1 overflow-hidden px-1 py-1 text-[8px]">
        {[
          { name: "cmd/", depth: 0, kind: "dir" },
          { name: "kaioken/", depth: 1, kind: "dir" },
          { name: "internal/", depth: 0, kind: "dir" },
          { name: "agent/", depth: 1, kind: "dir" },
          { name: "codemap/", depth: 1, kind: "dir" },
          { name: "config/", depth: 1, kind: "dir" },
          { name: "daemon/", depth: 1, kind: "dir" },
          { name: "ext/", depth: 1, kind: "dir" },
          { name: "llm/", depth: 1, kind: "dir" },
          { name: "memory/", depth: 1, kind: "dir" },
          { name: "wiki/", depth: 1, kind: "dir" },
          { name: "AGENTS.md", depth: 0, kind: "file", lines: "88" },
          { name: "go.mod", depth: 0, kind: "file", lines: "60" },
        ].map((f) => (
          <div key={f.name + f.depth} className="flex items-center gap-0.5 truncate py-px" style={{ paddingLeft: `${f.depth * 8}px` }}>
            <span className={f.kind === "dir" ? "text-kai-amber" : "text-kai-sage"}>
              {f.kind === "dir" ? "▸" : "◦"}
            </span>
            <span className="truncate text-kai-muted">{f.name}</span>
            {f.kind === "file" && "lines" in f ? <span className="ml-auto shrink-0 text-[7px] text-kai-dim">{f.lines}</span> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

interface PaneProps { active: boolean }

/* ── 01 · chat ──────────────────────────────────────────────────────────── */

const TOOL_CALLS = [
  { glyph: "◇", name: "read_file", arg: "internal/agent/loop.go", out: "469 lines" },
  { glyph: "◎", name: "search", arg: '"provenance"', out: "14 matches · 6 files" },
]

const REPLY = "A new file appears in no document's provenance footer, so update falls back to the section's planned scope to decide which chapter owns it."

export function ChatPane({ active }: PaneProps) {
  const typed = useTypewriter(REPLY, active, 18)
  const done = typed.length >= REPLY.length

  return (
    <>
      <Aside label="sessions">
        <div className="mb-1 rounded-sm border border-dashed border-border px-1.5 py-1 text-[8px] text-kai-dim">+ new · Ctrl+N</div>
        <AsideRow active sub="7 turns · 2 min ago">why does update skip…</AsideRow>
        <AsideRow sub="3 turns · yesterday">add a --json flag</AsideRow>
        <AsideRow sub="11 turns · 2 days">explain the codemap</AsideRow>
      </Aside>
      <Body>
        <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
          <div className="border-l-2 border-kai-blue pl-2 text-[10px] text-kai-text">why does update skip new files?</div>
          {TOOL_CALLS.map((t) => (
            <div key={t.name} className="flex items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1">
              <span className="text-kai-tan">{t.glyph}</span>
              <span className="text-[9px] font-bold text-kai-tan">{t.name}</span>
              <span className="truncate text-[9px] text-kai-muted">{t.arg}</span>
              <span className="ml-auto shrink-0 text-[8px] text-kai-sage">└ {t.out}</span>
            </div>
          ))}
          <p className="text-[10px] leading-relaxed text-kai-text">
            {typed}{!done ? <span className="animate-caret text-kai-orange">▌</span> : null}
          </p>
          <div className={cn("rounded-sm border border-kai-amber/35 bg-kai-amber/[0.05] transition-opacity duration-500", done ? "opacity-100" : "opacity-0")}>
            <div className="flex items-center gap-1.5 border-b border-kai-amber/25 px-2 py-1">
              <span className="text-kai-tan">◆</span>
              <span className="text-[9px] font-bold text-kai-amber">edit_file</span>
              <span className="truncate text-[8.5px] text-kai-muted">internal/wiki/update.go</span>
              <span className="ml-auto shrink-0 text-[8px] text-kai-dim">+3 −1</span>
            </div>
            <div className="space-y-px px-2 py-1 text-[9px] leading-[1.5]">
              <div className="text-kai-rose">− {"  "}mapped := byProvenance(f)</div>
              <div className="text-kai-green">+ {"  "}mapped := byProvenance(f)</div>
              <div className="text-kai-green">+ {"  "}if mapped == "" {"{"}</div>
              <div className="text-kai-green">+ {"    "}mapped = planScope(f)</div>
            </div>
            <div className="flex items-center gap-1.5 border-t border-kai-amber/25 px-2 py-1">
              <span className="rounded-[3px] bg-kai-green/15 px-1.5 py-px text-[8px] text-kai-green">approve ⏎</span>
              <span className="rounded-[3px] border border-border px-1.5 py-px text-[8px] text-kai-muted">reject esc</span>
              <span className="ml-auto text-[7px] text-kai-dim">nothing on disk until you answer</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-sm border border-border bg-card px-2 py-1.5">
          <span className="text-kai-orange">›</span>
          <span className="animate-caret text-[9px] text-kai-dim">▏</span>
          <span className="ml-auto shrink-0 text-[7.5px] text-kai-dim">auto-approve ☐ · shell ☐ · 25 steps</span>
        </div>
      </Body>
      <FileExplorer />
    </>
  )
}

/* ── 02 · research ──────────────────────────────────────────────────────── */

const STEPS = [
  { label: "decompose", detail: "4 sub-questions", ms: 0 },
  { label: "search", detail: "brave · 23 results", ms: 700 },
  { label: "read", detail: "9 pages fetched", ms: 1500 },
  { label: "reason", detail: "synthesising", ms: 2400 },
  { label: "gap-check", detail: "1 gap → re-search", ms: 3200 },
  { label: "report", detail: "saved to .kaioken/research", ms: 4100 },
]

export function ResearchPane({ active }: PaneProps) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!active) { setStep(0); return }
    const timers = STEPS.map((s, i) => window.setTimeout(() => setStep(i + 1), s.ms + 400))
    return () => timers.forEach(window.clearTimeout)
  }, [active])

  return (
    <>
      <Aside label="history">
        <AsideRow active sub="just now">SSE vs websockets for…</AsideRow>
        <AsideRow sub="1 h ago">tauri v2 sidecar signing</AsideRow>
        <AsideRow sub="yesterday">go 1.24 range-over-func</AsideRow>
      </Aside>
      <Body>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-kai-text">how do agent frameworks stream tool calls?</span>
          <span className="ml-auto shrink-0"><Tag tone="amber">×3 power</Tag></span>
        </div>
        <div className="space-y-1">
          {STEPS.map((s, i) => {
            const state = i < step ? "done" : i === step ? "live" : "idle"
            return (
              <div key={s.label} className="flex items-center gap-2">
                <span className={cn("size-1.5 shrink-0 rounded-full", state === "done" && "bg-kai-green", state === "live" && "animate-pulse bg-kai-amber", state === "idle" && "bg-kai-line")} />
                <span className={cn("text-[9px]", state === "idle" ? "text-kai-dim" : "text-kai-text")}>{s.label}</span>
                <span className="truncate text-[8px] text-kai-dim">{s.detail}</span>
                {state === "done" ? <span className="ml-auto shrink-0 text-[8px] text-kai-green">ok</span> : null}
              </div>
            )
          })}
        </div>
        <div className={cn("mt-auto rounded-sm border border-border bg-card p-2 transition-opacity duration-700", step >= STEPS.length ? "opacity-100" : "opacity-30")}>
          <p className="text-[9px] leading-relaxed text-kai-text">Most stream deltas over SSE rather than websockets: the traffic is one-way, it survives proxies, and reconnection is part of the protocol.</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {["html.spec", "mdn/eventsource", "anthropic/streaming", "+6"].map((s) => (<Tag key={s} tone="blue">{s}</Tag>))}
          </div>
        </div>
      </Body>
      <FileExplorer />
    </>
  )
}

/* ── 03 · wiki ─ actual screenshot ──────────────────────────────────────── */

export function WikiPane(_: PaneProps) {
  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <img
        src="/shots/wiki_doc.png"
        alt="Kaioken wiki — Architecture Overview with sequence diagram, nav tree, and table of contents"
        className="size-full object-cover object-left-top"
        loading="lazy"
      />
    </div>
  )
}

/* ── 04 · graph ─ full canvas with filter toolbar ─────────────────────── */




export function GraphPane(_: PaneProps) {
  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <img
        src="/shots/graph.png"
        alt="Kaioken graph — wiki pages (orange) and source files (green) connected by 297 edges"
        className="size-full object-cover object-center"
        loading="lazy"
      />
    </div>
  )
}

/* ── 05 · cards ─────────────────────────────────────────────────────────── */

const MODULES = [
  { name: "kaioken/agent", files: 14, state: "fresh" },
  { name: "kaioken/wiki", files: 22, state: "fresh" },
  { name: "kaioken/tui", files: 18, state: "stale" },
  { name: "kaioken/cmd", files: 9, state: "fresh" },
]
const CARD_FILES = ["overview.md", "architecture.md", "conventions.md", "tech_stack.md"]

export function CardsPane(_: PaneProps) {
  return (
    <>
      <Aside label="modules">
        {MODULES.map((m, i) => (<AsideRow key={m.name} active={i === 0} sub={`${m.files} files · ${m.state}`}>{m.name}</AsideRow>))}
      </Aside>
      <Body>
        <div className="flex items-center gap-2">
          <h4 className="text-[11px] font-bold text-foreground">kaioken/agent</h4>
          <Tag tone="green">fresh</Tag>
          <span className="ml-auto text-[8px] text-kai-dim">hash match · not re-billed</span>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-1.5">
          {CARD_FILES.map((f) => (
            <div key={f} className="rounded-sm border border-border bg-card p-2">
              <p className="text-[9px] font-bold text-kai-amber">{f}</p>
              <div className="mt-1.5 space-y-1">
                {[100, 82, 64].map((w, i) => (<div key={i} className="h-[3px] rounded-full bg-kai-line" style={{ width: `${w}%` }} />))}
              </div>
            </div>
          ))}
        </div>
      </Body>
      <FileExplorer />
    </>
  )
}

/* ── 06 · editor — real code + terminal ─────────────────────────────────── */

const CODE_LINES = [
  { n: 1, tokens: [{ t: "func", c: "text-kai-blue" }, { t: " Load", c: "text-kai-amber" }, { t: "(repo ", c: "text-kai-text" }, { t: "string", c: "text-kai-blue" }, { t: ") (*Config, error) {", c: "text-kai-text" }] },
  { n: 2, tokens: [{ t: "    raw, err := os.ReadFile(Path(repo))", c: "text-kai-text" }] },
  { n: 3, tokens: [{ t: "    ", c: "" }, { t: "if", c: "text-kai-blue" }, { t: " err != ", c: "text-kai-text" }, { t: "nil", c: "text-kai-blue" }, { t: " {", c: "text-kai-text" }] },
  { n: 4, tokens: [{ t: "        ", c: "" }, { t: "if", c: "text-kai-blue" }, { t: " os.IsNotExist(err) {", c: "text-kai-text" }] },
  { n: 5, tokens: [{ t: "            ", c: "" }, { t: "return", c: "text-kai-blue" }, { t: " Default(), ", c: "text-kai-text" }, { t: "nil", c: "text-kai-blue" }] },
  { n: 6, tokens: [{ t: "        }", c: "text-kai-text" }] },
  { n: 7, tokens: [{ t: "        ", c: "" }, { t: "return nil", c: "text-kai-blue" }, { t: ", err", c: "text-kai-text" }] },
  { n: 8, tokens: [{ t: "    }", c: "text-kai-text" }] },
  { n: 9, tokens: [{ t: "    cfg := Default()", c: "text-kai-text" }] },
  { n: 10, tokens: [{ t: "    ", c: "" }, { t: "if", c: "text-kai-blue" }, { t: " err := yaml.Unmarshal(raw, cfg); err != ", c: "text-kai-text" }, { t: "nil", c: "text-kai-blue" }, { t: " {", c: "text-kai-text" }] },
]

export function EditorPane(_: PaneProps) {
  return (
    <Body className="gap-0 p-0">
      {/* tab bar */}
      <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1">
        <span className="rounded-t-sm border-b-2 border-kai-orange px-1.5 py-0.5 text-[8.5px] text-kai-amber">config.go <span className="text-kai-dim">●</span></span>
        <span className="px-1.5 py-0.5 text-[8.5px] text-kai-dim">loop.go</span>
        <span className="px-1.5 py-0.5 text-[8.5px] text-kai-dim">tools.go</span>
        <span className="ml-auto flex items-center gap-1">
          <span className="text-[7px] text-kai-dim">Revert</span>
          <span className="rounded-sm border border-kai-green/40 bg-kai-green/10 px-1 py-px text-[7px] text-kai-green">Save</span>
          <span className="text-[7px] text-kai-dim">Go</span>
        </span>
      </div>

      {/* code */}
      <div className="min-h-0 flex-1 overflow-hidden py-1">
        {CODE_LINES.map((l) => (
          <div key={l.n} className="flex gap-0 text-[8.5px] leading-[1.6]">
            <span className="w-6 shrink-0 text-right text-[8px] text-kai-dim/60">{l.n}</span>
            <span className="ml-2 truncate">
              {l.tokens.map((tok, i) => (<span key={i} className={tok.c}>{tok.t}</span>))}
            </span>
          </div>
        ))}
      </div>

      {/* terminal panel */}
      <div className="border-t border-border bg-black/60 px-2 py-1.5">
        <div className="flex items-center gap-2 border-b border-border/50 pb-1 mb-1">
          <span className="text-[7.5px] tracking-wider text-kai-dim uppercase">Terminal</span>
          <span className="rounded-sm bg-accent px-1 py-px text-[7.5px] text-kai-muted">powershell</span>
          <span className="text-[7.5px] text-kai-dim">+</span>
        </div>
        <p className="text-[8.5px] text-kai-text">PS D:\project\ai_now_know&gt; <span className="text-kai-green">kaioken</span> status</p>
        <p className="text-[8.5px] text-kai-muted">4 modules · 3 fresh · 1 stale (tui) · 263 files indexed</p>
        <p className="text-[8.5px] text-kai-text">PS D:\project\ai_now_know&gt;<span className="animate-caret text-kai-orange"> ▏</span></p>
      </div>
    </Body>
  )
}

/* ── 07 · browser — "Where to?" landing ─────────────────────────────────── */

export function BrowserPane(_: PaneProps) {
  return (
    <Body className="gap-0 p-0">
      {/* tab bar */}
      <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1">
        <span className="rounded-sm bg-accent px-1.5 py-0.5 text-[8.5px] text-kai-muted">⊕ New tab</span>
        <span className="px-1 py-0.5 text-[8.5px] text-kai-dim">+</span>
      </div>
      {/* address bar */}
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1">
        <span className="text-[8px] text-kai-dim">← →</span>
        <span className="flex-1 truncate rounded-sm border border-border bg-card text-center px-1.5 py-0.5 text-[8.5px] text-kai-dim">Search DuckDuckGo or type a URL · Ctrl+L</span>
      </div>
      {/* content */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-start gap-3 overflow-hidden px-3 pt-6">
        <span className="text-kai-orange text-xl">⊕</span>
        <p className="text-[11px] font-bold text-foreground">Where to?</p>
        <p className="text-[8px] text-kai-dim">Search DuckDuckGo or type a URL · Ctrl+L</p>
        <input className="w-full max-w-[200px] rounded-sm border border-border bg-card px-2 py-1 text-center text-[8.5px] text-kai-muted placeholder:text-kai-dim" placeholder="Type a URL" readOnly />

        {/* project links */}
        <div className="w-full max-w-[220px]">
          <p className="mb-1 text-[7.5px] tracking-wider text-kai-dim uppercase">⟡ Project</p>
          <div className="divide-y divide-border rounded-sm border border-border bg-card">
            {[
              { name: "Main website", url: "kaioken.vercel.app" },
              { name: "News", url: "kaioken-news.vercel.app" },
              { name: "Source · GitHub", url: "github.com" },
            ].map((l) => (
              <div key={l.name} className="flex items-center gap-2 px-2 py-1">
                <span className="text-[8.5px] text-kai-text">{l.name}</span>
                <span className="ml-auto text-[7.5px] text-kai-dim">{l.url}</span>
              </div>
            ))}
          </div>
        </div>

        {/* most visited */}
        <div className="w-full max-w-[220px]">
          <p className="mb-1 text-[7.5px] tracking-wider text-kai-dim uppercase">⊕ Most visited</p>
          <div className="divide-y divide-border rounded-sm border border-border bg-card">
            {["youtube.com", "google.com", "kaioken.vercel.app", "kaioken-registry-web.vercel.app", "duckduckgo.com"].map((s) => (
              <div key={s} className="flex items-center px-2 py-1">
                <span className="text-[8.5px] text-kai-muted">{s}</span>
                <span className="ml-auto text-[7px] text-kai-dim">6×</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Body>
  )
}

/* ── 08 · activity — wiki generation + memory + history ──────────────────── */

export function ActivityPane(_: PaneProps) {
  return (
    <Body>
      {/* generate a wiki */}
      <div className="rounded-sm border border-border bg-card p-2.5">
        <div className="flex items-center gap-2">
          <span className="text-kai-orange text-[10px]">◉</span>
          <span className="text-[10px] font-bold text-foreground">Generate a Wiki</span>
        </div>
        <p className="mt-1 text-[8.5px] text-kai-muted">Turn this repository into linked, readable chapters</p>
        <p className="mt-1 text-[8px] text-kai-amber">init → scan → plan → generate → wiki → update ↻</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[8px] text-kai-text">Depth</span>
          <div className="relative flex-1 h-2 rounded-full bg-kai-line overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-[30%] rounded-full bg-kai-orange" />
            <div className="absolute top-1/2 left-[30%] -translate-x-1/2 -translate-y-1/2 size-2.5 rounded-full border-2 border-kai-orange bg-background" />
          </div>
          <span className="text-[9px] font-bold text-kai-amber">×3</span>
          <span className="rounded-sm border border-kai-orange/40 bg-kai-orange/10 px-2 py-0.5 text-[8.5px] text-kai-amber">▶ Start wiki</span>
        </div>
        <div className="mt-1 flex justify-between text-[7px] text-kai-dim">
          <span>×1 fast</span>
          <span>×10 exhaustive</span>
        </div>
      </div>

      {/* token warning */}
      <div className="flex items-center gap-2 rounded-sm border border-kai-amber/30 bg-kai-amber/5 px-2 py-1.5">
        <span className="text-[8px] text-kai-amber">⚠</span>
        <div>
          <p className="text-[8.5px] text-kai-text">109 calls · ~3.16M tokens · heavy run</p>
          <p className="text-[7.5px] text-kai-dim">draft only (×4 adds critique, ×10 adds grounding correction)</p>
        </div>
      </div>

      {/* quick actions */}
      <div className="flex items-center gap-1">
        {["☐ Update", "◉ Cards", "⚡ Skills", "◎ Scan"].map((a, i) => (
          <span key={a} className={cn("rounded-sm border px-1.5 py-0.5 text-[8px]", i === 0 ? "border-border text-kai-text" : "border-border text-kai-dim")}>{a}</span>
        ))}
      </div>

      {/* memory section */}
      <div className="rounded-sm border border-border bg-card p-2">
        <p className="text-[8px] font-bold tracking-wider text-kai-dim uppercase">Memory & Learning</p>
        <p className="mt-1 text-[8px] text-kai-muted">Kaioken remembers what happened in sessions.</p>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {[{ label: "Sessions", val: "1" }, { label: "Learned", val: "0" }, { label: "Reinforced", val: "0" }].map((s) => (
            <div key={s.label} className="rounded-sm border border-border p-1.5">
              <p className="text-[7px] text-kai-muted">{s.label}</p>
              <p className="text-[11px] font-bold text-foreground">{s.val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* history */}
      <div>
        <p className="mb-1 text-[7.5px] tracking-wider text-kai-dim uppercase">History</p>
        {[{ cmd: "Scan", state: "done", time: "27ms" }, { cmd: "Chat", state: "failed", time: "3m 3s" }].map((r) => (
          <div key={r.cmd} className="flex items-center gap-2 border-b border-border/50 py-1">
            <span className="text-[8px] text-kai-dim">▸</span>
            <span className="text-[9px] text-kai-text">{r.cmd}</span>
            <Tag tone={r.state === "done" ? "green" : "rose"}>{r.state}</Tag>
            <span className="ml-auto text-[8px] text-kai-dim">{r.time}</span>
          </div>
        ))}
      </div>
    </Body>
  )
}

/* ── 09 · extensions ────────────────────────────────────────────────────── */

const EXTENSIONS = [
  { name: "terraform-skills", kind: "declarative", tone: "sage" as const, trusted: true, note: "contributes 6 skills · runs no code" },
  { name: "postgres-mcp", kind: "mcp", tone: "amber" as const, trusted: false, note: "wants to add 4 agent tools" },
  { name: "sqlfmt-wasm", kind: "wasm", tone: "blue" as const, trusted: true, note: "sandboxed formatter" },
]

export function ExtensionsPane(_: PaneProps) {
  return (
    <Body>
      <div className="flex items-center gap-2">
        <p className="text-[8px] tracking-[0.18em] text-kai-dim uppercase">installed</p>
        <span className="ml-auto text-[8px] text-kai-dim">registry ↗</span>
      </div>
      {EXTENSIONS.map((e) => (
        <div key={e.name} className="rounded-sm border border-border bg-card px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold text-kai-text">{e.name}</span>
            <Tag tone={e.tone}>{e.kind}</Tag>
            <span className="ml-auto shrink-0">{e.trusted ? <Tag tone="green">trusted</Tag> : <Tag tone="rose">inert · review</Tag>}</span>
          </div>
          <p className="mt-0.5 truncate text-[8px] text-kai-muted">{e.note}</p>
        </div>
      ))}
      <p className="mt-auto text-[7.5px] text-kai-dim">trust is pinned to the exact installed version — an update asks again</p>
    </Body>
  )
}

/* ── 10 · cost ──────────────────────────────────────────────────────────── */

const SPEND = [
  { model: "claude-sonnet-4.5", pct: 100, usd: "$2.41", tone: "bg-kai-orange" },
  { model: "gpt-5-mini", pct: 46, usd: "$1.10", tone: "bg-kai-amber" },
  { model: "deepseek-v3", pct: 18, usd: "$0.44", tone: "bg-kai-tan" },
  { model: "qwen3:8b (local)", pct: 3, usd: "$0", tone: "bg-kai-green" },
]

export function CostPane({ active }: PaneProps) {
  return (
    <Body>
      <div className="flex items-center gap-1">
        {["7d", "30d", "90d"].map((w, i) => (
          <span key={w} className={cn("rounded-sm border px-1.5 py-0.5 text-[8px]", i === 1 ? "border-kai-orange/40 bg-accent text-kai-amber" : "border-border text-kai-dim")}>{w}</span>
        ))}
        <span className="ml-auto text-[8px] text-kai-dim">this workspace ☑</span>
      </div>
      <div className="space-y-2">
        {SPEND.map((s) => (
          <div key={s.model}>
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[9px] text-kai-text">{s.model}</span>
              <span className="ml-auto shrink-0 text-[9px] text-kai-amber">{s.usd}</span>
            </div>
            <div className="mt-1"><Bar pct={s.pct} tone={s.tone} run={active} /></div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-baseline gap-2 border-t border-border pt-1.5">
        <span className="text-[8px] text-kai-dim">30 days · 214 calls</span>
        <span className="ml-auto text-[11px] font-bold text-foreground">$3.95</span>
      </div>
    </Body>
  )
}

/* ── 11 · settings — research engines + providers ─────────────────────── */

const ENGINES = [
  { name: "Brave", key: "sk-br••••7722", status: "green" },
  { name: "Exa", key: "73489••9722", status: "green" },
  { name: "Firecrawl", key: "fc-53••5525", status: "green" },
  { name: "Tavily", key: "tvly-••pAjA", status: "green" },
]

export function SettingsPane(_: PaneProps) {
  return (
    <>
      <Aside label="settings" className="w-[100px]">
        <AsideRow active>Research engines</AsideRow>
        <AsideRow>Workspace</AsideRow>
        <AsideRow>Local models</AsideRow>
        <AsideRow>LLM providers</AsideRow>
        <AsideRow>Appearance</AsideRow>
        <AsideRow>Steering notes</AsideRow>
      </Aside>
      <Body className="gap-2.5">
        <h3 className="flex items-center gap-2 text-[11px] font-bold text-foreground">
          <span className="text-kai-orange">⊕</span> Research engines
        </h3>
        <p className="text-[8.5px] text-kai-muted">Which engine answers research queries. Both asks every vendor with a key and merges results.</p>

        {/* engine tabs */}
        <div className="flex items-center gap-1">
          {["Both", "brave", "exa", "firecrawl", "tavily"].map((t, i) => (
            <span key={t} className={cn("rounded-sm border px-1.5 py-0.5 text-[8px]", i === 0 ? "border-kai-orange/40 bg-kai-orange/10 text-kai-orange" : "border-border text-kai-dim")}>{t}</span>
          ))}
        </div>

        {/* API key rows */}
        <div className="space-y-2">
          {ENGINES.map((e) => (
            <div key={e.name} className="rounded-sm border border-border bg-card p-2">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-kai-text">{e.name}</span>
                <Tag tone="green">✓ {e.key}</Tag>
                <span className="ml-auto text-[7.5px] text-kai-blue">↗ Get a key</span>
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                <span className="flex-1 truncate rounded-sm border border-border bg-background px-1.5 py-0.5 text-[8.5px] text-kai-muted">{e.key}</span>
                <span className="text-[7.5px] text-kai-dim">👁</span>
                <span className="rounded-sm border border-border px-1 py-px text-[7.5px] text-kai-dim">Save</span>
              </div>
            </div>
          ))}
        </div>

        {/* workspace + providers collapsed */}
        <div className="mt-auto space-y-1">
          <div className="flex items-center gap-2 rounded-sm border border-border bg-card px-2 py-1.5">
            <span className="text-[8.5px] text-kai-text">Workspace · cli</span>
            <span className="ml-auto text-[8px] text-kai-dim">nvidia/nemotron-3-super ▸</span>
          </div>
          <div className="flex items-center gap-2 rounded-sm border border-border bg-card px-2 py-1.5">
            <span className="text-[8.5px] text-kai-text">LLM providers</span>
            <span className="ml-auto text-[8px] text-kai-dim">4 configured ▸</span>
          </div>
        </div>
      </Body>
      <FileExplorer />
    </>
  )
}

/* ── 00 · workspaces — stats + repo scan ─────────────────────────────────── */

export function WorkspacesPane(_: PaneProps) {
  return (
    <Body className="items-center gap-3 px-4">
      {/* workspace header */}
      <div className="w-full max-w-[340px]">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-bold text-foreground">cli</h2>
          <Tag tone="dim">⟁ master</Tag>
          <Tag tone="amber">109 uncommitted</Tag>
        </div>
        <p className="mt-0.5 text-[8px] text-kai-dim">D:/project/ai_now_know/cli</p>
      </div>

      {/* stats grid */}
      <div className="grid w-full max-w-[340px] grid-cols-4 gap-1.5">
        {[
          { icon: "◉", label: "Modules", val: "16" },
          { icon: "📖", label: "Wiki Docs", val: "76" },
          { icon: "⚡", label: "Skills", val: "8" },
          { icon: "☐", label: "Sections", val: "12" },
        ].map((s) => (
          <div key={s.label} className="rounded-sm border border-border bg-card p-2">
            <p className="text-[7.5px] text-kai-muted">{s.icon} {s.label}</p>
            <p className="text-[14px] font-bold text-foreground">{s.val}</p>
          </div>
        ))}
      </div>

      {/* repository scan */}
      <div className="w-full max-w-[340px]">
        <div className="flex items-center gap-2">
          <p className="text-[8px] tracking-wider text-kai-dim uppercase">Repository Scan</p>
          <span className="ml-auto text-[7.5px] text-kai-dim">↻ refresh</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[9px] text-kai-text">263 files</span>
          <span className="text-[8px] text-kai-dim">1.9 MB</span>
          <Tag tone="dim">cached</Tag>
        </div>
        {/* language bar */}
        <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full">
          <div className="bg-kai-orange" style={{ width: "78%" }} />
          <div className="bg-kai-amber" style={{ width: "6%" }} />
          <div className="bg-kai-blue" style={{ width: "5%" }} />
          <div className="bg-kai-green" style={{ width: "3%" }} />
          <div className="bg-kai-sage" style={{ width: "8%" }} />
        </div>
        <div className="mt-1 flex flex-wrap gap-2 text-[7.5px]">
          <span className="flex items-center gap-0.5"><span className="size-1 rounded-full bg-kai-orange" /> go 239</span>
          <span className="flex items-center gap-0.5"><span className="size-1 rounded-full bg-kai-amber" /> python 9</span>
          <span className="flex items-center gap-0.5"><span className="size-1 rounded-full bg-kai-blue" /> markdown 6</span>
          <span className="flex items-center gap-0.5"><span className="size-1 rounded-full bg-kai-green" /> mod 2</span>
        </div>
      </div>

      {/* directory listing */}
      <div className="w-full max-w-[340px] rounded-sm border border-border bg-card p-2">
        <div className="space-y-px text-[8px] text-kai-muted font-mono">
          <p>./ (5 files): AGENTS.md, KAIOKEN-settings.json, Makefile, go.mod, go.sum</p>
          <p>cmd/kaioken/ (7 files): ext.go, index.go, main.go, mcp.go, review.go, …</p>
          <p>internal/agent/ (20 files): agent.go, agent_test.go, budget.go, …</p>
          <p>internal/config/ (4 files): config.go, config_test.go, global.go, …</p>
          <p>internal/daemon/ (32 files): daemon.go, handlers_chat.go, …</p>
        </div>
      </div>
    </Body>
  )
}
