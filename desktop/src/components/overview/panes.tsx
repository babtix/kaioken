import { Fragment, useEffect, useState } from "react"
import { useTypewriter } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * CSS recreations of the desktop app's screens, filled with plausible demo
 * data. No daemon, no store, no router — pure presentational components for
 * the overview page.
 */

/* ── shared primitives ──────────────────────────────────────────────────── */

function Aside({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("hidden w-[140px] shrink-0 flex-col gap-1 border-r border-border bg-card/60 p-2 md:flex", className)}>
      <p className="px-1 pb-1 text-[8.5px] tracking-[0.18em] text-kai-dim uppercase">{label}</p>
      {children}
    </div>
  )
}

function AsideRow({ children, active, sub }: { children: React.ReactNode; active?: boolean; sub?: string }) {
  return (
    <div className={cn("rounded-sm px-1.5 py-1 text-[9.5px] leading-tight", active ? "bg-accent text-kai-amber" : "text-kai-muted")}>
      <span className="block truncate">{children}</span>
      {sub ? <span className="mt-0.5 block truncate text-[8px] text-kai-dim">{sub}</span> : null}
    </div>
  )
}

function Body({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex min-w-0 flex-1 flex-col gap-2 overflow-hidden p-3", className)}>{children}</div>
}

function Tag({ children, tone = "dim" }: { children: React.ReactNode; tone?: "dim" | "orange" | "amber" | "green" | "blue" | "sage" | "rose" }) {
  const tones = {
    dim: "border-border text-kai-dim",
    orange: "border-kai-orange/40 text-kai-orange",
    amber: "border-kai-amber/40 text-kai-amber",
    green: "border-kai-green/40 text-kai-green",
    blue: "border-kai-blue/40 text-kai-blue",
    sage: "border-kai-sage/40 text-kai-sage",
    rose: "border-kai-rose/40 text-kai-rose",
  }
  return <span className={cn("rounded-[3px] border px-1 py-px text-[8px] leading-[1.4]", tones[tone])}>{children}</span>
}

function Bar({ pct, tone = "bg-kai-orange", run }: { pct: number; tone?: string; run?: boolean }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-kai-line/70">
      <div className={cn("h-full rounded-full transition-[width] duration-[1400ms] ease-out", tone)} style={{ width: run ? `${pct}%` : "4%" }} />
    </div>
  )
}

interface PaneProps { active: boolean }

/* ── 01 · chat ──────────────────────────────────────────────────────────── */

const TOOL_CALLS = [
  { glyph: "◇", name: "read_file", arg: "src/store/workspace.ts", out: "312 lines" },
  { glyph: "◎", name: "search", arg: '"restoreActive"', out: "8 matches · 4 files" },
]

const REPLY = "The restoreActive function calls the daemon's /v1/workspace/active endpoint on mount, and if the response carries an ID, navigates to /chat automatically — so a page reload never dumps you on the picker."

