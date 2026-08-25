import { useCallback, useEffect, useState } from "react"
import { Check, Cpu, Plus, RefreshCw, Search } from "lucide-react"
import { api } from "@/lib/api"
import { Badge, Button, Spinner } from "@/components/ui"
import { cn } from "@/lib/utils"
import type { EmbedSettings, LocalProviderStatus } from "@/lib/types"

// Local inference is a different proposition from a hosted provider: nothing
// to sign up for, nothing to bill, but it only works if a server is actually
// running. So this panel leads with liveness rather than with a key field —
// "is it up, and what has it got" is the only question worth answering here.

export default function LocalModels({
  embed,
  onEmbedChange,
}: {
  embed: EmbedSettings | null
  onEmbedChange: (next: EmbedSettings) => void
}) {
  const [providers, setProviders] = useState<LocalProviderStatus[] | null>(null)
  const [probing, setProbing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const probe = useCallback(async () => {
    setProbing(true)
    setError(null)
    try {
      const res = await api.localProviders()
      setProviders(res.providers)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setProbing(false)
    }
  }, [])

  useEffect(() => {
    void probe()
  }, [probe])

  const running = providers?.filter((p) => p.running) ?? []

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] leading-relaxed text-kai-dim">
          Models running on your own machine. No API key, no spend, no data leaving the box —
          Kaioken treats them exactly like a hosted provider once they answer.
        </p>
        <Button variant="ghost" size="sm" onClick={() => void probe()} disabled={probing}>
          {probing ? <Spinner size={12} /> : <RefreshCw size={12} />}
          <span className="ml-1">Scan</span>
        </Button>
      </div>

      {error && <p className="font-mono text-[11px] text-kai-rose">{error}</p>}

      {providers === null && !error && (
        <p className="font-mono text-[11px] text-kai-dim">Probing local endpoints…</p>
      )}

      {providers && (
        <div className="divide-y divide-border rounded-md border border-border">
          {providers.map((p) => (
            <LocalRow key={p.name} provider={p} />
          ))}
        </div>
      )}

      {providers && running.length === 0 && (
        <p className="font-mono text-[10px] leading-relaxed text-kai-dim">
          Nothing is listening. Start Ollama, LM Studio, llama.cpp, vLLM or Jan and scan again.
        </p>
      )}

      <EmbeddingPicker embed={embed} running={running} onChange={onEmbedChange} />

      {adding ? (
        <AddEndpoint
          onDone={() => {
            setAdding(false)
            void probe()
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
          <Plus size={12} />
          <span className="ml-1">Add a custom endpoint</span>
        </Button>
      )}
    </div>
  )
}

function LocalRow({ provider }: { provider: LocalProviderStatus }) {
  const [expanded, setExpanded] = useState(false)
  const models = provider.models ?? []

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2">
        <Cpu size={12} className={cn("shrink-0", provider.running ? "text-kai-green" : "text-kai-dim")} />
        <span className="font-mono text-[11px] text-kai-text">{provider.label || provider.name}</span>
        {provider.running ? (
          <Badge tone="green">up · {provider.latency_ms}ms</Badge>
        ) : (
          <Badge tone="neutral">offline</Badge>
        )}
        <span className="ml-auto shrink-0 font-mono text-[10px] text-kai-dim">
          {provider.base_url}
        </span>
      </div>

      {provider.running && models.length > 0 && (
        <div className="mt-1.5 pl-5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="font-mono text-[10px] text-kai-dim hover:text-kai-text"
          >
            {models.length} model{models.length === 1 ? "" : "s"} {expanded ? "▾" : "▸"}
          </button>
          {expanded && (
            <ul className="mt-1 space-y-0.5">
              {models.map((m) => (
                <li key={m} className="font-mono text-[10px] text-kai-muted">
                  {m}
                </li>
              ))}
            </ul>
          )}
          {/* The config line is the actual handoff: knowing a model exists is
              useless without knowing what to write down to use it. */}
          {expanded && (
            <p className="mt-1.5 font-mono text-[10px] text-kai-dim">
              set <span className="text-kai-text">provider: {provider.name}</span> and a{" "}
              <span className="text-kai-text">model</span> above to use it
            </p>
          )}
        </div>
      )}

      {provider.running && models.length === 0 && (
        <p className="mt-1 pl-5 font-mono text-[10px] text-kai-dim">
          running, but no models pulled yet
        </p>
      )}

      {!provider.running && provider.error && (
        <p className="mt-1 pl-5 font-mono text-[10px] text-kai-dim">{provider.error}</p>
      )}
    </div>
  )
}

