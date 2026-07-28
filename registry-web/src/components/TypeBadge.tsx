import { entryType } from "../lib/filter"
import type { IndexEntry } from "../../api/_lib/types"

// The capability tier is the single most important fact about an extension,
// so it gets a consistent color everywhere: green = runs no code,
// amber = unsandboxed subprocess, blue = sandboxed wasm.
const TIER_STYLE: Record<string, string> = {
  declarative: "text-kai-green border-kai-green/40 bg-kai-green/10",
  mcp: "text-kai-amber border-kai-amber/40 bg-kai-amber/10",
  wasm: "text-kai-blue border-kai-blue/40 bg-kai-blue/10",
}

export function TypeBadge({ type }: { type: string }) {
  const t = type || "declarative"
  const style = TIER_STYLE[t] ?? "text-kai-muted border-kai-line bg-kai-panel"
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none ${style}`}>
      {t}
    </span>
  )
}

export function EntryBadges({ entry }: { entry: IndexEntry }) {
  const deprecated = (entry.flags ?? []).some((f) => f.toLowerCase() === "deprecated")
  return (
    <span className="inline-flex items-center gap-1.5">
      <TypeBadge type={entryType(entry)} />
      {deprecated && (
        <span className="inline-block rounded border border-kai-amber/40 bg-kai-amber/10 px-1.5 py-0.5 font-mono text-[10px] leading-none text-kai-amber">
          deprecated
        </span>
      )}
    </span>
  )
}
