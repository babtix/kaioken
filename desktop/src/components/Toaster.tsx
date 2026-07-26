import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react"
import { useToastStore } from "@/store/toast"
import { cn } from "@/lib/utils"

const KINDS = {
  info: { icon: Info, accent: "bg-kai-blue", text: "text-kai-blue" },
  error: { icon: TriangleAlert, accent: "bg-kai-rose", text: "text-kai-rose" },
  success: { icon: CheckCircle2, accent: "bg-kai-green", text: "text-kai-green" },
} as const

export default function Toaster() {
  const { toasts, dismiss } = useToastStore()
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-9 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => {
        const kind = KINDS[t.kind]
        const Icon = kind.icon
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              "animate-slide-up pointer-events-auto relative flex w-80 items-start gap-2.5 overflow-hidden",
              "rounded-lg border border-border bg-card py-2.5 pl-3 pr-2 shadow-xl"
            )}
          >
            {/* Colour lives in a spine, not a full border — quieter at rest. */}
            <span className={cn("absolute left-0 h-full w-0.5", kind.accent)} aria-hidden />
            <Icon size={14} className={cn("mt-px shrink-0", kind.text)} />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] font-semibold text-kai-text">{t.title}</p>
              {t.body && (
                <p className="mt-0.5 break-words font-mono text-[10px] leading-relaxed text-kai-muted">
                  {t.body}
                </p>
              )}
              {t.action && (
                <p className="mt-1 font-mono text-[10px] text-kai-amber">{t.action}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-0.5 text-kai-dim transition-colors hover:text-kai-text"
              aria-label="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
