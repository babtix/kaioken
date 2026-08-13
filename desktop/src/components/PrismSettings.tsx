import { useEffect, useState } from "react"
import {
  Check,
  ShieldCheck,
  Sparkles,
  Cpu,
  Layers,
  TriangleAlert,
  Copy,
  Terminal,
  X,
  Zap,
} from "lucide-react"

import { api } from "@/lib/api"
import type { PrismSettings as PrismSettingsType } from "@/lib/types"
import { Badge, Button, Card, Modal, Spinner } from "@/components/ui"
import { SectionLabel } from "@/components/hud"
import { PrismIcon } from "@/components/common/PrismIcon"
import { useToastStore } from "@/store/toast"
import { cn } from "@/lib/utils"

// Every knob the PRISM engine reads, in one place, with the consequence of
// each one stated. Two of them decide what an answer is worth rather than how
// fast it arrives, so they lead:
//
//   - an embedding model turns on the semantic half of retrieval
//   - a utility model turns on the relevance gate, which is what lets the
//     engine answer "nothing here answers that" instead of returning its
//     least-bad match
//
// Both are blank by default and blank is a working configuration, not a
// half-finished one — so the copy says what is lost rather than nagging.

const EMBEDDING_OPTIONS = [
  {
    id: "nomic-embed-text",
    name: "nomic-embed-text",
    tag: "Recommended",
    badgeTone: "green" as const,
    provider: "ollama",
    size: "274 MB",
    desc: "Fastest 8k context embedding model for local RAG.",
    isLocal: true,
  },
  {
    id: "mxbai-embed-large",
    name: "mxbai-embed-large",
    tag: "High Accuracy",
    badgeTone: "neutral" as const,
    provider: "ollama",
    size: "670 MB",
    desc: "State-of-the-art retrieval depth for complex docs.",
    isLocal: true,
  },
  {
    id: "bge-m3",
    name: "bge-m3",
    tag: "Multilingual",
    badgeTone: "neutral" as const,
    provider: "ollama",
    size: "1.2 GB",
    desc: "Multi-granularity embedding across 100+ languages.",
    isLocal: true,
  },
  {
    id: "nvidia/nemotron-3-embed-1b:free",
    name: "nvidia/nemotron-3-embed-1b:free",
    tag: "Cloud / Free",
    badgeTone: "blue" as const,
    provider: "openrouter",
    size: "Cloud",
    desc: "Hosted on OpenRouter (no local RAM needed).",
    isLocal: false,
  },
]

const UTILITY_OPTIONS = [
  {
    id: "llama3.2:1b",
    modelKey: "ollama/llama3.2:1b",
    name: "llama3.2:1b",
    tag: "Recommended",
    badgeTone: "green" as const,
    provider: "ollama",
    size: "1.3 GB",
    desc: "Ultra-fast (<50ms) single-word instruction grading.",
    isLocal: true,
  },
  {
    id: "llama3.2:3b",
    modelKey: "ollama/llama3.2:3b",
    name: "llama3.2:3b",
    tag: "Balanced",
    badgeTone: "neutral" as const,
    provider: "ollama",
    size: "2.0 GB",
    desc: "Higher reasoning power for technical documents.",
    isLocal: true,
  },
  {
    id: "qwen2.5:1.5b",
    modelKey: "ollama/qwen2.5:1.5b",
    name: "qwen2.5:1.5b",
    tag: "Code & Logic",
    badgeTone: "neutral" as const,
    provider: "ollama",
    size: "986 MB",
    desc: "Strict instruction compliance for source code.",
    isLocal: true,
  },
  {
    id: "meta-llama/llama-3.2-3b-instruct:free",
    modelKey: "meta-llama/llama-3.2-3b-instruct:free",
    name: "llama-3.2-3b:free",
    tag: "Cloud / Free",
    badgeTone: "blue" as const,
    provider: "openrouter",
    size: "Cloud",
    desc: "Hosted on OpenRouter (free tier).",
    isLocal: false,
  },
]

