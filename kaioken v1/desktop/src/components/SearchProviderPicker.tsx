import { cn } from "@/lib/utils"

export type SearchProviderInfo = {
  name: string
  key_env: string
  signup: string
  has_key: boolean
  key_source: "config" | "env" | "none"
  hint?: string
}

export type SearchSettings = {
  provider: string
  providers: SearchProviderInfo[]
}

/** normalizeSelection folds the config spellings into one UI value. */
export function normalizeSelection(v: string): string {
  const s = (v || "").trim().toLowerCase()
  if (s === "" || s === "auto" || s === "all" || s === "both") return "both"
  return s
}

/**
 * SearchProviderPicker chooses which search engine(s) a research run asks.
 * "Both" fans the query out to every vendor with a key and merges the
 * results; a single name pins one. This governs search only — how pages are
 * read is a separate setting, and a Firecrawl key now drives its scraper
 * whatever is picked here. Keyless vendors render disabled rather than
 * hidden, so the way to enable them stays discoverable.
 */
export function SearchProviderPicker({
  value,
  providers,
  onChange,
  disabled = false,
}: {
  value: string
  providers: SearchProviderInfo[]
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const selected = normalizeSelection(value)
  const keyed = providers.filter((p) => p.has_key)

  const options: { value: string; label: string; enabled: boolean; title: string }[] = [
    {
      value: "both",
      label: "Both",
      enabled: keyed.length > 0,
      title:
        keyed.length > 1
          ? `Fan out to ${keyed.map((p) => p.name).join(" + ")} and merge results`
          : keyed.length === 1
            ? `Only ${keyed[0].name} has a key — add another in Settings to actually fan out`
            : "No search keys configured",
    },
    ...providers.map((p) => ({
      value: p.name,
      label: p.name,
      enabled: p.has_key,
      title: p.has_key ? `Use ${p.name} only` : `No API key — add one in Settings (${p.key_env})`,
    })),
  ]

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Search provider">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={selected === o.value}
          disabled={disabled || !o.enabled}
          title={o.title}
          onClick={() => onChange(o.value === "both" ? "both" : o.value)}
          className={cn(
            "rounded-[var(--radius)] border px-2 py-0.5 font-mono text-[10px] transition-colors outline-none",
            "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
            selected === o.value
              ? "border-kai-orange/60 bg-kai-orange/10 text-kai-orange"
              : "border-border bg-card text-kai-dim hover:border-kai-line hover:text-kai-text",
            (!o.enabled || disabled) && "cursor-not-allowed opacity-45"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
