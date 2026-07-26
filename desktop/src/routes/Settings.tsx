import { useEffect, useMemo, useRef, useState } from "react"
import { Beaker, Check, ChevronDown, Eye, EyeOff, KeyRound, Loader2, Save, Search, Settings as SettingsIcon, Trash2, TriangleAlert, X } from "lucide-react"
import { useWorkspaceStore } from "@/store/workspace"
import { useToastStore } from "@/store/toast"
import { api } from "@/lib/api"
import { humanize } from "@/lib/errors"
import { Badge, Button, Card, SectionLabel } from "@/components/ui"
import { cn } from "@/lib/utils"

type Provider = {
  name: string
  base_url: string
  key_env: string
  has_key: boolean
  key_source: "config" | "env" | "none"
  hint?: string
  requires_base_url?: boolean
}

type ModelInfo = { id: string; name: string }

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
  // Derive initial provider from existing value like "anthropic/claude-..."
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

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  // Fetch models when provider changes
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
      {/* Provider selector */}
      <div className="flex flex-wrap gap-1.5">
        {providers.map((p) => (
          <button
            key={p.name}
            onClick={() => { setSelectedProvider(p.name); setOpen(true) }}
            className={cn(
              "flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
              selectedProvider === p.name
                ? "border-kai-orange/60 bg-kai-orange/10 text-kai-orange"
                : "border-border bg-card text-kai-dim hover:border-kai-line hover:text-kai-text",
              !p.has_key && "opacity-50"
            )}
            title={!p.has_key ? `No API key for ${p.name}` : p.name}
          >
            {p.name}
            {!p.has_key && <span className="text-kai-rose">⚠</span>}
          </button>
        ))}
      </div>

      {/* Model dropdown */}
      {selectedProvider && (
        <div ref={dropRef} className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1",
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
            <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-card shadow-lg">
              {/* Search */}
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

              {/* Model list */}
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

      {/* Manual override — always visible for power users */}
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
//
// With ~25 built-in providers, a flat list of full detail cards was mostly
// scrolling past providers nobody has a key for. Configured providers keep
// their full row (status, replace-key, test, remove); the rest collapse into
// a chip grid — one click expands the same row inline to add a key — and a
// filter box cuts straight to a name when there are this many to scan.

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
                  "flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
                  expanded === p.name
                    ? "border-kai-orange/60 bg-kai-orange/10 text-kai-orange"
                    : "border-border bg-card text-kai-dim hover:border-kai-line hover:text-kai-text"
                )}
                title={p.requires_base_url ? `${p.name} needs a base_url override` : p.name}
              >
                {p.name}
                {p.requires_base_url && <span className="text-kai-tan">⚙</span>}
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

// ── Settings page ─────────────────────────────────────────────────────────────

export default function Settings() {
  const ws = useWorkspaceStore((s) => s.active)
  const push = useToastStore((s) => s.push)
  const [providers, setProviders] = useState<Provider[] | null>(null)
  const [config, setConfig] = useState<any>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.settings().then((s) => setProviders(s.providers || [])).catch(() => setProviders([]))
  }, [])

  useEffect(() => {
    if (!ws) return
    setDirty(false)
    api.getConfig(ws.id).then(setConfig).catch(() => setConfig(null))
  }, [ws?.id])

  function edit(patch: Record<string, unknown>) {
    setConfig((c: any) => ({ ...c, ...patch }))
    setDirty(true)
  }

  async function reloadProviders() {
    const s = await api.settings()
    setProviders(s.providers || [])
  }

  async function saveConfig() {
    if (!ws || !config) return
    setSaving(true)
    try {
      const saved = await api.putConfig(ws.id, config)
      setConfig(saved)
      setDirty(false)
      push("success", "Config saved", `${ws.name}/.kaioken/config.yaml`)
    } catch (err) {
      const h = humanize(err)
      push("error", h.title, h.body, h.action)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-7 p-6">
      <header className="flex items-center gap-2">
        <SettingsIcon size={15} className="text-kai-orange" />
        <h1 className="font-mono text-lg font-bold text-kai-text">Settings</h1>
      </header>

      {/* Providers & keys */}
      <section>
        <SectionLabel>Providers &amp; API keys</SectionLabel>
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-kai-dim">
          Keys are written to <code className="text-kai-tan">~/.kaioken/config.yaml</code> with
          mode 0600 — the same file the CLI reads, so a key set here works in your terminal too.
          Keys are never sent back to this UI.
        </p>

        {providers === null ? (
          <p className="mt-3 font-mono text-[11px] text-kai-dim">Loading providers…</p>
        ) : (
          <ProviderList providers={providers} onSaved={reloadProviders} />
        )}
      </section>

      {/* Workspace config */}
      {ws && config && (
        <section>
          <div className="flex items-center gap-2">
            <SectionLabel>Workspace · {ws.name}</SectionLabel>
            {dirty && <Badge tone="amber">unsaved</Badge>}
          </div>

          <Card className="mt-3 divide-y divide-border">
            {/* Model picker */}
            <Field
              label="Model"
              hint="Select a provider, then pick from its live model catalog. You can also type a provider-qualified ID directly."
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
              hint="Only needed for an account-scoped endpoint — Azure's resource URL, Cloudflare's account URL. Leave blank for every other provider."
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
                    →{config.effective_concurrency}
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
              hint={`Steering notes injected into every generation prompt. One per line — e.g. "Real-time features follow the dual-router pattern."`}
              stacked
            >
              <textarea
                value={(config.notes || []).join("\n")}
                onChange={(e) => edit({ notes: e.target.value.split("\n").filter(Boolean) })}
                rows={4}
                placeholder="Facts the model cannot infer from the code alone…"
                className={cn(inputClass, "w-full resize-y leading-relaxed")}
              />
            </Field>

            <div className="flex items-center gap-2 p-3">
              <Button variant="primary" size="sm" onClick={saveConfig} disabled={!dirty} loading={saving}>
                <Save size={11} />
                Save config
              </Button>
              <p className="font-mono text-[10px] text-kai-dim">
                Writes <code className="text-kai-tan">.kaioken/config.yaml</code>
              </p>
            </div>
          </Card>
        </section>
      )}
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputClass = cn(
  "rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-kai-text",
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
    <div className={cn("p-3", stacked ? "space-y-1.5" : "flex items-start gap-4")}>
      <div className={stacked ? undefined : "min-w-0 flex-1"}>
        <p className="font-mono text-[11px] text-kai-text">{label}</p>
        {hint && <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-kai-dim">{hint}</p>}
      </div>
      <div className={stacked ? undefined : "shrink-0"}>{children}</div>
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
      push("success", `Key saved for ${provider.name}`, "Usable from the CLI in a new terminal")
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
      push("success", `${provider.name} key works`, `Fetched ${res.models ?? 0} models`)
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
      push("success", `Key removed for ${provider.name}`)
    } catch (err) {
      const h = humanize(err)
      push("error", h.title, h.body, h.action)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Card className="flex flex-wrap items-center gap-2 p-2.5">
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
      {provider.requires_base_url && (
        <Badge tone="amber">
          <TriangleAlert size={9} />
          needs base_url
        </Badge>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {provider.has_key && (
          <>
            <Button size="sm" variant="ghost" onClick={test} loading={testing} title="Test this key">
              <Beaker size={11} />
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} loading={removing} title="Remove saved key">
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
    </Card>
  )
}
