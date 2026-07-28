import { useEffect, useState } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Download, ExternalLink, FolderGit2, Puzzle, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react"
import { Badge, Button, Modal, SectionLabel, Spinner } from "@/components/ui"
import { REGISTRY_LINKS, REGISTRY_WEB_URL } from "@/lib/links"
import { useExtensionsStore } from "@/store/extensions"
import type { ExtensionInfo } from "@/lib/types"

// Extensions: per-user packages from GitHub releases. Declarative ones
// contribute skills and never run code; mcp/wasm ones contribute agent tools
// and stay inert until the user explicitly trusts the exact installed
// version — the trust dialog here is that consent step, so it must show
// precisely what trusting allows to run.

const TYPE_TONE = { declarative: "sage", mcp: "amber", wasm: "blue" } as const

/** Open a registry web page in the system browser (same pattern as Browser.tsx). */
const openWeb = (url: string) => {
  void openUrl(url).catch(() => {})
}

export default function Extensions() {
  const {
    extensions, registry, registryError, loading, busy,
    refresh, loadRegistry, install, installDev, remove, setEnabled, trust, untrust, updateAll,
  } = useExtensionsStore()

  const [source, setSource] = useState("")
  const [devPath, setDevPath] = useState("")
  const [query, setQuery] = useState("")
  const [trusting, setTrusting] = useState<ExtensionInfo | null>(null)

  useEffect(() => {
    refresh()
    loadRegistry()
  }, [refresh, loadRegistry])

  const installedIds = new Set(extensions.map((e) => e.id))

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 font-mono text-lg font-bold text-kai-text">
              <Puzzle size={18} className="text-kai-orange" /> Extensions
            </h1>
            <p className="mt-1 font-mono text-xs text-kai-dim">
              Per-user packages installed from GitHub releases. One install serves every repository.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => openWeb(REGISTRY_WEB_URL)} title="Open the extension registry website in your browser">
              <ExternalLink size={12} /> Registry
            </Button>
            <Button size="sm" onClick={() => refresh()} title="Refresh">
              <RefreshCw size={12} /> Refresh
            </Button>
            <Button size="sm" loading={busy === "@update"} onClick={() => updateAll()}>
              Update all
            </Button>
          </div>
        </div>

        {/* Installed */}
        <SectionLabel>Installed</SectionLabel>
        {loading && extensions.length === 0 ? (
          <div className="py-6 text-center"><Spinner /></div>
        ) : extensions.length === 0 ? (
          <p className="rounded-md border border-border bg-panel/40 p-4 font-mono text-xs text-kai-dim">
            No extensions installed yet — browse the registry below or install straight from a GitHub repo.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {extensions.map((e) => (
              <ExtensionRow
                key={e.id}
                ext={e}
                busy={busy === e.id}
                onEnable={(en) => setEnabled(e.id, en)}
                onTrust={() => setTrusting(e)}
                onUntrust={() => untrust(e.id)}
                onRemove={() => remove(e.id)}
              />
            ))}
          </div>
        )}

        {/* Install directly */}
        <div className="mt-8">
          <SectionLabel>Install</SectionLabel>
          <div className="flex gap-2">
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && source.trim()) install(source.trim()).then((ok) => ok && setSource("")) }}
              placeholder="owner/repo[@1.2.0]"
              className="h-9 flex-1 rounded-md border border-border bg-panel px-3 font-mono text-xs text-kai-text outline-none focus:border-kai-orange/60"
            />
            <Button
              variant="primary"
              size="md"
              loading={busy === source.trim() && source.trim() !== ""}
              disabled={!source.trim()}
              onClick={() => install(source.trim()).then((ok) => ok && setSource(""))}
            >
              <Download size={13} /> Install
            </Button>
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={devPath}
              onChange={(e) => setDevPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && devPath.trim()) installDev(devPath.trim()).then((ok) => ok && setDevPath("")) }}
              placeholder="local extension directory (author dev loop)"
              className="h-9 flex-1 rounded-md border border-border bg-panel px-3 font-mono text-xs text-kai-text outline-none focus:border-kai-orange/60"
            />
            <Button
              size="md"
              loading={busy === devPath.trim() && devPath.trim() !== ""}
              disabled={!devPath.trim()}
              onClick={() => installDev(devPath.trim()).then((ok) => ok && setDevPath(""))}
            >
              <FolderGit2 size={13} /> Dev install
            </Button>
          </div>
        </div>

        {/* Registry */}
        <div className="mt-8">
          <SectionLabel>Community registry</SectionLabel>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); loadRegistry(e.target.value) }}
            placeholder="search extensions…"
            className="mb-2 h-9 w-full rounded-md border border-border bg-panel px-3 font-mono text-xs text-kai-text outline-none focus:border-kai-orange/60"
          />
          {registryError ? (
            <p className="rounded-md border border-kai-amber/30 bg-kai-amber/5 p-3 font-mono text-xs text-kai-amber">
              Registry unreachable ({registryError}) — direct install above still works, and the{" "}
              <button
                type="button"
                onClick={() => openWeb(`${REGISTRY_WEB_URL}/browse`)}
                className="underline underline-offset-2 outline-none hover:text-kai-text focus-visible:text-kai-text"
              >
                web catalog
              </button>{" "}
              stays browsable.
            </p>
          ) : registry.length === 0 ? (
            <p className="rounded-md border border-border bg-panel/40 p-3 font-mono text-xs text-kai-dim">
              No matching extensions in the registry.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {registry.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-md border border-border bg-panel/40 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-xs font-bold text-kai-text">{r.id}</span>
                    <Badge className="ml-2" tone={TYPE_TONE[r.type as keyof typeof TYPE_TONE] ?? "neutral"}>{r.type}</Badge>
                    <span className="ml-2 font-mono text-[10px] text-kai-dim">{r.repo}</span>
                    <p className="truncate font-mono text-[11px] text-kai-muted">{r.description}</p>
                  </div>
                  {installedIds.has(r.id) ? (
                    <Badge tone="green">installed</Badge>
                  ) : (
                    <Button size="sm" loading={busy === r.repo} onClick={() => install(r.repo)}>
                      <Download size={11} /> Install
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Registry website — every page, opened in the system browser */}
        <div className="mt-8 pb-8">
          <SectionLabel>Registry website</SectionLabel>
          <p className="mb-2 font-mono text-[11px] text-kai-dim">
            The full catalog with READMEs, trust details, submission wizard and docs — opens in your browser.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {REGISTRY_LINKS.map((l) => (
              <button
                key={l.url}
                type="button"
                title={l.description}
                onClick={() => openWeb(l.url)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-panel/40 px-2.5 py-1.5 font-mono text-[11px] text-kai-muted outline-none transition-colors hover:border-kai-orange/50 hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50"
              >
                {l.label} <ExternalLink size={10} className="text-kai-dim" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <TrustDialog
        ext={trusting}
        busy={trusting !== null && busy === trusting.id}
        onClose={() => setTrusting(null)}
        onConfirm={async () => {
          if (!trusting) return
          const tools = await trust(trusting.id)
          if (tools !== null) setTrusting(null)
        }}
      />
    </div>
  )
}

function ExtensionRow({
  ext, busy, onEnable, onTrust, onUntrust, onRemove,
}: {
  ext: ExtensionInfo
  busy: boolean
  onEnable: (enabled: boolean) => void
  onTrust: () => void
  onUntrust: () => void
  onRemove: () => void
}) {
  const type = ext.type || "declarative"
  const executable = type === "mcp" || type === "wasm"
  return (
    <div className="rounded-md border border-border bg-panel/40 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-bold text-kai-text">{ext.id}</span>
        <Badge tone="neutral">{ext.version}</Badge>
        <Badge tone={TYPE_TONE[type as keyof typeof TYPE_TONE] ?? "neutral"}>{type}</Badge>
        {ext.local && <Badge tone="orange">dev</Badge>}
        {executable && (ext.trusted ? <Badge tone="green">trusted</Badge> : <Badge tone="rose">UNTRUSTED</Badge>)}
        {!ext.enabled && <Badge tone="neutral">disabled</Badge>}
        <div className="flex-1" />
        {ext.needs_trust && (
          <Button size="sm" variant="primary" onClick={onTrust}>
            <ShieldAlert size={11} /> Trust…
          </Button>
        )}
        {executable && ext.trusted && (
          <Button size="sm" loading={busy} onClick={onUntrust}>
            <ShieldCheck size={11} /> Untrust
          </Button>
        )}
        <Button size="sm" onClick={() => onEnable(!ext.enabled)}>{ext.enabled ? "Disable" : "Enable"}</Button>
        <Button size="sm" variant="danger" loading={busy} onClick={onRemove} title="Uninstall">
          <Trash2 size={11} />
        </Button>
      </div>
      {ext.error ? (
        <p className="mt-1 font-mono text-[11px] text-kai-rose">{ext.error}</p>
      ) : (
        <>
          {ext.description && <p className="mt-1 font-mono text-[11px] text-kai-muted">{ext.description}</p>}
          <p className="mt-0.5 font-mono text-[10px] text-kai-dim">
            {ext.local ? "local dev install — refresh with a new dev install" : `${ext.repo} · ${ext.tag}`}
            {ext.skills.length > 0 && ` · ${ext.skills.length} skill(s): ${ext.skills.map((s) => s.name).join(", ")}`}
          </p>
        </>
      )}
    </div>
  )
}

// TrustDialog is the consent step. It must show exactly what trusting allows
// to run — the command line for mcp, the module and permissions for wasm —
// and never make "yes" the effortless default.
function TrustDialog({
  ext, busy, onClose, onConfirm,
}: {
  ext: ExtensionInfo | null
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Modal open={ext !== null} onClose={onClose} labelledBy="trust-title">
      {ext && (
        <div className="p-5">
          <h2 id="trust-title" className="flex items-center gap-2 font-mono text-sm font-bold text-kai-text">
            <ShieldAlert size={15} className="text-kai-amber" />
            Trust {ext.id} {ext.version}?
          </h2>

          {ext.type === "mcp" ? (
            <>
              <p className="mt-3 font-mono text-xs text-kai-rose">
                This extension wants to run an MCP server on your machine, UNSANDBOXED:
              </p>
              <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-panel p-2.5 font-mono text-[11px] text-kai-text">
                {ext.command || "(no command declared)"}
              </pre>
              <p className="mt-2 font-mono text-[11px] text-kai-dim">
                Kaioken cannot restrict what this process does. Trust it only if you trust its author.
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 font-mono text-xs text-kai-text">
                This extension wants to run a <span className="text-kai-green">sandboxed</span> wasm plugin:
              </p>
              <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-panel p-2.5 font-mono text-[11px] text-kai-text">
                {`module:      ${ext.wasm_entry || "(none)"}\npermissions: ${ext.permissions?.length ? ext.permissions.join(", ") : "none — fully isolated"}`}
              </pre>
              <p className="mt-2 font-mono text-[11px] text-kai-dim">
                No network, no environment, memory capped. fs:read:workspace mounts your repository read-only.
              </p>
            </>
          )}

          <p className="mt-2 font-mono text-[11px] text-kai-dim">
            Trust applies to this exact version; updates revoke it. Every tool call still asks for approval.
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <Button size="md" onClick={onClose}>Cancel</Button>
            <Button size="md" variant={ext.type === "mcp" ? "danger" : "primary"} loading={busy} onClick={onConfirm}>
              Trust and run
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
