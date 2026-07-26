import { AlertTriangle, CheckCircle, Info, X } from "lucide-react"
import { useToastStore } from "@/store/toast"
import { cn } from "@/lib/utils"

const ICONS = {
  info: Info,
  error: AlertTriangle,
  success: CheckCircle,
} as const

const COLORS = {
  info: "border-kai-blue/40 text-kai-blue",
  error: "border-kai-rose/40 text-kai-rose",
  success: "border-kai-green/40 text-kai-green",
} as const

export default function Toaster() {
  const { toasts, dismiss } = useToastStore()
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-10 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind]
        return (
          <div
            key={t.id}
            className={cn(
              "flex w-72 items-start gap-2 rounded-md border bg-card px-3 py-2 shadow-lg",
              COLORS[t.kind]
            )}
          >
            <Icon size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] font-bold">{t.title}</p>
              {t.body && <p className="mt-0.5 truncate font-mono text-[10px] text-kai-muted">{t.body}</p>}
              {t.action && <p className="mt-0.5 font-mono text-[10px] text-kai-amber">{t.action}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="shrink-0 text-kai-dim hover:text-kai-text">
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
