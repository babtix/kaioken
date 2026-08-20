import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Beaker, Check, ChevronDown, Cpu, ExternalLink, Eye, EyeOff, GitBranch, Globe,
  KeyRound, Library, Loader2, Save, Search, Settings as SettingsIcon, Trash2,
  TriangleAlert, X,
} from "lucide-react"
import { useWorkspaceStore } from "@/store/workspace"
import { useToastStore } from "@/store/toast"
import { api } from "@/lib/api"
import { humanize } from "@/lib/errors"
import { Badge, Button } from "@/components/ui"
import {
  SearchProviderPicker,
  type SearchProviderInfo,
  type SearchSettings,
} from "@/components/SearchProviderPicker"
import LocalModels from "@/components/LocalModels"
import PrismSettings from "@/components/PrismSettings"
import { cn } from "@/lib/utils"
import FetcherSettings from "@/components/FetcherSettings"
import type { EmbedSettings, FetcherSettings as FetcherSettingsType } from "@/lib/types"

type Provider = {
  name: string
  base_url: string
  key_env: string
  has_key: boolean
  key_source: "config" | "env" | "local" | "none"
  /** True for an endpoint on the user's own machine: no key, no spend. */
  local?: boolean
  hint?: string
  requires_base_url?: boolean
}

type ModelInfo = { id: string; name: string }

// ── Persisted toggle ────────────────────────────────────────────────────────────

function usePersistedToggle(key: string, defaultOpen: boolean): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key)
      return v === null ? defaultOpen : v === "1"
    } catch {
      return defaultOpen
    }
  })
  const toggle = useCallback(() => {
    setOpen((o) => {
      const next = !o
      try { localStorage.setItem(key, next ? "1" : "0") } catch {}
      return next
    })
  }, [key])
  return [open, toggle]
}

// ── Collapsible settings section ────────────────────────────────────────────────

function SettingsSection({
  id,
  icon: Icon,
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  id: string
  icon: typeof Globe
  title: string
  badge?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, toggle] = usePersistedToggle(`kai-settings-${id}`, defaultOpen)

  // -inset because overflow-hidden (needed so the header's hover fill stays
  // inside the rounded corners) would clip brackets drawn at -1px.
  return (
    <section className="hud-panel hud-corners hud-corners-inset animate-charge rounded-[var(--radius)] overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors",
          "hover:bg-accent/40 outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        )}
      >
        <Icon size={14} className="shrink-0 text-kai-orange" />
        <span className="flex-1 font-mono text-[12px] font-bold text-kai-text">{title}</span>
        {badge && !open && (
          <span className="font-mono text-[10px] text-kai-dim">{badge}</span>
        )}
        <ChevronDown
          size={13}
          className={cn(
            "shrink-0 text-kai-dim transition-transform duration-200",
            !open && "-rotate-90"
          )}
        />
      </button>
      {open && (
        <div className="animate-slide-up border-t border-border">
          {children}
        </div>
      )}
    </section>
  )
}

// ── Inline status helper ────────────────────────────────────────────────────────

type InlineStatus = "idle" | "saving" | "saved" | "error" | "testing" | "tested"