export function ChatPane({ active }: PaneProps) {
  const typed = useTypewriter(REPLY, active, 18)
  const done = typed.length >= REPLY.length

  return (
    <>
      <Aside label="sessions">
        <div className="mb-1 rounded-sm border border-dashed border-border px-1.5 py-1 text-[9px] text-kai-dim">+ new · Ctrl+N</div>
        <AsideRow active sub="5 turns · just now">why does restoreActive…</AsideRow>
        <AsideRow sub="12 turns · 1 h ago">implement dark mode toggle</AsideRow>
        <AsideRow sub="3 turns · yesterday">fix SSE reconnect leak</AsideRow>
      </Aside>
      <Body>
        <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
          <div className="border-l-2 border-kai-blue pl-2 text-[10.5px] text-kai-text">why does restoreActive navigate to /chat?</div>
          {TOOL_CALLS.map((t) => (
            <div key={t.name} className="flex items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1">
              <span className="text-kai-tan">{t.glyph}</span>
              <span className="text-[9.5px] font-bold text-kai-tan">{t.name}</span>
              <span className="truncate text-[9.5px] text-kai-muted">{t.arg}</span>
              <span className="ml-auto shrink-0 text-[8.5px] text-kai-sage">└ {t.out}</span>
            </div>
          ))}
          <p className="text-[10.5px] leading-relaxed text-kai-text">
            {typed}
            {!done ? <span className="animate-caret text-kai-orange">▌</span> : null}
          </p>
          <div className={cn("rounded-sm border border-kai-amber/35 bg-kai-amber/[0.05] transition-opacity duration-500", done ? "opacity-100" : "opacity-0")}>
            <div className="flex items-center gap-1.5 border-b border-kai-amber/25 px-2 py-1">
              <span className="text-kai-tan">◆</span>
              <span className="text-[9.5px] font-bold text-kai-amber">edit_file</span>
              <span className="truncate text-[9px] text-kai-muted">src/store/workspace.ts</span>
              <span className="ml-auto shrink-0 text-[8.5px] text-kai-dim">+5 −2</span>
            </div>
            <div className="space-y-px px-2 py-1.5 text-[9.5px] leading-[1.5]">
              <div className="text-kai-rose">− {"  "}if (res.id) navigate("/chat")</div>
              <div className="text-kai-green">+ {"  "}if (res.id) {"{"}</div>
              <div className="text-kai-green">+ {"    "}setActive(res)</div>
              <div className="text-kai-green">+ {"    "}navigate("/chat")</div>
              <div className="text-kai-green">+ {"  "}{"}"}</div>
            </div>
            <div className="flex items-center gap-1.5 border-t border-kai-amber/25 px-2 py-1">
              <span className="rounded-[3px] bg-kai-green/15 px-1.5 py-px text-[8.5px] text-kai-green">approve ⏎</span>
              <span className="rounded-[3px] border border-border px-1.5 py-px text-[8.5px] text-kai-muted">reject esc</span>
              <span className="ml-auto text-[8px] text-kai-dim">nothing on disk until you answer</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-sm border border-border bg-card px-2 py-1.5">
          <span className="text-kai-orange">›</span>
          <span className="animate-caret text-[10px] text-kai-dim">▏</span>
          <span className="ml-auto shrink-0 text-[8px] text-kai-dim">auto-approve ☐ · shell ☐ · 30 steps</span>
        </div>
      </Body>
    </>
  )
}

/* ── 02 · research ──────────────────────────────────────────────────────── */

const STEPS = [
  { label: "decompose", detail: "3 sub-questions", ms: 0 },
  { label: "search", detail: "brave · 19 results", ms: 700 },
  { label: "read", detail: "7 pages fetched", ms: 1500 },
  { label: "reason", detail: "synthesising", ms: 2400 },
  { label: "gap-check", detail: "0 gaps", ms: 3200 },
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
        <AsideRow active sub="just now">best Go error handling…</AsideRow>
        <AsideRow sub="2 h ago">tauri v2 vs electron</AsideRow>
        <AsideRow sub="yesterday">zustand vs jotai tradeoffs</AsideRow>
      </Aside>
      <Body>
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] text-kai-text">what is the best Go error handling pattern for CLI tools?</span>
          <span className="ml-auto shrink-0"><Tag tone="amber">×3 power</Tag></span>
        </div>
        <div className="space-y-1">
          {STEPS.map((s, i) => {
            const state = i < step ? "done" : i === step ? "live" : "idle"
            return (
              <div key={s.label} className="flex items-center gap-2">
                <span className={cn("size-1.5 shrink-0 rounded-full", state === "done" && "bg-kai-green", state === "live" && "animate-pulse bg-kai-amber", state === "idle" && "bg-kai-line")} />
                <span className={cn("text-[9.5px]", state === "idle" ? "text-kai-dim" : "text-kai-text")}>{s.label}</span>
                <span className="truncate text-[8.5px] text-kai-dim">{s.detail}</span>
                {state === "done" ? <span className="ml-auto shrink-0 text-[8.5px] text-kai-green">ok</span> : null}
              </div>
            )
          })}
        </div>
        <div className={cn("mt-auto rounded-sm border border-border bg-card p-2 transition-opacity duration-700", step >= STEPS.length ? "opacity-100" : "opacity-30")}>
          <p className="text-[9.5px] leading-relaxed text-kai-text">
            The consensus favours sentinel errors with fmt.Errorf wrapping for context, and a top-level error handler in main() that maps typed errors to exit codes.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {["go.dev/blog", "dave.cheney.net", "pkg.go.dev/errors", "+4"].map((s) => (
              <Tag key={s} tone="blue">{s}</Tag>
            ))}
          </div>
        </div>
      </Body>
    </>
  )
}