// EmbeddingPicker is here rather than in a search section because the answer
// is almost always a local model: embedding a whole wiki against a hosted API
// costs real money for a job a laptop does fine.
function EmbeddingPicker({
  embed,
  running,
  onChange,
}: {
  embed: EmbedSettings | null
  running: LocalProviderStatus[]
  onChange: (next: EmbedSettings) => void
}) {
  const [saving, setSaving] = useState(false)
  const [model, setModel] = useState(embed?.model ?? "")
  const [provider, setProvider] = useState(embed?.provider ?? "")

  useEffect(() => {
    setModel(embed?.model ?? "")
    setProvider(embed?.provider ?? "")
  }, [embed?.model, embed?.provider])

  const save = async (nextModel: string, nextProvider: string) => {
    setSaving(true)
    try {
      const res = await api.putEmbed({ model: nextModel, provider: nextProvider })
      onChange(res)
    } finally {
      setSaving(false)
    }
  }

  // Anything with "embed" in the name is an embedding model; suggesting those
  // first saves the user from guessing which of their chat models will work.
  const suggestions = running.flatMap((p) =>
    (p.models ?? [])
      .filter((m) => m.toLowerCase().includes("embed"))
      .map((m) => ({ provider: p.name, model: m }))
  )

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <Search size={12} className="shrink-0 text-kai-orange" />
        <span className="font-mono text-[11px] font-bold text-kai-text">Semantic search</span>
        {embed?.enabled ? <Badge tone="green">on</Badge> : <Badge tone="neutral">lexical only</Badge>}
      </div>

      <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-kai-dim">
        Search always runs BM25, which needs no model at all. Naming an embedding model adds
        vector ranking on top, so a question finds a chapter that uses different words than
        the question did.
      </p>

      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s.provider + s.model}
              type="button"
              disabled={saving}
              onClick={() => {
                setModel(s.model)
                setProvider(s.provider)
                void save(s.model, s.provider)
              }}
              className={cn(
                "rounded border px-2 py-0.5 font-mono text-[10px] transition-colors",
                embed?.model === s.model
                  ? "border-kai-green/40 bg-kai-green/10 text-kai-green"
                  : "border-border text-kai-dim hover:text-kai-text"
              )}
            >
              {embed?.model === s.model && <Check size={9} className="mr-1 inline" />}
              {s.model}
              <span className="ml-1 text-kai-dim/70">· {s.provider}</span>
            </button>
          ))}
        </div>
      )}

      {suggestions.length === 0 && (
        <p className="mt-2 font-mono text-[10px] text-kai-dim">
          No embedding model found locally. With Ollama running:{" "}
          <span className="text-kai-text">ollama pull nomic-embed-text</span>
        </p>
      )}

      <div className="mt-2 flex gap-2">
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="embedding model id"
          className="flex-1 rounded border border-border bg-panel px-2 py-1 font-mono text-[11px]
                     text-kai-text outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        />
        <input
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="provider"
          className="w-32 rounded border border-border bg-panel px-2 py-1 font-mono text-[11px]
                     text-kai-text outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        />
        <Button size="sm" onClick={() => void save(model, provider)} disabled={saving}>
          {saving ? <Spinner size={12} /> : "Save"}
        </Button>
      </div>

      {embed?.enabled && (
        <p className="mt-2 font-mono text-[10px] text-kai-dim">
          Run <span className="text-kai-text">kaioken index</span> to embed the existing wiki —
          searching alone will not backfill vectors.
        </p>
      )}
    </div>
  )
}

function AddEndpoint({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("")
  const [baseURL, setBaseURL] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const st = await api.addLocalProvider({ name, base_url: baseURL })
      if (!st.running) {
        // Saved anyway: an endpoint that is merely not started yet is a
        // perfectly good thing to have configured.
        setError(st.error ?? "saved, but the endpoint did not answer")
        setBusy(false)
        return
      }
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="name (e.g. workstation)"
          className="w-40 rounded border border-border bg-panel px-2 py-1 font-mono text-[11px]
                     text-kai-text outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        />
        <input
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          placeholder="http://10.0.0.5:8000/v1"
          className="flex-1 rounded border border-border bg-panel px-2 py-1 font-mono text-[11px]
                     text-kai-text outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        />
      </div>
      {error && <p className="font-mono text-[10px] text-kai-amber">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void submit()} disabled={busy || !name || !baseURL}>
          {busy ? <Spinner size={12} /> : "Add"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <span className="self-center font-mono text-[10px] text-kai-dim">
          any OpenAI-compatible server
        </span>
      </div>
      {error && (
        <Button variant="ghost" size="sm" onClick={onDone}>
          Keep it anyway
        </Button>
      )}
    </div>
  )
}
