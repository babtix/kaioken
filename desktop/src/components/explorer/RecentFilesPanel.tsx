import { Clock, Pin, X } from "lucide-react"
import { useExplorerStore } from "@/store/explorer"
import { fileIcon, fileIconColor, pathExt } from "./fileIcon"
import { cn } from "@/lib/utils"

// RecentFilesPanel shows pinned files (persistent, manually added) above a
// most-recently-used list that grows as the user navigates the explorer. Both
// survive a window reload via the explorer store's localStorage persistence.
export default function RecentFilesPanel() {
  const pinned = useExplorerStore((s) => s.pinned)
  const recents = useExplorerStore((s) => s.recents)

  const recent = recents.filter((p) => !pinned.includes(p))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Clock size={12} className="shrink-0 text-kai-dim" />
        <span className="font-mono text-[10px] text-kai-dim">recent</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Section label="Pinned" count={pinned.length}>
          {pinned.map((p) => (
            <FileRow
              key={`pin-${p}`}
              path={p}
              action={
                <UnpinButton path={p} />
              }
            />
          ))}
        </Section>
        <Section label="Recent" count={recent.length}>
          {recent.map((p) => (
            <FileRow
              key={`rec-${p}`}
              path={p}
              action={<PinButton path={p} />}
            />
          ))}
        </Section>
        {pinned.length === 0 && recent.length === 0 && (
          <div className="px-3 py-4 font-mono text-[10px] text-kai-dim">
            no recent files yet. click files in the tree to populate this list,
            or pin one to keep it here.
          </div>
        )}
      </div>
    </div>
  )
}

function Section({
  label,
  count,
  children,
}: {
  label: string
  count: number
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1.5 px-2 py-1">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-kai-dim">
          {label}
        </span>
        <span className="font-mono text-[9px] text-kai-dim">{count}</span>
      </div>
      <div>{children}</div>
    </div>
  )
}

function FileRow({
  path,
  action,
}: {
  path: string
  action: React.ReactNode
}) {
  const selectFile = useExplorerStore((s) => s.selectFile)
  const addRecent = useExplorerStore((s) => s.addRecent)
  const selected = useExplorerStore((s) => s.selectedPath === path)
  const name = path.split("/").pop() ?? path
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""
  const ext = pathExt(path)
  const Icon = fileIcon(ext)
  return (
    <div
      className={cn(
        "group flex w-full items-center gap-1.5 px-2 py-0.5 outline-none transition-colors",
        selected ? "bg-accent/60" : "hover:bg-panel/60"
      )}
    >
      <button
        type="button"
        onClick={() => {
          selectFile(path)
          addRecent(path)
        }}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50"
      >
        <Icon size={13} className={cn("shrink-0", fileIconColor(ext))} />
        <span
          className={cn(
            "truncate font-mono text-[11px]",
            selected ? "text-kai-orange" : "text-kai-muted"
          )}
        >
          {name}
        </span>
        {dir && (
          <span className="ml-auto shrink-0 truncate pl-2 font-mono text-[9px] text-kai-dim">
            {dir}
          </span>
        )}
      </button>
      <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
        {action}
      </span>
    </div>
  )
}

function PinButton({ path }: { path: string }) {
  const pinFile = useExplorerStore((s) => s.pinFile)
  return (
    <button
      type="button"
      title="Pin"
      onClick={() => pinFile(path)}
      className="flex size-5 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-amber focus-visible:ring-2 focus-visible:ring-kai-orange/50"
    >
      <Pin size={11} />
    </button>
  )
}

function UnpinButton({ path }: { path: string }) {
  const unpinFile = useExplorerStore((s) => s.unpinFile)
  return (
    <button
      type="button"
      title="Unpin"
      onClick={() => unpinFile(path)}
      className="flex size-5 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-rose focus-visible:ring-2 focus-visible:ring-kai-orange/50"
    >
      <X size={11} />
    </button>
  )
}
