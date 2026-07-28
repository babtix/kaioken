import { Link } from "react-router-dom"

// The front door: says what the ecosystem is in one screen and routes to
// every section — browse, submit, docs — plus the source repositories.
// The tier cards repeat the trust story because it is the one thing a
// first-time visitor must leave with.

const TIERS = [
  {
    name: "declarative",
    color: "text-kai-green border-kai-green/40",
    title: "Skills",
    blurb: "Documents the agent reads — project know-how, conventions, procedures. Runs no code, needs no trust.",
  },
  {
    name: "mcp",
    color: "text-kai-amber border-kai-amber/40",
    title: "MCP tools",
    blurb: "A server process contributing live tools. Runs unsandboxed — installs inert until you trust the exact version.",
  },
  {
    name: "wasm",
    color: "text-kai-blue border-kai-blue/40",
    title: "WASM plugins",
    blurb: "Sandboxed tools under wazero: no network, no environment, memory-capped, permission-gated file access.",
  },
] as const

const SECTIONS = [
  {
    to: "/browse",
    label: "/browse",
    title: "Browse extensions",
    blurb: "Search the community catalog, filter by tier and tag, read trust details before installing.",
  },
  {
    to: "/submit",
    label: "/submit",
    title: "Submit yours",
    blurb: "Validate your repository with the same rules the CLI applies and get a ready-to-open PR.",
  },
  {
    to: "/docs/developer-guide",
    label: "/docs",
    title: "Documentation",
    blurb: "Everything for authors and users — see the guide list below.",
  },
] as const

const GUIDES = [
  { to: "/docs/developer-guide", title: "Developer guide", blurb: "manifest reference, all three tiers, the dev loop" },
  { to: "/docs/packaging-publishing", title: "Packaging & publishing", blurb: "versioning, releases, how installs and updates work" },
  { to: "/docs/submitting", title: "Submitting to the registry", blurb: "entry format, CI checks, review criteria" },
  { to: "/docs/user-guide", title: "User guide", blurb: "discovering, installing, the trust model, managing" },
] as const

export default function Home() {
  return (
    <div className="flex flex-col gap-12">
      {/* Hero */}
      <section className="pt-8 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-kai-dim">community registry</p>
        <h1 className="mt-3 font-mono text-3xl font-bold text-kai-white sm:text-4xl">
          Extend <span className="text-kai-orange">Kaioken</span> with the community
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-kai-muted">
          Skills, MCP tools and sandboxed WASM plugins for the Kaioken terminal AI coding assistant.
          Everything installs from the author's own GitHub releases; executable extensions stay
          inert until you explicitly trust that exact version.
        </p>
        <div className="mx-auto mt-6 inline-block rounded-md border border-kai-line bg-kai-ink px-4 py-2.5">
          <code className="font-mono text-xs text-kai-blue">kaioken ext install owner/repo</code>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/browse"
            className="h-10 rounded-md border border-kai-orange/70 bg-kai-orange/10 px-5 font-mono text-xs font-bold leading-10 text-kai-orange transition-colors hover:bg-kai-orange/20"
          >
            browse extensions →
          </Link>
          <Link
            to="/submit"
            className="h-10 rounded-md border border-kai-line bg-kai-panel px-5 font-mono text-xs leading-10 text-kai-text transition-colors hover:border-kai-orange/50"
          >
            publish yours
          </Link>
          <Link
            to="/docs/developer-guide"
            className="h-10 rounded-md border border-kai-line bg-kai-panel px-5 font-mono text-xs leading-10 text-kai-text transition-colors hover:border-kai-orange/50"
          >
            read the docs
          </Link>
        </div>
      </section>

      {/* Three tiers */}
      <section>
        <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-kai-orange">
          three capability tiers
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {TIERS.map((t) => (
            <div key={t.name} className={`rounded-md border bg-kai-ink p-4 ${t.color}`}>
              <p className="font-mono text-[10px] uppercase tracking-wider">{t.name}</p>
              <p className="mt-1 font-mono text-sm font-bold text-kai-white">{t.title}</p>
              <p className="mt-2 text-xs text-kai-muted">{t.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Site guide */}
      <section>
        <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-kai-orange">
          find your way
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SECTIONS.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="group rounded-md border border-kai-line bg-kai-ink p-4 transition-colors hover:border-kai-orange/50"
            >
              <p className="font-mono text-[11px] text-kai-dim">{s.label}</p>
              <p className="mt-1 font-mono text-sm font-bold text-kai-white group-hover:text-kai-orange">
                {s.title}
              </p>
              <p className="mt-2 text-xs text-kai-muted">{s.blurb}</p>
            </Link>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {GUIDES.map((g) => (
            <Link
              key={g.to}
              to={g.to}
              className="group flex items-baseline gap-2 rounded-md border border-kai-line bg-kai-panel/40 px-3 py-2 transition-colors hover:border-kai-orange/50"
            >
              <span className="font-mono text-xs font-bold text-kai-text group-hover:text-kai-orange">
                {g.title}
              </span>
              <span className="truncate font-mono text-[11px] text-kai-dim">— {g.blurb}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* For users / for authors */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-kai-line bg-kai-ink p-4">
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-kai-orange">for users</h3>
          <ul className="mt-2 list-disc pl-5 text-xs text-kai-muted">
            <li>
              Install from anywhere: <code className="font-mono text-kai-text">kaioken ext install owner/repo</code>,{" "}
              pin with <code className="font-mono text-kai-text">@1.2.0</code>
            </li>
            <li>Also in the TUI (/ext browse) and the desktop app's Extensions screen</li>
            <li>Updates never happen silently; updating revokes trust until you re-approve</li>
            <li>
              Start with the <Link to="/docs/user-guide" className="text-kai-blue underline">user guide</Link>
            </li>
          </ul>
        </div>
        <div className="rounded-md border border-kai-line bg-kai-ink p-4">
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-kai-orange">for authors</h3>
          <ul className="mt-2 list-disc pl-5 text-xs text-kai-muted">
            <li>
              Start from the{" "}
              <a
                href="https://github.com/babtix/kaioken-extension-template"
                target="_blank"
                rel="noreferrer"
                className="text-kai-blue underline"
              >
                extension template
              </a>{" "}
              and iterate with <code className="font-mono text-kai-text">kaioken ext dev .</code>
            </li>
            <li>Publish = tag a GitHub release; the source zipball is the package</li>
            <li>
              List it via the <Link to="/submit" className="text-kai-blue underline">submit wizard</Link> — one
              reviewed PR to the{" "}
              <a
                href="https://github.com/babtix/kaioken-extensions"
                target="_blank"
                rel="noreferrer"
                className="text-kai-blue underline"
              >
                community index
              </a>
            </li>
            <li>
              Full flow in the <Link to="/docs/developer-guide" className="text-kai-blue underline">developer guide</Link>
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}
