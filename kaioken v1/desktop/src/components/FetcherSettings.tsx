import { useState } from "react"
import { CheckCircle2, ExternalLink, Flame, MonitorPlay, TriangleAlert } from "lucide-react"

import { api } from "@/lib/api"
import { humanize } from "@/lib/errors"
import { useToastStore } from "@/store/toast"
import { cn } from "@/lib/utils"
import type { FetcherSettings as FetcherSettingsType } from "@/lib/types"
import { FetcherModePicker, currentFetcherMode, type FetcherMode } from "@/components/FetcherModePicker"

// How research reads a page, as opposed to how it finds one.
//
// Two independent decisions, so two switches rather than one list of four
// modes: whether a paid API reads the pages, and whether a local browser does.
// The config still stores a single name — the daemon maps between the two — so
// nothing on disk or on the command line had to change to present it this way.
//
// Each row states its own cost and what it needs, because those are what the
// choice actually turns on: the API row spends credits, the local row spends
// seconds and needs a browser installed.

export default function FetcherSettings({
  fetcher,
  onChange,
}: {
  fetcher: FetcherSettingsType
  onChange: (next: FetcherSettingsType) => void
}) {
  const [busy, setBusy] = useState<"api" | "local" | "mode" | null>(null)
  const push = useToastStore((s) => s.push)

  async function toggle(which: "api" | "local", next: boolean) {
    if (busy) return
    setBusy(which)
    try {
      const res = await api.putSettings(
        which === "api" ? { fetcher_api: next } : { fetcher_local: next }
      )
      if (res?.fetcher) onChange(res.fetcher as FetcherSettingsType)
    } catch (e) {
      // Leave the switch where it was and say why, rather than showing a
      // state the daemon did not accept.
      const h = humanize(e)
      push("error", h.title, h.body, h.action)
    } finally {
      setBusy(null)
    }
  }

  async function setMode(mode: FetcherMode) {
    if (busy) return
    setBusy("mode")
    try {
      const res = await api.putSettings({ fetcher_mode: mode })
      if (res?.fetcher) onChange(res.fetcher as FetcherSettingsType)
    } catch (e) {
      const h = humanize(e)
      push("error", h.title, h.body, h.action)
    } finally {
      setBusy(null)
    }
  }

  const bothOff = !fetcher.api && !fetcher.local

  return (
    <div className="space-y-2.5 px-4 py-3">
      <div className="space-y-1.5">
        <p className="font-mono text-[10px] leading-relaxed text-kai-dim">
          How a research run <span className="text-kai-text">reads</span> the pages it finds.
          Independent of which engine finds them — choose a mode or toggle sources individually.
        </p>

        {/* Quick mode trigger selector */}
        <div className="pt-0.5">
          <FetcherModePicker
            value={currentFetcherMode(fetcher)}
            onChange={setMode}
            disabled={busy !== null}
          />
        </div>
      </div>

      <ReaderRow
        icon={Flame}
        kind="API"
        title="Firecrawl"
        on={fetcher.api}
        busy={busy === "api"}
        onToggle={(v) => toggle("api", v)}
        blurb="Renders and de-boilerplates pages on Firecrawl's servers. Costs credits per page and sends each URL to a third party."
        ready={fetcher.firecrawl_key}
        readyLabel={
          fetcher.firecrawl_key
            ? `key from ${fetcher.firecrawl_key_source === "config" ? "config" : fetcher.firecrawl_env}${fetcher.firecrawl_hint ? ` · ${fetcher.firecrawl_hint}` : ""}`
            : `no key — add one above, or export ${fetcher.firecrawl_env}`
        }
        link={fetcher.firecrawl_key ? undefined : fetcher.firecrawl_signup}
        linkLabel="Get a key"
      />

      <ReaderRow
        icon={MonitorPlay}
        kind="Local"
        title="Headless browser"
        on={fetcher.local}
        busy={busy === "local"}
        onToggle={(v) => toggle("local", v)}
        blurb="Re-reads client-rendered pages in a browser already on this machine. Free and private, a few seconds per page, and nothing leaves the network guard."
        ready={!!fetcher.browser}
        readyLabel={
          fetcher.browser
            ? shortenPath(fetcher.browser)
            : (fetcher.browser_error ?? "no Chromium-family browser found")
        }
      />

      {/* What a run will actually do, resolved by the daemon rather than
          inferred here, so the two can never drift apart. */}
      <div
        className={cn(
          "flex items-start gap-2 rounded-[var(--radius)] border px-2.5 py-2",
          fetcher.ok && !bothOff
            ? "border-border bg-card"
            : "border-kai-orange/50 bg-kai-orange/10"
        )}
      >
        {fetcher.ok && !bothOff ? (
          <CheckCircle2 className="mt-px h-3 w-3 shrink-0 text-kai-dim" />
        ) : (
          <TriangleAlert className="mt-px h-3 w-3 shrink-0 text-kai-orange" />
        )}
        <p
          className={cn(
            "font-mono text-[10px] leading-relaxed",
            fetcher.ok && !bothOff ? "text-kai-text" : "text-kai-orange"
          )}
        >
          {fetcher.detail}
          {bothOff && (
            <span className="block text-kai-orange/80">
              Single-page apps will come back close to empty with both off.
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

function ReaderRow({
  icon: Icon,
  kind,
  title,
  on,
  busy,
  onToggle,
  blurb,
  ready,
  readyLabel,
  link,
  linkLabel,
}: {
  icon: typeof Flame
  kind: string
  title: string
  on: boolean
  busy: boolean
  onToggle: (next: boolean) => void
  blurb: string
  ready: boolean
  readyLabel: string
  link?: string
  linkLabel?: string
}) {
  // A switch that is on but unusable is the state worth showing loudly: it is
  // the difference between "off because I chose that" and "on but it will not
  // run", which the effective-tier line below then explains.
  const stalled = on && !ready

  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border bg-card px-2.5 py-2",
        stalled ? "border-kai-orange/40" : "border-border"
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", on ? "text-kai-orange" : "text-kai-dim")}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="rounded-[var(--radius)] border border-border px-1 font-mono text-[9px] uppercase tracking-wide text-kai-dim">
              {kind}
            </span>
            <span className="font-mono text-[11px] text-kai-text">{title}</span>
          </div>
          <p className="mt-1 font-mono text-[10px] leading-relaxed text-kai-dim">{blurb}</p>
          <p
            className={cn(
              "mt-1 truncate font-mono text-[10px]",
              stalled ? "text-kai-orange" : "text-kai-dim"
            )}
            title={readyLabel}
          >
            {readyLabel}
          </p>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 font-mono text-[10px] text-kai-orange hover:underline"
            >
              {linkLabel} <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
        <Switch checked={on} busy={busy} onChange={onToggle} label={`${kind} — ${title}`} />
      </div>
    </div>
  )
}

function Switch({
  checked,
  busy,
  onChange,
  label,
}: {
  checked: boolean
  busy: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative mt-0.5 h-4 w-7 shrink-0 rounded-full border transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
        checked ? "border-kai-orange/60 bg-kai-orange/25" : "border-border bg-background",
        busy && "cursor-wait opacity-60"
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-2.5 w-2.5 rounded-full transition-all",
          checked ? "left-[14px] bg-kai-orange" : "left-[2px] bg-kai-dim"
        )}
      />
    </button>
  )
}

/** shortenPath keeps the browser name visible when the path is long. */
function shortenPath(p: string): string {
  const parts = p.split(/[\\/]/)
  if (parts.length <= 3) return p
  return "…/" + parts.slice(-3).join("/")
}

