import type { ReactNode } from "react"
import type { IndexEntry, ManifestData } from "../../api/_lib/types"
import { entryType } from "../lib/filter"

// The trust panel says, in the same language the app itself uses, exactly
// what installing and trusting this extension means. It must never soften
// the mcp story or oversell the wasm sandbox.
export function TrustPanel({ entry, manifest }: { entry: IndexEntry; manifest: ManifestData | null }) {
  const type = entryType(entry)

  if (type === "mcp") {
    const cmd = manifest?.mcp?.command
      ? [manifest.mcp.command, ...(manifest.mcp.args ?? [])].join(" ")
      : "(command unavailable — see the repository)"
    return (
      <Panel tone="amber" title="runs a server process — UNSANDBOXED">
        <p>
          After you explicitly trust it, Kaioken runs this command on your machine with your user's
          permissions:
        </p>
        <pre className="my-2 overflow-x-auto rounded border border-kai-amber/30 bg-kai-ink px-3 py-2 font-mono text-xs text-kai-amber">
          {cmd}
        </pre>
        <ul className="list-disc pl-5">
          <li>Installs inert — nothing runs until <Code>kaioken ext trust {entry.id}</Code></li>
          <li>Trust is per version: every update revokes it until you re-approve</li>
          <li>Each tool call still goes through Kaioken's normal approval prompt</li>
        </ul>
      </Panel>
    )
  }

  if (type === "wasm") {
    const perms = entry.permissions ?? manifest?.permissions ?? []
    return (
      <Panel tone="blue" title="sandboxed WASM plugin">
        <p>
          Runs inside Kaioken's wazero sandbox: <strong>no network, no environment, memory-capped</strong>,
          and no filesystem beyond what its declared permissions grant.
        </p>
        <p className="mt-2 font-mono text-xs text-kai-muted">permissions:</p>
        {perms.length === 0 ? (
          <p className="font-mono text-xs text-kai-green">none — fully isolated</p>
        ) : (
          <ul className="list-disc pl-5 font-mono text-xs">
            {perms.map((p) => (
              <li key={p}>
                <span className="text-kai-blue">{p}</span>
                {p === "fs:read:workspace" && (
                  <span className="text-kai-muted"> — mounts your repo read-only at /workspace</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <ul className="mt-2 list-disc pl-5">
          <li>Installs inert — trust it per version with <Code>kaioken ext trust {entry.id}</Code></li>
          <li>Tool calls still require approval, like every other tool</li>
        </ul>
      </Panel>
    )
  }

  return (
    <Panel tone="green" title="declarative — runs no code">
      <p>
        Contributes skills (documents the agent reads) and nothing else. No process, no module, no
        trust step. The skills do enter your agent's context, so read them like you would any prompt
        material.
      </p>
    </Panel>
  )
}

function Panel({ tone, title, children }: { tone: "green" | "amber" | "blue"; title: string; children: ReactNode }) {
  const border = { green: "border-kai-green/30", amber: "border-kai-amber/40", blue: "border-kai-blue/30" }[tone]
  const heading = { green: "text-kai-green", amber: "text-kai-amber", blue: "text-kai-blue" }[tone]
  return (
    <section className={`rounded-md border ${border} bg-kai-ink p-4 text-sm`}>
      <h3 className={`mb-2 font-mono text-xs font-bold uppercase tracking-wider ${heading}`}>{title}</h3>
      {children}
    </section>
  )
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-kai-line bg-kai-panel px-1 py-0.5 font-mono text-xs">{children}</code>
  )
}
