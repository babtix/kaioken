import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui"

export default function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
      {/* Concentric rings keep the glyph from floating in empty space. */}
      <div className="relative flex size-14 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-border" aria-hidden />
        <span className="absolute inset-2 rounded-full border border-border/60" aria-hidden />
        <Icon size={20} className="relative text-kai-dim" />
      </div>

      <p className="font-mono text-sm text-kai-text">{title}</p>

      {hint && (
        <p className="max-w-sm text-center font-mono text-[11px] leading-relaxed text-kai-dim">
          {hint}
        </p>
      )}

      {action && (
        <Button variant="primary" size="sm" onClick={action.onClick} className="mt-1">
          {action.label}
        </Button>
      )}
    </div>
  )
}