function useInlineStatus() {
  const [status, setStatus] = useState<InlineStatus>("idle")
  const [msg, setMsg] = useState("")
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flash = useCallback((s: InlineStatus, m: string, duration = 2500) => {
    setStatus(s)
    setMsg(m)
    clearTimeout(timer.current)
    if (s === "saved" || s === "tested" || s === "error") {
      timer.current = setTimeout(() => { setStatus("idle"); setMsg("") }, duration)
    }
  }, [])

  const reset = useCallback(() => { setStatus("idle"); setMsg("") }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  return { status, msg, flash, reset }
}

function InlineFeedback({ status, msg }: { status: InlineStatus; msg: string }) {
  if (status === "idle" || !msg) return null
  const isGood = status === "saved" || status === "tested"
  return (
    <span
      className={cn(
        "animate-slide-up inline-flex items-center gap-1 font-mono text-[10px]",
        isGood ? "text-kai-green" : "text-kai-rose"
      )}
    >
      {isGood ? <Check size={10} /> : <TriangleAlert size={10} />}
      {msg}
    </span>
  )
}

// ── Settings page ─────────────────────────────────────────────────────────────

export default function Settings() {
  const ws = useWorkspaceStore((s) => s.active)
  const push = useToastStore((s) => s.push)
  const [providers, setProviders] = useState<Provider[] | null>(null)
  const [search, setSearch] = useState<SearchSettings | null>(null)
  const [embed, setEmbed] = useState<EmbedSettings | null>(null)
  const [fetcher, setFetcher] = useState<FetcherSettingsType | null>(null)
  const [config, setConfig] = useState<any>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFlash, setSaveFlash] = useState<"idle" | "saved" | "error">("idle")
  const [saveError, setSaveError] = useState("")

  useEffect(() => {
    api
      .settings()
      .then((s) => {
        setProviders(s.providers || [])
        setSearch(s.search ?? null)
        setEmbed(s.embed ?? null)
        setFetcher(s.fetcher ?? null)
      })
      .catch(() => setProviders([]))
  }, [])

  useEffect(() => {
    if (!ws) return
    setDirty(false)
    setSaveFlash("idle")
    api.getConfig(ws.id).then(setConfig).catch(() => setConfig(null))
  }, [ws?.id])

  function edit(patch: Record<string, unknown>) {
    setConfig((c: any) => ({ ...c, ...patch }))
    setDirty(true)
    setSaveFlash("idle")
  }

  async function reloadProviders() {
    const s = await api.settings()
    setProviders(s.providers || [])
    setSearch(s.search ?? null)
    setEmbed(s.embed ?? null)
    // A saved key can flip which tier runs, so the fetcher block has to
    // refresh alongside the provider list rather than keep a stale answer.
    setFetcher(s.fetcher ?? null)
  }

  async function setSearchProvider(v: string) {
    try {
      const res = await api.putSettings({ search_provider: v })
      setSearch((s) => (s ? { ...s, provider: res.search_provider ?? v } : s))
    } catch (err) {
      const h = humanize(err)
      push("error", h.title, h.body, h.action)
    }
  }

  async function saveConfig() {
    if (!ws || !config) return
    setSaving(true)
    setSaveError("")
    try {
      const saved = await api.putConfig(ws.id, config)
      setConfig(saved)
      setDirty(false)
      setSaveFlash("saved")
      setTimeout(() => setSaveFlash("idle"), 2500)
    } catch (err) {
      const h = humanize(err)
      setSaveFlash("error")
      setSaveError(h.body || h.title)
      setTimeout(() => setSaveFlash("idle"), 4000)
    } finally {
      setSaving(false)
    }
  }

  const configuredKeyCount = providers?.filter((p) => p.has_key).length ?? 0

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6 lg:p-8">
      <header className="flex items-center gap-2">
        <SettingsIcon size={15} className="text-kai-orange" />
        <h1 className="font-mono text-lg font-bold text-kai-text">Settings</h1>
      </header>

      {/* ── 1. Research engines (hot path) ────────────────────────── */}
      {search && (
        <SettingsSection
          id="search"
          icon={Globe}
          title="Research engines"
          badge={search.providers.filter((p) => p.has_key).length + " key(s)"}
          defaultOpen
        >
          <div className="space-y-3 px-4 py-3">
            <p className="font-mono text-[10px] leading-relaxed text-kai-dim">
              Which engine answers research queries. <span className="text-kai-text">Both</span>{" "}
              asks every vendor with a key and merges results; picking one pins it.
              This decides how pages are <span className="text-kai-text">found</span>; how
              they are read is set below.
            </p>

            <SearchProviderPicker
              value={search.provider}
              providers={search.providers}
              onChange={setSearchProvider}
            />
          </div>

          <div className="divide-y divide-border border-t border-border">
            {search.providers.map((sp) => (
              <SearchKeyCard key={sp.name} provider={sp} onSaved={reloadProviders} />
            ))}
          </div>

          {fetcher && (
            <div className="border-t border-border">
              <FetcherSettings fetcher={fetcher} onChange={setFetcher} />
            </div>
          )}
        </SettingsSection>
      )}

      {/* ── 2. Workspace (model + config + git) ──────────────────── */}
      {ws && config && (
        <SettingsSection
          id="workspace"
          icon={SettingsIcon}
          title={`Workspace · ${ws.name}`}
          badge={config.model || undefined}
          defaultOpen
        >
          <div className="divide-y divide-border">
            <Field
              label="Model"
              hint="Select a provider, then pick from its live model catalog."
              stacked
            >
              <ModelPicker
                providers={providers ?? []}
                value={config.model || ""}
                onChange={(v) => edit({ model: v })}
              />
            </Field>

            <Field
              label="Base URL override"
              hint="Only needed for account-scoped endpoints (Azure, Cloudflare). Leave blank otherwise."
              stacked
            >
              <input
                value={config.base_url || ""}
                onChange={(e) => edit({ base_url: e.target.value })}
                placeholder="https://your-resource.openai.azure.com/openai/v1"
                className={cn(inputClass, "w-full")}
              />
            </Field>

            <Field
              label="Concurrency"
              hint={
                config.concurrency_clamped
                  ? `Clamped to ${config.effective_concurrency} — free-tier models rate-limit hard.`
                  : "Parallel LLM calls during generation."
              }
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={config.concurrency ?? 1}
                  onChange={(e) => edit({ concurrency: Number(e.target.value) })}
                  className={cn(inputClass, "w-20")}
                />
                {config.concurrency_clamped && (
                  <Badge tone="amber">
                    <TriangleAlert size={9} />
                    {"\u2192"}{config.effective_concurrency}
                  </Badge>
                )}
              </div>
            </Field>

            <Field label="Max module tokens" hint="Per-module context ceiling. Minimum 4000.">
              <input
                type="number"
                min={4000}
                value={config.max_module_tokens ?? 60000}
                onChange={(e) => edit({ max_module_tokens: Number(e.target.value) })}
                className={cn(inputClass, "w-28")}
              />
            </Field>

            <Field
              label="Notes"
              hint="Steering notes injected into every generation prompt. One per line."
              stacked
            >
              <textarea
                value={(config.notes || []).join("\n")}
                onChange={(e) => edit({ notes: e.target.value.split("\n").filter(Boolean) })}
                rows={3}
                placeholder="Facts the model cannot infer from the code alone…"
                className={cn(inputClass, "w-full resize-y leading-relaxed")}
              />
            </Field>

            {/* Save bar */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <Button variant="primary" size="sm" onClick={saveConfig} disabled={!dirty} loading={saving}>
                <Save size={11} />
                Save config
              </Button>
              {dirty && <Badge tone="amber">unsaved</Badge>}
              {saveFlash === "saved" && (
                <span className="animate-slide-up inline-flex items-center gap-1 font-mono text-[10px] text-kai-green">
                  <Check size={10} />
                  Saved
                </span>
              )}
              {saveFlash === "error" && (
                <span className="animate-slide-up font-mono text-[10px] text-kai-rose">
                  {saveError}
                </span>
              )}
              <p className="ml-auto font-mono text-[9px] text-kai-dim">
                <code className="text-kai-tan">.kaioken/config.yaml</code>
              </p>
            </div>

            {/* Git hook — same workspace scope */}
            {ws.git.is_repo && (
              <GitHookRow wsId={ws.id} installed={ws.git.hook_installed} />
            )}
          </div>
        </SettingsSection>
      )}

      {/* ── 3. Local models + semantic search ─────────────────────── */}
      <SettingsSection
        id="local"
        icon={Cpu}
        title="Local models"
        badge={embed?.enabled ? "semantic search on" : undefined}
        defaultOpen={false}
      >
        <LocalModels embed={embed} onEmbedChange={setEmbed} />
      </SettingsSection>

      {/* ── 3b. PRISM: retrieval over imported documents ──────────── */}
      <SettingsSection
        id="prism"
        icon={Library}
        title="PRISM — imported documents"
        defaultOpen={false}
      >
        <PrismSettings />
      </SettingsSection>

      {/* ── 4. LLM Providers (collapsed by default) ──────────────── */}
      <SettingsSection
        id="providers"
        icon={KeyRound}
        title="LLM providers"
        badge={configuredKeyCount > 0 ? `${configuredKeyCount} configured` : undefined}
        defaultOpen={false}
      >
        <div className="px-4 py-3">
          <p className="font-mono text-[10px] leading-relaxed text-kai-dim">
            Keys are written to <code className="text-kai-tan">~/.kaioken/config.yaml</code> (mode 0600).
            A key set here works in the CLI too. Keys are never sent back to this UI.
          </p>

          {providers === null ? (
            <p className="mt-3 font-mono text-[11px] text-kai-dim">Loading providers…</p>
          ) : (
            <ProviderList providers={providers} onSaved={reloadProviders} />
          )}
        </div>
      </SettingsSection>
    </div>
  )
}

