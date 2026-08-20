import { useState } from "react"
import { CheckCircle2, ExternalLink, Flame, Globe, MonitorPlay, TriangleAlert } from "lucide-react"

import { api } from "@/lib/api"
import { humanize } from "@/lib/errors"
import { useToastStore } from "@/store/toast"
import { cn } from "@/lib/utils"
import type { FetcherSettings as FetcherSettingsType } from "@/lib/types"

// How research reads a page, as opposed to how it finds one.
//
// Three tiers sit behind one control. The thing that makes this worth its own
// block rather than a single dropdown is that the configured value and the
// effective one can differ: auto quietly falls back when no browser is
// installed, and a Firecrawl key is what turns the scraper on at all. The
// daemon resolves the real tier and hands back a sentence, so what is shown
// here is what a run will actually do — not a restatement of the setting.

type Mode = "auto" | "firecrawl" | "headless" | "http"

const OPTIONS: { value: Mode; label: string; blurb: string }[] = [
  {
    value: "auto",
    label: "Auto",
    blurb:
      "Firecrawl when its key is set, otherwise plain HTTP with a local browser for pages that arrive empty. Recommended.",
  },
  {
    value: "firecrawl",
    label: "Firecrawl",
    blurb:
      "Always read through the scrape API. Costs credits per page, and without a key this is an error rather than a fallback.",
  },
  {
    value: "headless",
    label: "Browser",
    blurb:
      "Never call Firecrawl. Read over HTTP and re-read client-rendered pages in a local headless browser. Free, slower, and needs a browser installed.",
  },
  {
    value: "http",
    label: "HTTP only",
    blurb:
      "Plain fetch, no browser and no scrape credits. Single-page apps will come back close to empty.",
  },
]

export default function FetcherSettings({
  fetcher,
  onChange,
}: {
  fetcher: FetcherSettingsType
  onChange: (next: FetcherSettingsType) => void
}) {
  const [saving, setSaving] = useState(false)
  const push = useToastStore((s) => s.push)

  // The config stores auto as an empty string, which is how it reads when the
  // user has never touched it. The UI always has something selected.
  const selected: Mode = (fetcher.mode || "auto") as Mode
  const active = OPTIONS.find((o) => o.value === selected) ?? OPTIONS[0]

  async function choose(mode: Mode) {
    if (mode === selected || saving) return
    setSaving(true)
    try {
      const res = await api.putSettings({ fetcher_mode: mode })
      if (res?.fetcher) onChange(res.fetcher as FetcherSettingsType)
    } catch (e) {
      // The daemon rejects an unusable choice — firecrawl with no key — with a
      // message that says what to do, so show that rather than a generic
      // failure and leave the previous selection standing.
      const h = humanize(e)
      push("error", h.title, h.body, h.action)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 px-4 py-3">
      <p className="font-mono text-[10px] leading-relaxed text-kai-dim">
        How a research run <span className="text-kai-text">reads</span> the pages it finds.
        Separate from which engine finds them.
      </p>

      <div
        className="flex flex-wrap items-center gap-1.5"
        role="radiogroup"
        aria-label="How pages are read"
      >
        {OPTIONS.map((o) => {
          const isFirecrawl = o.value === "firecrawl"
          const needsKey = isFirecrawl && !fetcher.firecrawl_key
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected === o.value}
              disabled={saving}
              title={needsKey ? `Needs a Firecrawl key (${fetcher.firecrawl_env})` : o.blurb}
              onClick={() => choose(o.value)}
              className={cn(
                "rounded-[var(--radius)] border px-2 py-0.5 font-mono text-[10px] transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
                selected === o.value
                  ? "border-kai-orange/60 bg-kai-orange/10 text-kai-orange"
                  : "border-border bg-card text-kai-dim hover:border-kai-line hover:text-kai-text",
                saving && "cursor-wait opacity-60"
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-kai-dim">{active.blurb}</p>

      {/* What a run will actually do, resolved by the daemon rather than
          inferred here, so the two can never drift apart. */}
      <div
        className={cn(
          "flex items-start gap-2 rounded-[var(--radius)] border px-2.5 py-2",
          fetcher.ok
            ? "border-border bg-card"
            : "border-kai-orange/50 bg-kai-orange/10"
        )}
      >
        {fetcher.ok ? (
          <CheckCircle2 className="mt-px h-3 w-3 shrink-0 text-kai-dim" />
        ) : (
          <TriangleAlert className="mt-px h-3 w-3 shrink-0 text-kai-orange" />
        )}
        <p
          className={cn(
            "font-mono text-[10px] leading-relaxed",
            fetcher.ok ? "text-kai-text" : "text-kai-orange"
          )}
        >
          {fetcher.detail}
        </p>
      </div>

      {/* The two things the tiers depend on, each stating how to get it. */}
      <div className="grid gap-1.5 sm:grid-cols-2">
        <Dependency
          icon={Flame}
          label="Firecrawl key"
          present={fetcher.firecrawl_key}
          detail={
            fetcher.firecrawl_key
              ? `${fetcher.firecrawl_key_source === "env" ? fetcher.firecrawl_env : "config"} · ${fetcher.firecrawl_hint ?? ""}`
              : `Not set — add one below, or export ${fetcher.firecrawl_env}`
          }
          link={fetcher.firecrawl_key ? undefined : fetcher.firecrawl_signup}
        />
        <Dependency
          icon={MonitorPlay}
          label="Local browser"
          present={!!fetcher.browser}
          detail={
            fetcher.browser
              ? shortenPath(fetcher.browser)
              : (fetcher.browser_error ?? "None found — install Chrome or Edge")
          }
        />
      </div>
    </div>
  )
}

function Dependency({
  icon: Icon,
  label,
  present,
  detail,
  link,
}: {
  icon: typeof Globe
  label: string
  present: boolean
  detail: string
  link?: string
}) {
  return (
    <div className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-card px-2.5 py-2">
      <Icon
        className={cn("mt-px h-3 w-3 shrink-0", present ? "text-kai-orange" : "text-kai-dim")}
      />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] text-kai-text">
          {label}
          <span className={cn("ml-1.5", present ? "text-kai-dim" : "text-kai-dim/70")}>
            {present ? "ready" : "missing"}
          </span>
        </p>
        <p className="truncate font-mono text-[10px] text-kai-dim" title={detail}>
          {detail}
        </p>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 font-mono text-[10px] text-kai-orange hover:underline"
          >
            Get a key <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
    </div>
  )
}

/** shortenPath keeps the browser name visible when the path is long. */
function shortenPath(p: string): string {
  const parts = p.split(/[\\/]/)
  if (parts.length <= 3) return p
  return "…" +["", ...parts.slice(-3)].join("/")
}
