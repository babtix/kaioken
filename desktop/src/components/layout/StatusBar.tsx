import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { info } from "@/lib/daemon"
import { useConnStore } from "@/store/conn"
import type { ConnStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const DOT_CLASS: Record<ConnStatus, string> = {
  open: "bg-kai-green",
  connecting: "bg-kai-amber",
  reconnecting: "bg-kai-amber",
}

export default function StatusBar() {
  const status = useConnStore((s) => s.status)
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .health()
      .then((h) => {
        if (!cancelled) setVersion(h.version)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const label = version ? `daemon ok · v${version} · port ${info().port}` : "connecting…"

  return (
    <div className="flex items-center gap-2 border-t border-border px-3 py-1.5 font-mono text-xs text-kai-dim">
      <span className={cn("size-2 rounded-full", DOT_CLASS[status])} aria-hidden />
      <span>{label}</span>
    </div>
  )
}