export default function PrismSettings() {
  const [s, setS] = useState<PrismSettingsType | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)

  const pushToast = useToastStore((st) => st.push)

  useEffect(() => {
    api
      .prismSettings()
      .then(setS)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  async function patch(body: Partial<PrismSettingsType>) {
    setSaving(true)
    setError(null)
    try {
      setS(await api.putPrismSettings(body))
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!s) {
    return (
      <div className="px-4 py-3 font-mono text-[11px] text-kai-dim">
        {error ? (
          <span className="text-kai-rose">{error}</span>
        ) : (
          <span className="flex items-center gap-2">
            <Spinner size={12} /> Loading PRISM settings…
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 px-4 py-3">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] leading-relaxed text-kai-dim max-w-lg">
          Cross-workspace defaults for document ingestion and retrieval. A workspace’s own config
          overrides any of these settings.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setQuickOpen(true)}
            className="hud-glow"
          >
            <Zap size={11} />
            Quick Setup
          </Button>
          <div className="h-5 min-w-[70px] text-right">
            {saving && (
              <Badge tone="orange">
                <Spinner size={9} /> saving…
              </Badge>
            )}
            {saved && !saving && (
              <Badge tone="green">
                <Check size={9} /> saved
              </Badge>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-kai-rose/30 bg-kai-rose/10 px-3 py-2 font-mono text-xs text-kai-rose">
          <TriangleAlert size={13} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── 1. Relevance Gate ────────────────────────────────────────────── */}
      <Group
        icon={ShieldCheck}
        title="Relevance gate"
        note={
          s.utility_model
            ? "Every retrieved chunk is checked before it is used, so an answer can be “no source found”."
            : "Without a utility model the gate cannot run, and every result is reported as ungraded — the context is unverified however good it looks."
        }
        warn={!s.utility_model}
      >
        <TextField
          label="Utility model"
          hint="Runs once per candidate chunk, so pick the cheapest model that can follow a one-word instruction."
          value={s.utility_model}
          placeholder="e.g. openai/gpt-4o-mini or ollama/llama3.2:1b"
          onCommit={(v) => patch({ utility_model: v })}
        />
        <TextField
          label="Utility provider"
          hint="Blank uses the workspace provider."
          value={s.utility_provider}
          placeholder="(workspace provider)"
          onCommit={(v) => patch({ utility_provider: v })}
        />
        <Toggle
          label="Grade retrieved chunks"
          hint="Turning this off makes retrieval faster and cheaper. Results are then reported as ungraded, as they must be."
          checked={s.grade}
          onChange={(v) => patch({ grade: v })}
        />
      </Group>

      {/* ── 2. Embeddings ────────────────────────────────────────────────── */}
      <Group
        icon={Cpu}
        title="Embeddings"
        note={
          s.embed_model
            ? "Pinned to a specific model."
            : "Resolved automatically: a local server already serving an embedding model, then the fallback below, then lexical-only retrieval."
        }
      >
        <TextField
          label="Embedding model"
          hint="Blank resolves automatically. Changing it after importing means re-importing: vectors from two models are not comparable."
          value={s.embed_model}
          placeholder="(auto — local first)"
          onCommit={(v) => patch({ embed_model: v })}
        />
        <TextField
          label="Provider"
          value={s.embed_provider}
          placeholder="(auto)"
          onCommit={(v) => patch({ embed_provider: v })}
        />
        <TextField
          label="Base URL"
          hint="Escape hatch for a self-hosted gateway or a non-default Ollama port."
          value={s.embed_base_url}
          placeholder="(provider default)"
          onCommit={(v) => patch({ embed_base_url: v })}
        />
        <TextField
          label="Hosted fallback model"
          hint="Used only when nothing is configured and no local server is running. Blank means never fall back to a paid endpoint unasked."
          value={s.embed_fallback_model}
          placeholder="(none)"
          onCommit={(v) => patch({ embed_fallback_model: v })}
        />
        <TextField
          label="Hosted fallback provider"
          value={s.embed_fallback_provider}
          placeholder="e.g. openrouter"
          onCommit={(v) => patch({ embed_fallback_provider: v })}
        />
      </Group>

      {/* ── 3. Retrieval ─────────────────────────────────────────────────── */}
      <Group icon={Sparkles} title="Retrieval">
        <Select
          label="Mode"
          hint="Agent mode routes multi-step questions through decomposition. Most questions take the static path either way."
          value={s.mode}
          options={[
            ["static", "static — single-shot"],
            ["agent", "agent — decompose multi-step questions"],
          ]}
          onChange={(v) => patch({ mode: v as PrismSettingsType["mode"] })}
        />
        <NumberField
          label="Top K"
          hint="Fused candidates carried into grading. Each one costs a grader call."
          value={s.top_k}
          min={1}
          max={50}
          onCommit={(v) => patch({ top_k: v })}
        />
        <NumberField
          label="Query variants"
          hint={`RAG-Fusion breadth. Above 1 the query is expanded into alternative phrasings and every ranking is fused. Cost scales linearly; capped at ${s.max_variants}.`}
          value={s.variants}
          min={1}
          max={s.max_variants}
          onCommit={(v) => patch({ variants: v })}
        />
        <NumberField
          label="Cache TTL (seconds)"
          hint="How stale a repeated question’s answer may be. Importing a document invalidates it regardless."
          value={s.cache_ttl_seconds}
          min={0}
          max={86400}
          onCommit={(v) => patch({ cache_ttl_seconds: v })}
        />
      </Group>

      {/* ── 4. Chunking ──────────────────────────────────────────────────── */}
      <Group
        icon={Layers}
        title="Chunking"
        note="Only affects documents imported afterwards. Existing documents keep the sizes they were split with."
      >
        <NumberField
          label="Parent tokens"
          hint="The context window handed to the model."
          value={s.parent_tokens}
          min={50}
          max={4000}
          onCommit={(v) => patch({ parent_tokens: v })}
        />
        <NumberField
          label="Child tokens"
          hint="The retrieval window that gets embedded. Smaller means a more precise match."
          value={s.child_tokens}
          min={20}
          max={2000}
          onCommit={(v) => patch({ child_tokens: v })}
        />
        <NumberField
          label="Child overlap"
          hint="Keeps a sentence spanning two children findable from both."
          value={s.child_overlap}
          min={0}
          max={500}
          onCommit={(v) => patch({ child_overlap: v })}
        />
      </Group>

      {/* ── Quick Setup Modal ────────────────────────────────────────────── */}
      <QuickSetupModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onApply={async (chosen) => {
          await patch(chosen)
          setQuickOpen(false)
          pushToast("success", "PRISM Quick Setup Applied", "Models and optimal retrieval settings configured.")
        }}
      />
    </div>
  )
}

function QuickSetupModal({
  open,
  onClose,
  onApply,
}: {
  open: boolean
  onClose: () => void
  onApply: (settings: Partial<PrismSettingsType>) => Promise<void>
}) {
  const [selectedEmbed, setSelectedEmbed] = useState(EMBEDDING_OPTIONS[0].id)
  const [selectedUtility, setSelectedUtility] = useState(UTILITY_OPTIONS[0].id)
  const [applying, setApplying] = useState(false)
  const pushToast = useToastStore((s) => s.push)

  const embedOpt = EMBEDDING_OPTIONS.find((o) => o.id === selectedEmbed) || EMBEDDING_OPTIONS[0]
  const utilOpt = UTILITY_OPTIONS.find((o) => o.id === selectedUtility) || UTILITY_OPTIONS[0]

  // Build pull command for local models
  const localPulls: string[] = []
  if (embedOpt.isLocal) localPulls.push(`ollama pull ${embedOpt.id}`)
  if (utilOpt.isLocal) localPulls.push(`ollama pull ${utilOpt.id}`)
  const pullCommand = localPulls.length > 0 ? localPulls.join(" && ") : "# No local download required (Cloud models)"

  const copyCommand = () => {
    navigator.clipboard.writeText(pullCommand).then(() => {
      pushToast("success", "Command copied to clipboard", pullCommand)
    }).catch(() => {})
  }

  const handleApply = async () => {
    setApplying(true)
    try {
      const configToApply: Partial<PrismSettingsType> = {
        embed_model: embedOpt.id,
        embed_provider: embedOpt.provider,
        embed_base_url: embedOpt.isLocal ? "http://localhost:11434/v1" : "https://openrouter.ai/api/v1",
        utility_model: utilOpt.modelKey,
        utility_provider: utilOpt.provider,
        grade: true,
        mode: "agent",
        top_k: 5,
        variants: 3,
        parent_tokens: 600,
        child_tokens: 150,
        child_overlap: 20,
        cache_ttl_seconds: 300,
      }
      if (!embedOpt.isLocal) {
        configToApply.embed_fallback_model = embedOpt.id
        configToApply.embed_fallback_provider = embedOpt.provider
      }
      await onApply(configToApply)
    } finally {
      setApplying(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="quick-setup-title" className="max-w-2xl">
      <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <PrismIcon size={15} className="text-kai-orange" />
          <h2 id="quick-setup-title" className="font-mono text-sm font-bold text-kai-white">
            PRISM Quick Setup
          </h2>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-kai-dim hover:text-kai-text transition-colors"
        >
          <X size={14} />
        </button>
      </header>

      <div className="max-h-[75vh] overflow-y-auto p-5 space-y-5">
        <p className="font-mono text-xs text-kai-dim leading-relaxed">
          Pick your <strong>Embedding Model</strong> and <strong>Relevance Gate Model</strong>.
          Kaioken will automatically configure the endpoints, the relevance gate, and optimal RAG-Fusion chunking.
        </p>

        {/* 1. Embedding Model Picker */}
        <div>
          <SectionLabel className="mb-2.5">1. Select Embedding Model</SectionLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {EMBEDDING_OPTIONS.map((opt) => {
              const selected = selectedEmbed === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedEmbed(opt.id)}
                  className={cn(
                    "hud-corners relative flex flex-col justify-between rounded-lg border p-3 text-left transition-all outline-none",
                    selected
                      ? "border-kai-orange/60 bg-accent/40 shadow-[0_0_10px_-2px_var(--kai-orange)]"
                      : "border-border bg-card/60 hover:border-kai-orange/40 hover:bg-card"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn("font-mono text-xs font-bold", selected ? "text-kai-orange" : "text-kai-text")}>
                      {opt.name}
                    </span>
                    <Badge tone={opt.badgeTone}>{opt.tag}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-kai-dim leading-tight">
                    {opt.desc}
                  </p>
                  <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-kai-dim">
                    <span>Provider: {opt.provider}</span>
                    <span>{opt.size}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 2. Utility / Relevance Gate Model Picker */}
        <div>
          <SectionLabel className="mb-2.5">2. Select Relevance Gate (Instruct) Model</SectionLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {UTILITY_OPTIONS.map((opt) => {
              const selected = selectedUtility === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedUtility(opt.id)}
                  className={cn(
                    "hud-corners relative flex flex-col justify-between rounded-lg border p-3 text-left transition-all outline-none",
                    selected
                      ? "border-kai-orange/60 bg-accent/40 shadow-[0_0_10px_-2px_var(--kai-orange)]"
                      : "border-border bg-card/60 hover:border-kai-orange/40 hover:bg-card"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn("font-mono text-xs font-bold", selected ? "text-kai-orange" : "text-kai-text")}>
                      {opt.name}
                    </span>
                    <Badge tone={opt.badgeTone}>{opt.tag}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-kai-dim leading-tight">
                    {opt.desc}
                  </p>
                  <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-kai-dim">
                    <span>Provider: {opt.provider}</span>
                    <span>{opt.size}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 3. Terminal Download Command */}
        <div className="rounded-lg border border-border bg-kai-code p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold text-kai-amber">
              <Terminal size={12} />
              Terminal command to download models:
            </span>
            {localPulls.length > 0 && (
              <button
                type="button"
                onClick={copyCommand}
                className="flex items-center gap-1 font-mono text-[10px] text-kai-dim hover:text-kai-text transition-colors"
              >
                <Copy size={11} />
                Copy
              </button>
            )}
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-kai-green">
            {pullCommand}
          </pre>
          {localPulls.length > 0 && (
            <p className="font-mono text-[9.5px] text-kai-dim">
              Run this in your terminal to pull the models into Ollama before querying.
            </p>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 bg-card/40">
        <Button size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void handleApply()}
          loading={applying}
          className="hud-glow"
        >
          <Sparkles size={11} />
          Apply Configuration
        </Button>
      </footer>
    </Modal>
  )
}

function Group({
  icon: Icon,
  title,
  note,
  warn,
  children,
}: {
  icon?: typeof ShieldCheck
  title: string
  note?: string
  warn?: boolean
  children: React.ReactNode
}) {
  return (
    <Card className="hud-corners p-3.5 space-y-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={13} className="text-kai-orange" />}
        <SectionLabel>{title}</SectionLabel>
      </div>
      {note && (
        <p className={cn("font-mono text-[10.5px] leading-relaxed", warn ? "text-kai-amber" : "text-kai-dim")}>
          {note}
        </p>
      )}
      <div className="space-y-3 pt-1">{children}</div>
    </Card>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 sm:grid-cols-[180px_1fr] sm:items-start sm:gap-3">
      <span className="pt-1.5 font-mono text-xs font-medium text-kai-text">{label}</span>
      <span className="min-w-0">
        {children}
        {hint && <span className="mt-1 block font-mono text-[10px] leading-relaxed text-kai-dim">{hint}</span>}
      </span>
    </label>
  )
}

function TextField({
  label,
  hint,
  value,
  placeholder,
  onCommit,
}: {
  label: string
  hint?: string
  value: string
  placeholder?: string
  onCommit: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <Row label={label} hint={hint}>
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onCommit(draft)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={cn(
          "w-full rounded-md border border-border bg-background px-2.5 py-1.5",
          "font-mono text-xs text-kai-text placeholder:text-kai-dim outline-none transition-colors",
          "focus:border-kai-orange/50 focus-visible:ring-2 focus-visible:ring-kai-orange/40"
        )}
      />
    </Row>
  )
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onCommit,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  onCommit: (v: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  return (
    <Row label={label} hint={hint}>
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft)
          if (Number.isFinite(n) && n !== value) onCommit(Math.min(max, Math.max(min, n)))
        }}
        className={cn(
          "w-32 rounded-md border border-border bg-background px-2.5 py-1.5",
          "font-mono text-xs text-kai-text placeholder:text-kai-dim outline-none transition-colors",
          "focus:border-kai-orange/50 focus-visible:ring-2 focus-visible:ring-kai-orange/40"
        )}
      />
    </Row>
  )
}

function Select({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string
  hint?: string
  value: string
  options: [string, string][]
  onChange: (v: string) => void
}) {
  return (
    <Row label={label} hint={hint}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-md border border-border bg-background px-2.5 py-1.5",
          "font-mono text-xs text-kai-text outline-none transition-colors",
          "focus:border-kai-orange/50 focus-visible:ring-2 focus-visible:ring-kai-orange/40"
        )}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Row>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Row label={label} hint={hint}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 rounded accent-kai-orange cursor-pointer"
      />
    </Row>
  )
}
