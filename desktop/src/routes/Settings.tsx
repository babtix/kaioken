import { useEffect, useState } from "react"
import { useWorkspaceStore } from "@/store/workspace"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

export default function Settings() {
  const ws = useWorkspaceStore((s) => s.active)
  const [settings, setSettings] = useState<any>(null)
  const [wsConfig, setWsConfig] = useState<any>(null)
  const [keyInput, setKeyInput] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState("")

  useEffect(() => {
    api.settings().then(setSettings).catch(() => {})
  }, [])

  useEffect(() => {
    if (!ws) return
    api.getConfig(ws.id).then(setWsConfig).catch(() => {})
  }, [ws?.id])

  async function saveKey(provider: string) {
    const key = keyInput[provider]
    if (!key) return
    await api.putKey(provider, key)
    setKeyInput((s) => ({ ...s, [provider]: "" }))
    setMsg(`Key saved for ${provider}`)
    api.settings().then(setSettings)
  }

  async function saveConfig() {
    if (!ws || !wsConfig) return
    await api.putConfig(ws.id, wsConfig)
    setMsg("Config saved")
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {msg && <p className="font-mono text-xs text-kai-green">{msg}</p>}

      {/* Global settings */}
      <section>
        <h2 className="mb-2 font-mono text-xs font-bold text-kai-dim">PROVIDERS & KEYS</h2>
        {settings?.providers?.map((p: any) => (
          <div key={p.name} className="mb-2 flex items-center gap-2 rounded border border-border bg-card px-3 py-2">
            <span className="w-24 font-mono text-[11px] font-bold text-kai-text">{p.name}</span>
            <span className={cn("font-mono text-[10px]", p.has_key ? "text-kai-green" : "text-kai-dim")}>
              {p.has_key ? `✓ ${p.key_source} ${p.hint || ""}` : "no key"}
            </span>
            <input
              type="password"
              value={keyInput[p.name] || ""}
              onChange={(e) => setKeyInput((s) => ({ ...s, [p.name]: e.target.value }))}
              placeholder="API key…"
              className="ml-auto w-40 rounded border border-border bg-background px-2 py-0.5 font-mono text-[10px] text-kai-text"
            />
            <button onClick={() => saveKey(p.name)} className="rounded bg-accent px-2 py-0.5 font-mono text-[10px] text-kai-orange">Save</button>
          </div>
        ))}
      </section>

      {/* Workspace config */}
      {ws && wsConfig && (
        <section>
          <h2 className="mb-2 font-mono text-xs font-bold text-kai-dim">WORKSPACE CONFIG — {ws.name}</h2>
          <div className="space-y-2 rounded border border-border bg-card p-3">
            <label className="flex items-center gap-2 font-mono text-[11px] text-kai-muted">
              Model
              <input value={wsConfig.model || ""} onChange={(e) => setWsConfig({ ...wsConfig, model: e.target.value })}
                className="ml-auto w-64 rounded border border-border bg-background px-2 py-0.5 font-mono text-[10px] text-kai-text" />
            </label>
            <label className="flex items-center gap-2 font-mono text-[11px] text-kai-muted">
              Concurrency
              <input type="number" value={wsConfig.concurrency} onChange={(e) => setWsConfig({ ...wsConfig, concurrency: Number(e.target.value) })}
                className="ml-auto w-16 rounded border border-border bg-background px-2 py-0.5 font-mono text-[10px] text-kai-text" />
              {wsConfig.concurrency_clamped && <span className="text-[9px] text-kai-amber">clamped (free model)</span>}
            </label>
            <label className="flex items-center gap-2 font-mono text-[11px] text-kai-muted">
              Max module tokens
              <input type="number" value={wsConfig.max_module_tokens} onChange={(e) => setWsConfig({ ...wsConfig, max_module_tokens: Number(e.target.value) })}
                className="ml-auto w-20 rounded border border-border bg-background px-2 py-0.5 font-mono text-[10px] text-kai-text" />
            </label>
            <div className="font-mono text-[11px] text-kai-muted">
              Notes
              <textarea
                value={(wsConfig.notes || []).join("\n")}
                onChange={(e) => setWsConfig({ ...wsConfig, notes: e.target.value.split("\n").filter(Boolean) })}
                rows={3}
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1 font-mono text-[10px] text-kai-text"
                placeholder="Steering notes injected into every prompt…"
              />
            </div>
            <button onClick={saveConfig} className="rounded bg-accent px-3 py-1 font-mono text-xs text-kai-orange">Save config</button>
          </div>
        </section>
      )}
    </div>
  )
}