/* ── 03 · wiki ──────────────────────────────────────────────────────────── */

const WIKI_TREE = [
  { label: "Architecture Overview", depth: 0 },
  { label: "Chat Agent", depth: 0 },
  { label: "Agent Core Loop", depth: 1, active: true },
  { label: "LLM Interaction", depth: 1 },
  { label: "Knowledge Engine", depth: 0 },
  { label: "Code Mapping", depth: 0 },
  { label: "Git Integration", depth: 0 },
]

export function WikiPane(_: PaneProps) {
  return (
    <>
      <Aside label="11 sections">
        {WIKI_TREE.map((n) => (
          <div key={n.label} className={cn("truncate rounded-sm py-0.5 text-[9px]", n.depth ? "pl-3" : "pl-1.5", n.active ? "bg-accent text-kai-amber" : "text-kai-muted")}>
            {n.depth ? "└ " : ""}{n.label}
          </div>
        ))}
      </Aside>
      <Body className="gap-1.5">
        <div className="flex items-baseline gap-2">
          <h4 className="text-[13px] font-bold text-foreground">Agent Core Loop</h4>
          <span className="text-[8.5px] text-kai-dim">·3 revisions</span>
        </div>
        <p className="text-[9.5px] leading-relaxed text-kai-muted">
          The loop is a bounded recursion: send the transcript, read the reply, execute any tool
          calls the model asked for, append the results, and go again until the model answers
          without calling a tool or the step budget runs out.
        </p>
        <div className="rounded-sm border border-border bg-card p-2">
          <div className="flex items-center justify-center gap-1.5">
            {["prompt", "model", "tools"].map((n, i) => (
              <Fragment key={n}>
                {i > 0 ? <span className="text-[9px] text-kai-dim">→</span> : null}
                <span className="rounded-sm border border-kai-orange/35 bg-kai-orange/10 px-1.5 py-0.5 text-[8.5px] text-kai-amber">{n}</span>
              </Fragment>
            ))}
            <span className="text-[9px] text-kai-dim">↺</span>
          </div>
        </div>
        <div className="space-y-1 rounded-sm border border-border bg-card px-2 py-1.5">
          <p className="text-[8px] tracking-[0.18em] text-kai-dim uppercase">sources</p>
          {["internal/agent/loop.go:118-204", "internal/agent/tools.go:41-96"].map((s) => (
            <p key={s} className="truncate text-[8.5px] text-kai-sage">{s}</p>
          ))}
        </div>
      </Body>
    </>
  )
}

/* ── 04 · graph ─────────────────────────────────────────────────────────── */

const NODES = [
  { id: "arch", x: 50, y: 28, r: 5.5, kind: "page", label: "Architecture" },
  { id: "chat", x: 26, y: 50, r: 4.5, kind: "page", label: "Chat Agent" },
  { id: "know", x: 74, y: 50, r: 4.5, kind: "page", label: "Knowledge" },
  { id: "tui", x: 50, y: 72, r: 4, kind: "page", label: "TUI" },
  { id: "f1", x: 12, y: 32, r: 2.5, kind: "file", label: "loop.go" },
  { id: "f2", x: 14, y: 70, r: 2.5, kind: "file", label: "tools.go" },
  { id: "f3", x: 88, y: 32, r: 2.5, kind: "file", label: "wiki.go" },
  { id: "f4", x: 90, y: 68, r: 2.5, kind: "file", label: "cards.go" },
  { id: "f5", x: 36, y: 88, r: 2.5, kind: "file", label: "tui.go" },
  { id: "f6", x: 66, y: 88, r: 2.5, kind: "file", label: "keys.go" },
  { id: "f7", x: 50, y: 10, r: 2.5, kind: "file", label: "main.go" },
] as const

const EDGES: [string, string][] = [
  ["arch", "chat"], ["arch", "know"], ["arch", "tui"], ["arch", "f7"],
  ["chat", "f1"], ["chat", "f2"], ["chat", "tui"],
  ["know", "f3"], ["know", "f4"], ["know", "arch"],
  ["tui", "f5"], ["tui", "f6"],
]

