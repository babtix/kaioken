import { SHORTCUTS } from "@/lib/shortcuts"

export default function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  const groups: Record<string, typeof SHORTCUTS> = {}
  for (const s of SHORTCUTS) {
    ;(groups[s.group] ??= []).push(s)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-sm rounded-md border border-border bg-card p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 font-mono text-xs font-bold text-kai-orange">Keyboard Shortcuts</h2>
        {Object.entries(groups).map(([group, shortcuts]) => (
          <div key={group} className="mb-3">
            <p className="mb-1 font-mono text-[9px] font-bold uppercase text-kai-dim">{group}</p>
            {shortcuts.map((s) => (
              <div key={s.keys + s.label} className="flex items-center justify-between py-0.5">
                <span className="font-mono text-[11px] text-kai-text">{s.label}</span>
                <kbd className="rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-[10px] text-kai-muted">
                  {s.keys}
                </kbd>
              </div>
            ))}
          </div>
        ))}
        <p className="mt-2 text-center font-mono text-[10px] text-kai-dim">Press Escape or click outside to close</p>
      </div>
    </div>
  )
}
