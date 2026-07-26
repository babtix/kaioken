import type { LucideIcon } from "lucide-react"

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
      <Icon size={28} className="text-kai-dim" />
      <p className="font-mono text-sm text-kai-text">{title}</p>
      {hint && <p className="max-w-xs text-center font-mono text-xs text-kai-dim">{hint}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-1 rounded border border-kai-orange/40 px-3 py-1 font-mono text-xs text-kai-orange transition-colors hover:bg-accent"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
