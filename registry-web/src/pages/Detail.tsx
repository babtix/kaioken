import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import type { ExtDetail } from "../../api/_lib/types"
import { Markdown } from "../components/Markdown"
import { TrustPanel } from "../components/TrustPanel"
import { EntryBadges } from "../components/TypeBadge"
import { api } from "../lib/api"
import { hasFlag, installCommand } from "../lib/filter"

export default function Detail() {
  const { id = "" } = useParams()
  const [detail, setDetail] = useState<ExtDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setDetail(null)
    setError(null)
    api
      .ext(id)
      .then(setDetail)
      .catch((e: Error) => setError(e.message))
  }, [id])

  if (error) {
    return (
      <div>
        <p className="rounded-md border border-kai-rose/30 bg-kai-rose/5 p-3 font-mono text-xs text-kai-rose">{error}</p>
        <Link to="/browse" className="mt-4 inline-block font-mono text-xs text-kai-blue underline">
          ← back to browse
        </Link>
      </div>
    )
  }
  if (!detail) return <p className="font-mono text-xs text-kai-dim">loading…</p>

  const { entry, manifest, manifest_problems, readme, releases } = detail
  const malicious = hasFlag(entry, "malicious")
  const cmd = installCommand(entry)

  const copy = () => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-bold text-kai-white">{entry.name}</h1>
          <EntryBadges entry={entry} />
        </div>
        <p className="font-mono text-xs text-kai-dim">
          {entry.id}
          {entry.version ? ` · v${entry.version}` : ""}
          {entry.author ? ` · by ${entry.author}` : ""}
          {typeof entry.downloads === "number" ? ` · ${entry.downloads} downloads` : ""}
        </p>
        <p className="mt-3 text-sm text-kai-muted">{entry.description}</p>

        {malicious && (
          <p className="mt-4 rounded-md border border-kai-rose/40 bg-kai-rose/10 p-3 font-mono text-xs text-kai-rose">
            This extension has been flagged MALICIOUS by the registry moderators. Kaioken clients
            refuse to install or update it. Do not install it manually.
          </p>
        )}
        {hasFlag(entry, "deprecated") && !malicious && (
          <p className="mt-4 rounded-md border border-kai-amber/30 bg-kai-amber/5 p-3 font-mono text-xs text-kai-amber">
            The author has deprecated this extension. It still installs, but expect no updates.
          </p>
        )}
        {manifest_problems.length > 0 && !malicious && (
          <div className="mt-4 rounded-md border border-kai-amber/30 bg-kai-amber/5 p-3 font-mono text-xs text-kai-amber">
            <p className="mb-1 font-bold">manifest problems at the latest release:</p>
            <ul className="list-disc pl-5">
              {manifest_problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {readme ? (
          <div className="mt-6 border-t border-kai-line pt-2">
            <Markdown>{readme}</Markdown>
          </div>
        ) : (
          <p className="mt-6 font-mono text-xs text-kai-dim">this repository has no README.</p>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        {!malicious && (
          <section className="rounded-md border border-kai-line bg-kai-ink p-4">
            <h3 className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-kai-orange">install</h3>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded border border-kai-line bg-kai-panel px-2 py-1.5 font-mono text-[11px]">
                {cmd}
              </code>
              <button
                onClick={copy}
                className="h-8 shrink-0 rounded-md border border-kai-line bg-kai-panel px-2 font-mono text-[11px] text-kai-muted hover:text-kai-text"
              >
                {copied ? "copied" : "copy"}
              </button>
            </div>
            {entry.version && (
              <p className="mt-2 font-mono text-[11px] text-kai-dim">
                pin a version: <span className="text-kai-text">{`${cmd}@${entry.version}`}</span>
              </p>
            )}
            <p className="mt-2 font-mono text-[11px] text-kai-dim">
              or in the TUI: <span className="text-kai-text">/ext install {entry.repo}</span>
            </p>
          </section>
        )}

        <TrustPanel entry={entry} manifest={manifest} />

        <section className="rounded-md border border-kai-line bg-kai-ink p-4">
          <h3 className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-kai-orange">source</h3>
          <a
            href={`https://github.com/${entry.repo}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-kai-blue underline"
          >
            github.com/{entry.repo}
          </a>
          {entry.homepage && (
            <p className="mt-1">
              <a href={entry.homepage} target="_blank" rel="noreferrer" className="font-mono text-xs text-kai-blue underline">
                {entry.homepage}
              </a>
            </p>
          )}
        </section>

        <section className="rounded-md border border-kai-line bg-kai-ink p-4">
          <h3 className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-kai-orange">releases</h3>
          {releases.length === 0 ? (
            <p className="font-mono text-xs text-kai-dim">no releases yet — not installable until one is tagged.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {releases.map((r) => (
                <li key={r.tag} className="border-b border-kai-line pb-2 last:border-b-0 last:pb-0">
                  <p className="font-mono text-xs text-kai-text">
                    {r.tag}
                    <span className="text-kai-dim">
                      {r.published_at ? ` · ${r.published_at.slice(0, 10)}` : ""}
                      {r.downloads > 0 ? ` · ${r.downloads} downloads` : ""}
                    </span>
                  </p>
                  {r.notes && <p className="mt-1 line-clamp-3 text-[11px] text-kai-muted">{r.notes}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 font-mono text-[10px] text-kai-dim">
            updates never install silently: `kaioken ext update` shows old → new, and updating an mcp
            or wasm extension revokes its trust until you re-approve it.
          </p>
        </section>
      </aside>
    </div>
  )
}
