import { useState } from "react"
import { Link } from "react-router-dom"
import type { ValidationReport } from "../../api/_lib/types"
import { api } from "../lib/api"

const REGISTRY_EDIT_URL = "https://github.com/babtix/kaioken-extensions/edit/main/community-extensions.json"

// The submit wizard: validate a repo with the same rules `kaioken ext
// validate` applies, then hand the author the exact index entry and the PR
// link. The wizard writes nothing anywhere — listing is always a reviewed
// GitHub pull request, so validation here can never bypass moderation.
export default function Submit() {
  const [repo, setRepo] = useState("")
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<ValidationReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const run = () => {
    if (!repo.trim() || busy) return
    setBusy(true)
    setReport(null)
    setError(null)
    api
      .validate(repo)
      .then(setReport)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const entryJSON = report?.entry ? JSON.stringify(report.entry, null, 2) : ""
  const copy = () => {
    navigator.clipboard.writeText(entryJSON).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="animate-rise max-w-2xl">
      <h1 className="mb-2 font-mono text-xl font-bold text-kai-white">Submit an extension</h1>
      <p className="mb-6 text-sm text-kai-muted">
        Publishing is a three-step flow: build and release your extension on GitHub, validate it
        here, then open a pull request adding one JSON entry to the community index. Reviewers merge
        it; nothing lists without review. New to this? Start with the{" "}
        <Link to="/docs/developer-guide" className="text-kai-blue underline">
          developer guide
        </Link>
        .
      </p>

      <div className="flex gap-2">
        <input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="owner/repo or a github.com URL"
          className="h-10 min-w-0 flex-1 rounded-md border border-kai-line bg-kai-panel px-3 font-mono text-xs text-kai-text outline-none transition-colors focus:border-kai-orange/60"
        />
        <button
          onClick={run}
          disabled={busy || !repo.trim()}
          className="lift h-10 shrink-0 rounded-md border border-kai-orange/70 bg-kai-orange/10 px-4 font-mono text-xs font-bold text-kai-orange transition-colors hover:bg-kai-orange/20 disabled:opacity-40"
        >
          {busy ? "validating…" : "validate"}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-kai-rose/30 bg-kai-rose/5 p-3 font-mono text-xs text-kai-rose">
          {error}
        </p>
      )}

      {report && (
        <div className="mt-6 flex flex-col gap-4">
          <section className="rounded-md border border-kai-line bg-kai-ink p-4">
            <h2 className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-kai-orange">
              report for {report.repo}
            </h2>
            {report.errors.length === 0 ? (
              <p className="font-mono text-xs text-kai-green">✓ valid — ready to submit</p>
            ) : (
              <ul className="list-disc pl-5 font-mono text-xs text-kai-rose">
                {report.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {report.warnings.length > 0 && (
              <ul className="mt-2 list-disc pl-5 font-mono text-xs text-kai-amber">
                {report.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </section>

          {report.ok && report.entry && (
            <section className="rounded-md border border-kai-green/30 bg-kai-ink p-4">
              <h2 className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-kai-green">
                your index entry
              </h2>
              <div className="relative">
                <pre className="overflow-x-auto rounded border border-kai-line bg-kai-panel p-3 font-mono text-[11px]">
                  {entryJSON}
                </pre>
                <button
                  onClick={copy}
                  className="absolute right-2 top-2 rounded-md border border-kai-line bg-kai-ink px-2 py-1 font-mono text-[10px] text-kai-muted transition-colors hover:border-kai-dim hover:text-kai-text"
                >
                  {copied ? "copied" : "copy"}
                </button>
              </div>
              <ol className="mt-3 list-decimal pl-5 text-xs text-kai-muted">
                <li>Copy the entry above.</li>
                <li>
                  <a href={REGISTRY_EDIT_URL} target="_blank" rel="noreferrer" className="text-kai-blue underline">
                    Edit community-extensions.json on GitHub
                  </a>{" "}
                  (GitHub forks automatically) and append it to the array — alphabetical by id, please.
                </li>
                <li>
                  Open the pull request. The PR template's checklist plus CI's deep validation run
                  there; a reviewer merges it and your extension appears in <code>kaioken ext search</code>,
                  the TUI browser, the desktop app and this site.
                </li>
              </ol>
              <p className="mt-3 font-mono text-[11px] text-kai-dim">
                Fix a warning first? Add optional fields by hand: `tags` (max 5, kebab-case) and
                `homepage` (https). Review criteria live in the registry's MODERATION.md.
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