// ── Git hook ──────────────────────────────────────────────────────────────────

function GitHookRow({ wsId, installed: initial }: { wsId: string; installed: boolean }) {
  const push = useToastStore((s) => s.push)
  const [installed, setInstalled] = useState(initial)
  const [busy, setBusy] = useState(false)

  useEffect(() => setInstalled(initial), [wsId, initial])

  async function toggle() {
    setBusy(true)
    try {
      const res = await api.hook(wsId, installed ? "remove" : "install")
      setInstalled(res.installed)
      push(
        "success",
        res.installed ? "Hook installed" : "Hook removed",
        res.path ?? ".git/hooks/post-commit"
      )
    } catch (err) {
      const h = humanize(err)
      push("error", h.title, h.body, h.action)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-3">
      <GitBranch size={14} className="shrink-0 text-kai-orange" />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs text-kai-text">
          post-commit hook
          {installed
            ? <Badge tone="green" className="ml-2">installed</Badge>
            : <Badge tone="neutral" className="ml-2">not installed</Badge>}
        </p>
        <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-kai-dim">
          Marks knowledge stale after each commit.
        </p>
      </div>
      <Button size="sm" variant={installed ? "subtle" : "primary"} onClick={toggle} loading={busy}>
        {installed ? "Remove" : "Install"}
      </Button>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputClass = cn(
  "rounded-[var(--radius)] border border-border bg-background px-2 py-1 font-mono text-[11px] text-kai-text",
  "outline-none transition-colors placeholder:text-kai-dim",
  "focus:border-kai-orange/50 focus-visible:ring-2 focus-visible:ring-kai-orange/40"
)

// ── Field layout ──────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  stacked,
  children,
}: {
  label: string
  hint?: string
  stacked?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn("px-3 py-2.5", stacked ? "space-y-1.5" : "flex items-start gap-4")}>
      <div className={stacked ? undefined : "min-w-0 flex-1"}>
        <p className="font-mono text-[11px] text-kai-text">{label}</p>
        {hint && <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-kai-dim">{hint}</p>}
      </div>
      <div className={stacked ? undefined : "shrink-0"}>{children}</div>
    </div>
  )
}

// ── Model picker ──────────────────────────────────────────────────────────────

function ModelPicker({
  providers,
  value,
  onChange,
}: {
  providers: Provider[]
  value: string
  onChange: (v: string) => void
}) {
  const guessProvider = (v: string) => {
    if (!v) return ""
    const slash = v.indexOf("/")
    if (slash === -1) return ""
    const prefix = v.slice(0, slash).toLowerCase()
    return providers.find((p) => p.name.toLowerCase() === prefix)?.name ?? ""
  }

  const [selectedProvider, setSelectedProvider] = useState(() => guessProvider(value))
  const [models, setModels] = useState<ModelInfo[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const [open, setOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  useEffect(() => {
    if (!selectedProvider) { setModels(null); return }
    setLoading(true)
    setError(null)
    setModels(null)
    api.models(selectedProvider)
      .then((res) => setModels(res.models ?? []))
      .catch((err) => setError(humanize(err).title))
      .finally(() => setLoading(false))
  }, [selectedProvider])

  const filtered = (models ?? []).filter((m) =>
    !filter || m.id.toLowerCase().includes(filter.toLowerCase()) || m.name.toLowerCase().includes(filter.toLowerCase())
  )

  function selectModel(id: string) {
    onChange(id)
    setOpen(false)
    setFilter("")
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {providers.map((p) => (
          <button
            key={p.name}
            onClick={() => { setSelectedProvider(p.name); setOpen(true) }}
            className={cn(
              "flex items-center gap-1 rounded-[var(--radius)] border px-2 py-0.5 font-mono text-[10px] transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
              selectedProvider === p.name
                ? "border-kai-orange/60 bg-kai-orange/10 text-kai-orange"
                : "border-border bg-card text-kai-dim hover:border-kai-line hover:text-kai-text",
              !p.has_key && "opacity-50"
            )}
            title={!p.has_key ? `No API key for ${p.name}` : p.name}
          >
            {p.name}
            {!p.has_key && <span className="text-kai-rose">!</span>}
          </button>
        ))}
      </div>

      {selectedProvider && (
        <div ref={dropRef} className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className={cn(
              "flex w-full items-center gap-2 rounded-[var(--radius)] border border-border bg-background px-2 py-1",
              "font-mono text-[11px] text-kai-text outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-kai-orange/40",
              open && "border-kai-orange/50"
            )}
          >
            {loading
              ? <Loader2 size={11} className="animate-spin text-kai-dim" />
              : <ChevronDown size={11} className="shrink-0 text-kai-dim" />}
            <span className="min-w-0 flex-1 truncate text-left">
              {value || <span className="text-kai-dim">pick a model…</span>}
            </span>
            {value && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onChange(""); setFilter("") }}
                className="shrink-0 text-kai-dim hover:text-kai-rose"
              >
                <X size={10} />
              </span>
            )}
          </button>

          {open && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-lg">
              <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
                <Search size={11} className="shrink-0 text-kai-dim" />
                <input
                  autoFocus
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="filter models…"
                  className="flex-1 bg-transparent font-mono text-[11px] text-kai-text outline-none placeholder:text-kai-dim"
                />
              </div>

              <div className="max-h-52 overflow-auto">
                {loading && (
                  <p className="px-3 py-4 text-center font-mono text-[10px] text-kai-dim">
                    Loading models…
                  </p>
                )}
                {error && (
                  <p className="px-3 py-3 font-mono text-[10px] text-kai-rose">{error}</p>
                )}
                {!loading && !error && filtered.length === 0 && (
                  <p className="px-3 py-4 text-center font-mono text-[10px] text-kai-dim">
                    {filter ? "No matches" : "No models (key required)"}
                  </p>
                )}
                {filtered.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => selectModel(m.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors outline-none",
                      "hover:bg-accent focus-visible:bg-accent",
                      value === m.id && "bg-kai-orange/10"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[11px] text-kai-text">{m.id}</span>
                      {m.name && m.name !== m.id && (
                        <span className="block truncate font-mono text-[9px] text-kai-dim">{m.name}</span>
                      )}
                    </span>
                    {value === m.id && <Check size={10} className="shrink-0 text-kai-orange" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[9px] text-kai-dim">or type:</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="provider/model-id"
          className={cn(inputClass, "flex-1 text-[10px]")}
        />
      </div>
    </div>
  )
}

// ── Provider list ──────────────────────────────────────────────────────────────

function ProviderList({ providers, onSaved }: { providers: Provider[]; onSaved: () => Promise<void> }) {
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return providers
    return providers.filter((p) => p.name.toLowerCase().includes(q))
  }, [providers, query])

  const configured = filtered.filter((p) => p.has_key)
  const available = filtered.filter((p) => !p.has_key)
  const expandedProvider = available.find((p) => p.name === expanded)

  return (
    <div className="mt-3 space-y-3">
      <div className="relative">
        <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-kai-dim" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`filter ${providers.length} providers…`}
          className={cn(inputClass, "w-full pl-7")}
        />
      </div>

      {configured.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[9px] uppercase tracking-wide text-kai-dim">
            Configured · {configured.length}
          </p>
          {configured.map((p) => (
            <ProviderRow key={p.name} provider={p} onSaved={onSaved} />
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[9px] uppercase tracking-wide text-kai-dim">
            Available · {available.length}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {available.map((p) => (
              <button
                key={p.name}
                onClick={() => setExpanded((cur) => (cur === p.name ? null : p.name))}
                className={cn(
                  "flex items-center gap-1 rounded-[var(--radius)] border px-2 py-0.5 font-mono text-[10px] transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
                  expanded === p.name
                    ? "border-kai-orange/60 bg-kai-orange/10 text-kai-orange"
                    : "border-border bg-card text-kai-dim hover:border-kai-line hover:text-kai-text"
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
          {expandedProvider && (
            <ProviderRow
              provider={expandedProvider}
              onSaved={async () => {
                await onSaved()
                setExpanded(null)
              }}
            />
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="py-3 text-center font-mono text-[11px] text-kai-dim">No providers match "{query}"</p>
      )}
    </div>
  )
}

// ── Provider row ──────────────────────────────────────────────────────────────

function ProviderRow({ provider, onSaved }: { provider: Provider; onSaved: () => Promise<void> | void }) {
  const push = useToastStore((s) => s.push)
  const [value, setValue] = useState("")
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function save() {
    if (!value.trim()) return
    setBusy(true)
    try {
      await api.putKey(provider.name, value.trim())
      setValue("")
      await onSaved()
      push("success", `Key saved for ${provider.name}`, "Usable from the CLI too")
    } catch (err) {
      const h = humanize(err)
      push("error", h.title, h.body, h.action)
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setTesting(true)
    try {
      const res = await api.testKey(provider.name)
      const detail =
        res.results !== undefined
          ? `Probe search returned ${res.results} result(s)`
          : `Fetched ${res.models ?? 0} models`
      push("success", `${provider.name} key works`, detail)
    } catch (err) {
      const h = humanize(err)
      push("error", h.title, h.body, h.action)
    } finally {
      setTesting(false)
    }
  }

  async function remove() {
    setRemoving(true)
    try {
      await api.deleteKey(provider.name)
      await onSaved()
    } catch (err) {
      const h = humanize(err)
      push("error", h.title, h.body, h.action)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-border bg-card p-2.5">
      <KeyRound
        size={12}
        className={cn("shrink-0", provider.has_key ? "text-kai-green" : "text-kai-dim")}
      />
      <span className="w-24 shrink-0 font-mono text-[11px] font-semibold text-kai-text">
        {provider.name}
      </span>

      {provider.has_key ? (
        <Badge tone={provider.key_source === "env" ? "blue" : "green"}>
          <Check size={9} />
          {provider.key_source === "env" ? provider.key_env : provider.hint || "saved"}
        </Badge>
      ) : (
        <span className="font-mono text-[10px] text-kai-dim">no key</span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {provider.has_key && (
          <>
            <Button size="sm" variant="ghost" onClick={test} loading={testing} title="Test this key">
              <Beaker size={11} />
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} loading={removing} title="Remove key">
              <Trash2 size={11} />
            </Button>
          </>
        )}
        <div className="relative">
          <input
            type={reveal ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder={provider.has_key ? "replace key…" : "paste API key…"}
            className={cn(inputClass, "w-44 pr-7")}
          />
          <button
            onClick={() => setReveal((r) => !r)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-kai-dim hover:text-kai-text"
            aria-label={reveal ? "Hide key" : "Show key"}
            tabIndex={-1}
          >
            {reveal ? <EyeOff size={11} /> : <Eye size={11} />}
          </button>
        </div>
        <Button size="sm" onClick={save} disabled={!value.trim()} loading={busy}>
          Save
        </Button>
      </div>
    </div>
  )
}

// ── Search key card ─────────────────────────────────────────────────────────────

function SearchKeyCard({
  provider,
  onSaved,
}: {
  provider: SearchProviderInfo
  onSaved: () => Promise<void> | void
}) {
  const push = useToastStore((s) => s.push)
  const { status, msg, flash } = useInlineStatus()
  const [value, setValue] = useState("")
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function save() {
    if (!value.trim()) return
    setBusy(true)
    try {
      await api.putKey(provider.name, value.trim())
      setValue("")
      await onSaved()
      flash("saved", "Saved")
      push("success", `Key saved for ${provider.name}`, "Research is ready")
    } catch (err) {
      const h = humanize(err)
      flash("error", h.body || h.title)
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setTesting(true)
    try {
      const res = await api.testKey(provider.name)
      flash("tested", `${res.results ?? 0} result(s)`)
    } catch (err) {
      const h = humanize(err)
      flash("error", h.body || h.title)
    } finally {
      setTesting(false)
    }
  }

  async function remove() {
    setRemoving(true)
    try {
      await api.deleteKey(provider.name)
      await onSaved()
      flash("saved", "Removed")
    } catch (err) {
      const h = humanize(err)
      flash("error", h.body || h.title)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-2 px-4 py-3">
      {/* Header: name, status, signup link */}
      <div className="flex items-center gap-2">
        <KeyRound
          size={13}
          className={cn("shrink-0", provider.has_key ? "text-kai-green" : "text-kai-orange")}
        />
        <span className="font-mono text-[12px] font-bold capitalize text-kai-text">
          {provider.name}
        </span>
        {provider.has_key ? (
          <Badge tone="green">
            <Check size={9} />
            {provider.key_source === "env" ? provider.key_env : provider.hint || "configured"}
          </Badge>
        ) : (
          <Badge tone="orange">
            <TriangleAlert size={9} />
            no key
          </Badge>
        )}
        <a
          href={provider.signup}
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex items-center gap-1 rounded-[var(--radius)] border border-border px-2 py-0.5
                     font-mono text-[10px] text-kai-blue transition-colors hover:border-kai-blue/40 hover:bg-kai-blue/5"
        >
          <ExternalLink size={9} />
          Get a key
        </a>
      </div>

      {/* Input row */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            type={reveal ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder={
              provider.has_key
                ? provider.hint || "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (saved)"
                : `paste your ${provider.name} API key (${provider.key_env})`
            }
            className={cn(inputClass, "w-full pr-8", provider.has_key && !value && "placeholder:text-kai-green/70")}
          />
          <button
            onClick={() => setReveal((r) => !r)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-kai-dim hover:text-kai-text"
            aria-label={reveal ? "Hide key" : "Show key"}
            tabIndex={-1}
          >
            {reveal ? <EyeOff size={11} /> : <Eye size={11} />}
          </button>
        </div>
        <Button size="sm" onClick={save} disabled={!value.trim()} loading={busy}>
          <Save size={11} />
          Save
        </Button>
        {provider.has_key && (
          <>
            <Button size="sm" variant="ghost" onClick={test} loading={testing} title="Test this key">
              <Beaker size={11} />
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} loading={removing} title="Remove key">
              <Trash2 size={11} />
            </Button>
          </>
        )}
      </div>

      {/* Inline feedback */}
      {status !== "idle" && <InlineFeedback status={status} msg={msg} />}

      {!provider.has_key && status === "idle" && (
        <p className="font-mono text-[10px] leading-relaxed text-kai-dim">
          Sign up at <span className="text-kai-blue">{provider.signup}</span>, copy the API key, and paste it above.
          Or export <code className="text-kai-tan">{provider.key_env}</code> in your shell.
        </p>
      )}
    </div>
  )
}
