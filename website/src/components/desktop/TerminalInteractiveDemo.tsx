import * as React from "react"
import { Play, RotateCcw, Check, X, Terminal, Cpu, BookOpen, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

type DemoScenario = "agent" | "ast" | "wiki"

interface AgentStep {
  kind: "user" | "tool" | "toolres" | "assistant" | "diff" | "prompt" | "success" | "meta"
  text: string
  detail?: string
  diffBefore?: string
  diffAfter?: string
  hold?: number
}

const AGENT_SCENARIO: AgentStep[] = [
  { kind: "user", text: "› wrap the validate error in internal/api/handler.go", hold: 500 },
  { kind: "tool", text: "● read_knowledge  skills/error-handling-standards", detail: "Matched 1 repository rule", hold: 300 },
  { kind: "toolres", text: "  ↳ convention: wrap internal errors with fmt.Errorf(\"...: %w\", err)", hold: 250 },
  { kind: "tool", text: "● read_file  internal/api/handler.go", detail: "Parsed 148 lines via tree-sitter", hold: 300 },
  { kind: "toolres", text: "  ↳ AST resolved: Handler.ServeHTTP (line 42-89), 4 symbols in scope", hold: 250 },
  {
    kind: "assistant",
    text: "The bare return drops the underlying error context. Wrapping with fmt.Errorf ensures errors.Is() and errors.As() function correctly across the API boundary.",
    hold: 400,
  },
  {
    kind: "diff",
    text: "● proposed edit: internal/api/handler.go",
    diffBefore: "-       return nil",
    diffAfter: '+       return fmt.Errorf("validate request: %w", err)',
    hold: 600,
  },
  { kind: "prompt", text: "apply edit → internal/api/handler.go ? [y] yes   [n] no", hold: 1200 },
  { kind: "success", text: "✓ applied edit · 1 file changed · AST syntax validated (0 errors)", hold: 400 },
  { kind: "meta", text: "  ↑↓ history · / commands · ctrl+c cancel · grounded in tree-sitter AST", hold: 200 },
]

const AST_SCENARIO: AgentStep[] = [
  { kind: "user", text: "› kaioken index . --verify-symbols", hold: 400 },
  { kind: "tool", text: "● tree-sitter  walking repository ASTs (Go 1.24)", detail: "1,284 source files parsed", hold: 350 },
  { kind: "toolres", text: "  ↳ parsed 8,412 symbols in 184ms (0 syntax errors)", hold: 300 },
  { kind: "tool", text: "● sha256_lattice  generating cryptographic symbol graph", hold: 300 },
  { kind: "toolres", text: "  ↳ hash root: 8f92a10c7e2b... (lattice depth: 14 layers)", hold: 250 },
  {
    kind: "assistant",
    text: "Symbol graph intact. 0 unreachable declarations. Cross-module imports match go.mod constraints.",
    hold: 400,
  },
  { kind: "success", text: "✓ codemap synced → .kaioken/index.db (14.2 MB) · Zero hallucination lock active", hold: 400 },
  { kind: "meta", text: "  ready for autonomous agent queries · instant sub-millisecond lookups", hold: 200 },
]

const WIKI_SCENARIO: AgentStep[] = [
  { kind: "user", text: "› kaioken wiki --depth=x3", hold: 400 },
  { kind: "tool", text: "● planner  partitioning codemap into 12 architecture chapters", hold: 350 },
  { kind: "toolres", text: "  ↳ 75 target documents planned across scope", hold: 250 },
  { kind: "tool", text: "● pass_1_draft  synthesizing module decomposition specs", hold: 400 },
  { kind: "toolres", text: "  ↳ 137k words generated with inline symbol citations", hold: 300 },
  { kind: "tool", text: "● pass_2_verify  validating symbol references against AST index", hold: 350 },
  { kind: "toolres", text: "  ↳ 100% of symbols grounded (0 hallucinated function names)", hold: 250 },
  { kind: "tool", text: "● pass_3_diagrams  compiling 28 Mermaid state & sequence diagrams", hold: 300 },
  { kind: "success", text: "✓ wiki built → .kaioken/wiki/ · 75 documents verified", hold: 400 },
  { kind: "meta", text: "  serve locally with: kaioken serve · full-text search indexed", hold: 200 },
]

export default function TerminalInteractiveDemo() {
  const [scenario, setScenario] = React.useState<DemoScenario>("agent")
  const [stepIndex, setStepIndex] = React.useState(0)
  const [isPlaying, setIsPlaying] = React.useState(true)
  const [userDecision, setUserDecision] = React.useState<"approved" | "rejected" | null>(null)

  const steps = React.useMemo(() => {
    switch (scenario) {
      case "ast":
        return AST_SCENARIO
      case "wiki":
        return WIKI_SCENARIO
      case "agent":
      default:
        return AGENT_SCENARIO
    }
  }, [scenario])

  // Reset when scenario changes
  React.useEffect(() => {
    setStepIndex(0)
    setUserDecision(null)
    setIsPlaying(true)
  }, [scenario])

  // Playback timer
  React.useEffect(() => {
    if (!isPlaying) return
    if (stepIndex >= steps.length) return

    const currentStep = steps[stepIndex]
    const timer = setTimeout(() => {
      setStepIndex((prev) => prev + 1)
    }, currentStep.hold ?? 350)

    return () => clearTimeout(timer)
  }, [isPlaying, stepIndex, steps])

  const handleRestart = () => {
    setStepIndex(0)
    setUserDecision(null)
    setIsPlaying(true)
  }

  const handleApprove = () => {
    setUserDecision("approved")
    setStepIndex(steps.length)
  }

  const handleReject = () => {
    setUserDecision("rejected")
  }

  return (
    <div className="overflow-hidden rounded-sm border border-[var(--rule)] bg-[var(--bg-sunk)] shadow-2xl">
      {/* Top Bar with scenario switcher */}
      <div className="flex flex-wrap items-center justify-between border-b border-[var(--rule)] bg-[var(--bg-raise)] px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-[1px] bg-[var(--accent)]" />
          <span className="size-2.5 rounded-[1px] bg-[var(--ember)]" />
          <span className="size-2.5 rounded-[1px] bg-emerald-500" />
          <span className="ml-2 font-mono text-[11px] font-semibold text-[var(--fg)]">
            kaioken v2.0.0
          </span>
          <span className="hidden font-mono text-[10px] text-[var(--fg-mute)] sm:inline">
            — interactive runtime
          </span>
        </div>

        {/* Scenario Tabs */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setScenario("agent")}
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer",
              scenario === "agent"
                ? "bg-[var(--accent)] text-white font-semibold"
                : "text-[var(--fg-mute)] hover:bg-[var(--bg-raise-2)] hover:text-[var(--fg)]"
            )}
          >
            <Terminal className="size-3" />
            <span>ask & diff</span>
          </button>
          <button
            type="button"
            onClick={() => setScenario("ast")}
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer",
              scenario === "ast"
                ? "bg-[var(--accent)] text-white font-semibold"
                : "text-[var(--fg-mute)] hover:bg-[var(--bg-raise-2)] hover:text-[var(--fg)]"
            )}
          >
            <Cpu className="size-3" />
            <span>ast index</span>
          </button>
          <button
            type="button"
            onClick={() => setScenario("wiki")}
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer",
              scenario === "wiki"
                ? "bg-[var(--accent)] text-white font-semibold"
                : "text-[var(--fg-mute)] hover:bg-[var(--bg-raise-2)] hover:text-[var(--fg)]"
            )}
          >
            <BookOpen className="size-3" />
            <span>wiki synthesis</span>
          </button>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="relative min-h-[320px] p-4 sm:p-6 font-mono text-[12px] sm:text-[13px] leading-relaxed">
        <div className="space-y-2">
          {steps.slice(0, stepIndex + 1).map((step, idx) => {
            if (step.kind === "user") {
              return (
                <div key={idx} className="font-semibold text-[var(--fg)]">
                  {step.text}
                </div>
              )
            }
            if (step.kind === "tool") {
              return (
                <div key={idx} className="flex items-baseline gap-2 text-[var(--ember)]">
                  <span>{step.text}</span>
                  {step.detail && (
                    <span className="text-[11px] text-[var(--fg-mute)]">[{step.detail}]</span>
                  )}
                </div>
              )
            }
            if (step.kind === "toolres") {
              return (
                <div key={idx} className="pl-2 text-emerald-400">
                  {step.text}
                </div>
              )
            }
            if (step.kind === "assistant") {
              return (
                <div key={idx} className="my-2 border-l-2 border-[var(--accent)] bg-[var(--accent-soft)] p-2.5 text-[var(--fg)] text-[12.5px] leading-normal">
                  {step.text}
                </div>
              )
            }
            if (step.kind === "diff") {
              return (
                <div key={idx} className="my-2 rounded-sm border border-[var(--rule)] bg-[var(--bg-raise)] p-3 text-[12px]">
                  <div className="text-[var(--fg-mute)] mb-1 font-semibold">{step.text}</div>
                  {step.diffBefore && (
                    <div className="text-red-400 bg-red-950/30 px-2 py-1 rounded-sm">
                      {step.diffBefore}
                    </div>
                  )}
                  {step.diffAfter && (
                    <div className="text-emerald-400 bg-emerald-950/30 px-2 py-1 rounded-sm mt-1">
                      {step.diffAfter}
                    </div>
                  )}
                </div>
              )
            }
            if (step.kind === "prompt") {
              return (
                <div key={idx} className="my-3 flex flex-wrap items-center gap-3 rounded-sm border border-[var(--ember)]/40 bg-[var(--ember-soft)] p-3 text-[var(--ember)]">
                  <span className="font-bold">{step.text}</span>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={userDecision !== null}
                      className={cn(
                        "flex items-center gap-1 rounded-sm px-2.5 py-1 font-mono text-[11px] font-bold transition-all cursor-pointer",
                        userDecision === "approved"
                          ? "bg-emerald-600 text-white"
                          : "bg-[var(--accent)] text-white hover:bg-[var(--accent-hov)]"
                      )}
                    >
                      <Check className="size-3" />
                      [y] approve
                    </button>
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={userDecision !== null}
                      className={cn(
                        "flex items-center gap-1 rounded-sm border border-[var(--rule)] bg-[var(--bg-raise)] px-2.5 py-1 font-mono text-[11px] text-[var(--fg)] transition-all hover:bg-[var(--bg-raise-2)] cursor-pointer",
                        userDecision === "rejected" && "bg-red-900/60 text-white"
                      )}
                    >
                      <X className="size-3" />
                      [n] reject
                    </button>
                  </div>
                </div>
              )
            }
            if (step.kind === "success") {
              if (userDecision === "rejected") {
                return (
                  <div key={idx} className="text-red-400 font-bold">
                    ✕ edit rejected by user · repository unchanged
                  </div>
                )
              }
              return (
                <div key={idx} className="text-emerald-400 font-bold">
                  {step.text}
                </div>
              )
            }
            if (step.kind === "meta") {
              return (
                <div key={idx} className="mt-3 pt-2 border-t border-[var(--rule)] text-[11px] text-[var(--fg-mute)]">
                  {step.text}
                </div>
              )
            }
            return null
          })}

          {/* Active blinking caret */}
          {stepIndex < steps.length && (
            <div className="flex items-center gap-1.5 text-[var(--accent)]">
              <span>❯</span>
              <span className="inline-block h-3.5 w-1.5 animate-pulse bg-[var(--accent)]" />
            </div>
          )}
        </div>
      </div>

      {/* Telemetry & Control Footer */}
      <div className="flex flex-wrap items-center justify-between border-t border-[var(--rule)] bg-[var(--bg-raise)] px-4 py-2.5 text-[11px] font-mono">
        <div className="flex items-center gap-4 text-[var(--fg-mute)]">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-emerald-400" />
            <span className="text-[var(--fg)] font-semibold">AST Grounded</span>: 100%
          </span>
          <span className="hidden sm:inline">
            Tokens: <span className="text-[var(--ember)]">1,420</span>
          </span>
          <span className="hidden md:inline">
            Lattice SHA: <span className="text-[var(--fg)]">8f92a10c</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className="flex items-center gap-1 rounded-sm border border-[var(--rule)] bg-[var(--bg)] px-2 py-0.5 text-[var(--fg)] hover:border-[var(--accent)] cursor-pointer"
          >
            <Play className="size-2.5" />
            {isPlaying && stepIndex < steps.length ? "pause" : "resume"}
          </button>
          <button
            type="button"
            onClick={handleRestart}
            className="flex items-center gap-1 rounded-sm border border-[var(--rule)] bg-[var(--bg)] px-2 py-0.5 text-[var(--fg)] hover:border-[var(--accent)] cursor-pointer"
          >
            <RotateCcw className="size-2.5" />
            restart
          </button>
        </div>
      </div>
    </div>
  )
}