const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]))

export function GraphPane({ active }: PaneProps) {
  return (
    <Body className="gap-2 p-2">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-sm border border-border bg-card">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="size-full">
          {EDGES.map(([a, b]) => {
            const na = NODE_BY_ID[a]; const nb = NODE_BY_ID[b]
            return <line key={`${a}-${b}`} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} stroke="currentColor" strokeWidth={0.35} className={cn("text-kai-line transition-opacity duration-1000", active ? "opacity-100" : "opacity-0")} />
          })}
          {NODES.map((n, i) => (
            <circle key={n.id} cx={n.x} cy={n.y} r={n.r} className={cn("transition-opacity duration-700", n.kind === "page" ? "fill-kai-orange" : "fill-kai-sage", active ? "opacity-90" : "opacity-0")} style={{ transitionDelay: `${i * 55}ms` }} />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0">
          {NODES.filter((n) => n.kind === "page").map((n) => (
            <span key={n.id} className="absolute -translate-x-1/2 text-[8px] whitespace-nowrap text-kai-amber" style={{ left: `${n.x}%`, top: `calc(${n.y}% + 8px)` }}>{n.label}</span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[8.5px] text-kai-dim">
        <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-kai-orange" /> wiki page</span>
        <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-kai-sage" /> repo file</span>
        <span className="ml-auto">ctrl+click focuses a neighbourhood</span>
      </div>
    </Body>
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
        {MODULES.map((m, i) => (
          <AsideRow key={m.name} active={i === 0} sub={`${m.files} files · ${m.state}`}>{m.name}</AsideRow>
        ))}
      </Aside>
      <Body>
        <div className="flex items-center gap-2">
          <h4 className="text-[12px] font-bold text-foreground">kaioken/agent</h4>
          <Tag tone="green">fresh</Tag>
          <span className="ml-auto text-[8.5px] text-kai-dim">hash match · not re-billed</span>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-1.5">
          {CARD_FILES.map((f) => (
            <div key={f} className="rounded-sm border border-border bg-card p-2">
              <p className="text-[9.5px] font-bold text-kai-amber">{f}</p>
              <div className="mt-1.5 space-y-1">
                {[100, 82, 64].map((w, i) => (
                  <div key={i} className="h-[3px] rounded-full bg-kai-line" style={{ width: `${w}%` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Body>
    </>
  )
}

/* ── 06 · editor ────────────────────────────────────────────────────────── */

const YAML_LINES = [
  { n: 1, t: "modules:", c: "text-kai-blue" },
  { n: 2, t: "  - id: kaioken/agent", c: "text-kai-text" },
  { n: 3, t: "    scope:", c: "text-kai-text" },
  { n: 4, t: "      - internal/agent/**", c: "text-kai-green" },
  { n: 5, t: "      - internal/llm/**", c: "text-kai-green" },
  { n: 6, t: "  - id: kaioken/wiki", c: "text-kai-text" },
  { n: 7, t: "    scope:", c: "text-kai-text" },
  { n: 8, t: "      - internal/wiki/**", c: "text-kai-green" },
]

export function EditorPane(_: PaneProps) {
  return (
    <Body className="gap-0 p-0">
      <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1">
        <span className="rounded-t-sm border-b-2 border-kai-orange px-1.5 py-0.5 text-[9px] text-kai-amber">modules.yaml</span>
        <span className="px-1.5 py-0.5 text-[9px] text-kai-dim">wiki_plan.yaml</span>
        <span className="px-1.5 py-0.5 text-[9px] text-kai-dim">config.yaml</span>
        <span className="ml-auto text-[8px] text-kai-dim">ctrl+s</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-2 py-1.5">
        {YAML_LINES.map((l) => (
          <div key={l.n} className="flex gap-2 text-[9.5px] leading-[1.55]">
            <span className="w-3 shrink-0 text-right text-kai-dim">{l.n}</span>
            <span className={cn("truncate", l.c)}>{l.t}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-border bg-black/60 px-2 py-1.5">
        <div className="flex items-center gap-1.5 pb-1">
          <span className="text-[8px] tracking-[0.18em] text-kai-dim uppercase">terminal</span>
          <span className="text-[8px] text-kai-dim">ctrl+`</span>
        </div>
        <p className="text-[9px] text-kai-text"><span className="text-kai-green">$</span> kaioken status</p>
        <p className="text-[9px] text-kai-muted">4 modules · 3 fresh · 1 stale (tui)</p>
        <p className="text-[9px] text-kai-text"><span className="text-kai-green">$</span><span className="animate-caret text-kai-orange"> ▏</span></p>
      </div>
    </Body>
  )
}

/* ── 07 · browser ───────────────────────────────────────────────────────── */

export function BrowserPane(_: PaneProps) {
  return (
    <Body className="gap-0 p-0">
      <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1">
        {["kaioken wiki", "registry", "+"].map((t, i) => (
          <span key={t} className={cn("rounded-sm px-1.5 py-0.5 text-[9px]", i === 0 ? "bg-accent text-kai-amber" : "text-kai-dim")}>{t}</span>
        ))}
      </div>
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1">
        <span className="text-[9px] text-kai-dim">←</span>
        <span className="text-[9px] text-kai-dim">→</span>
        <span className="flex-1 truncate rounded-sm border border-border bg-card px-1.5 py-0.5 text-[9px] text-kai-muted">127.0.0.1:8080/wiki/Architecture</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 p-3">
        <p className="text-[8px] tracking-[0.18em] text-kai-dim uppercase">top sites</p>
        <div className="grid grid-cols-3 gap-1.5">
          {["kaioken.dev", "registry", "openrouter", "news", "github", "docs"].map((s) => (
            <div key={s} className="rounded-sm border border-border bg-card px-2 py-2 text-center text-[9px] text-kai-muted">{s}</div>
          ))}
        </div>
      </div>
    </Body>
  )
}

/* ── 08 · activity ──────────────────────────────────────────────────────── */

const RUNS = [
  { cmd: "wiki ×3", detail: "section 7/11 · Git Integration", pct: 64, tone: "bg-kai-orange", state: "running" },
  { cmd: "skills", detail: "6/9 generated", pct: 72, tone: "bg-kai-amber", state: "running" },
  { cmd: "generate", detail: "4 modules · 0 re-billed", pct: 100, tone: "bg-kai-green", state: "done" },
  { cmd: "scan", detail: "1,284 files · 12.8k lines", pct: 100, tone: "bg-kai-green", state: "done" },
]

export function ActivityPane({ active }: PaneProps) {
  return (
    <Body>
      <div className="flex items-center gap-2">
        <p className="text-[8.5px] tracking-[0.18em] text-kai-dim uppercase">runs</p>
        <Tag tone="orange">2 live</Tag>
      </div>
      <div className="space-y-2">
        {RUNS.map((r) => (
          <div key={r.cmd} className="rounded-sm border border-border bg-card px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", r.state === "running" ? "animate-pulse bg-kai-orange" : "bg-kai-green")} />
              <span className="text-[9.5px] font-bold text-kai-text">{r.cmd}</span>
              <span className="truncate text-[8.5px] text-kai-muted">{r.detail}</span>
              <span className="ml-auto shrink-0 text-[8.5px] text-kai-dim">{r.pct}%</span>
            </div>
            <div className="mt-1.5"><Bar pct={r.pct} tone={r.tone} run={active} /></div>
          </div>
        ))}
      </div>
      <p className="mt-auto text-[8px] text-kai-dim">streamed over SSE from the daemon · cancel any run without killing the others</p>
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
        <p className="text-[8.5px] tracking-[0.18em] text-kai-dim uppercase">installed</p>
        <span className="ml-auto text-[8.5px] text-kai-dim">registry ↗</span>
      </div>
      {EXTENSIONS.map((e) => (
        <div key={e.name} className="rounded-sm border border-border bg-card px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[9.5px] font-bold text-kai-text">{e.name}</span>
            <Tag tone={e.tone}>{e.kind}</Tag>
            <span className="ml-auto shrink-0">{e.trusted ? <Tag tone="green">trusted</Tag> : <Tag tone="rose">inert · review</Tag>}</span>
          </div>
          <p className="mt-0.5 truncate text-[8.5px] text-kai-muted">{e.note}</p>
        </div>
      ))}
      <p className="mt-auto text-[8px] text-kai-dim">trust is pinned to the exact installed version — an update asks again</p>
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
          <span key={w} className={cn("rounded-sm border px-1.5 py-0.5 text-[8.5px]", i === 1 ? "border-kai-orange/40 bg-accent text-kai-amber" : "border-border text-kai-dim")}>{w}</span>
        ))}
        <span className="ml-auto text-[8.5px] text-kai-dim">this workspace ☑</span>
      </div>
      <div className="space-y-2">
        {SPEND.map((s) => (
          <div key={s.model}>
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[9.5px] text-kai-text">{s.model}</span>
              <span className="ml-auto shrink-0 text-[9.5px] text-kai-amber">{s.usd}</span>
            </div>
            <div className="mt-1"><Bar pct={s.pct} tone={s.tone} run={active} /></div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-baseline gap-2 border-t border-border pt-1.5">
        <span className="text-[8.5px] text-kai-dim">30 days · 214 calls</span>
        <span className="ml-auto text-[11px] font-bold text-foreground">$3.95</span>
      </div>
    </Body>
  )
}

/* ── 11 · settings ──────────────────────────────────────────────────────── */

const SETTINGS_ROWS = [
  { k: "provider", v: "anthropic", tone: "text-kai-blue" },
  { k: "model", v: "claude-sonnet-4.5", tone: "text-kai-blue" },
  { k: "api key", v: "sk-ant-••••••••••••", tone: "text-kai-dim" },
  { k: "search", v: "brave", tone: "text-kai-blue" },
  { k: "multiplier", v: "×3", tone: "text-kai-amber" },
  { k: "theme", v: "dark", tone: "text-kai-blue" },
]

export function SettingsPane(_: PaneProps) {
  return (
    <>
      <Aside label="settings">
        <AsideRow active>Provider</AsideRow>
        <AsideRow>Local models</AsideRow>
        <AsideRow>Search</AsideRow>
        <AsideRow>Steering notes</AsideRow>
        <AsideRow>Appearance</AsideRow>
      </Aside>
      <Body>
        <p className="text-[8.5px] tracking-[0.18em] text-kai-dim uppercase">~/.kaioken/config.yaml</p>
        <div className="divide-y divide-border rounded-sm border border-border bg-card">
          {SETTINGS_ROWS.map((r) => (
            <div key={r.k} className="flex items-center gap-2 px-2 py-1.5">
              <span className="text-[9.5px] text-kai-muted">{r.k}</span>
              <span className={cn("ml-auto truncate text-[9.5px]", r.tone)}>{r.v}</span>
            </div>
          ))}
        </div>
        <p className="mt-auto text-[8px] text-kai-dim">the same file the CLI reads — change it here, the terminal sees it</p>
      </Body>
    </>
  )
}

/* ── 00 · workspaces (top rail item) ────────────────────────────────────── */

const RECENTS = [
  { name: "ai_now_know", path: "D:/project/ai_now_know", when: "2 min ago" },
  { name: "medcore", path: "D:/xii/medcore", when: "yesterday" },
  { name: "old-thing", path: "D:/tmp/old-thing", when: "missing", missing: true },
]

export function WorkspacesPane(_: PaneProps) {
  return (
    <Body className="items-center justify-center gap-3">
      <p className="text-[10px] text-kai-muted">open a repository to get started</p>
      <span className="rounded-sm border border-kai-orange/40 bg-kai-orange/10 px-3 py-1 text-[9.5px] text-kai-amber">Open folder… Ctrl+O</span>
      <div className="w-full max-w-[300px] space-y-1">
        <p className="text-[8px] tracking-[0.18em] text-kai-dim uppercase">recent</p>
        {RECENTS.map((r) => (
          <div key={r.path} className={cn("flex items-baseline gap-2 rounded-sm border border-border px-2 py-1", r.missing && "opacity-40")}>
            <span className="text-[9.5px] text-kai-text">▸ {r.name}</span>
            <span className="truncate text-[8.5px] text-kai-dim">{r.path}</span>
            <span className="ml-auto shrink-0 text-[8px] text-kai-dim">{r.missing ? "✕" : r.when}</span>
          </div>
        ))}
      </div>
      <p className="text-[8px] text-kai-dim">or drop a folder onto the window</p>
    </Body>
  )
}
