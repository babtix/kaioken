import { cn } from "@/lib/utils"
import type { FetcherSettings } from "@/lib/types"

export type FetcherMode = "auto" | "headless" | "firecrawl" | "http"

export type FetcherModeOption = {
  value: FetcherMode
  label: string
  title: string
}

export const FETCHER_MODE_OPTIONS: FetcherModeOption[] = [
  {
    value: "auto",
    label: "Auto",
    title: "Use Firecrawl when keyed, falling back to local browser for client-rendered pages",
  },
  {
    value: "headless",
    label: "Local only",
    title: "Local headless browser only (free & private, no API spend)",
  },
  {
    value: "firecrawl",
    label: "API only",
    title: "Firecrawl API scraper only, falling back to direct HTTP",
  },
  {
    value: "http",
    label: "HTTP only",
    title: "Plain HTTP fetch only (no API scraping, no browser rendering)",
  },
]

/** currentFetcherMode resolves the active mode from the boolean toggle pair. */
export function currentFetcherMode(
  fetcher: Pick<FetcherSettings, "api" | "local"> | null | undefined
): FetcherMode {
  if (!fetcher) return "auto"
  if (fetcher.api && fetcher.local) return "auto"
  if (!fetcher.api && fetcher.local) return "headless"
  if (fetcher.api && !fetcher.local) return "firecrawl"
  return "http"
}

/**
 * FetcherModePicker chooses how a research run reads the pages it finds.
 * Offers 4 quick presets: Auto (Both), Local only (Headless), API only (Firecrawl), HTTP only.
 */
export function FetcherModePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: FetcherMode | string
  onChange: (v: FetcherMode) => void
  disabled?: boolean
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="radiogroup"
      aria-label="Fetcher mode"
    >
      {FETCHER_MODE_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[var(--radius)] border px-2 py-0.5 font-mono text-[10px] transition-colors outline-none",
            "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
            value === o.value
              ? "border-kai-orange/60 bg-kai-orange/10 text-kai-orange"
              : "border-border bg-card text-kai-dim hover:border-kai-line hover:text-kai-text",
            disabled && "cursor-not-allowed opacity-45"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
