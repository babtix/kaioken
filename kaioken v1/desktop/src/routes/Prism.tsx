import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  CheckCircle2,
  CheckSquare,
  Copy,
  Cpu,
  FileCode,
  FileText,
  Filter,
  FolderOpen,
  FolderSearch,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react"

import { PrismIcon } from "@/components/common/PrismIcon"
import { api } from "@/lib/api"
import type { PrismAnswer, PrismDocument, PrismModule, PrismStatus } from "@/lib/types"
import { useWorkspaceStore } from "@/store/workspace"
import { useToastStore } from "@/store/toast"
import EmptyState from "@/components/EmptyState"
import { Badge, Button, Card, Modal, ProgressBar, Spinner } from "@/components/ui"
import { LiveDot, SectionLabel } from "@/components/hud"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"

// PRISM is retrieval over documents the user imports, as opposed to the wiki
// Kaioken generates. The screen's job beyond CRUD is to keep the three honesty
// flags visible: an answer built on ungraded context looks identical to a good
// one, and a UI that renders a single green "found" badge is precisely the
// confusion this engine exists to prevent.

export default function Prism() {
  const wsId = useWorkspaceStore((s) => s.active?.id)
  const pushToast = useToastStore((s) => s.push)

  const [status, setStatus] = useState<PrismStatus | null>(null)
  const [module, setModule] = useState<string>("")
  const [docs, setDocs] = useState<PrismDocument[]>([])
  const [answer, setAnswer] = useState<PrismAnswer | null>(null)
  const [asking, setAsking] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    if (!wsId) return
    try {
      const s = await api.prismStatus(wsId)
      setStatus(s)
      setModule((m) => m || s.modules[0]?.slug || "")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [wsId])

  const refreshDocs = useCallback(async () => {
    if (!wsId || !module) return setDocs([])
    try {
      const { documents } = await api.prismDocuments(wsId, module)
      setDocs(documents)
    } catch {
      setDocs([])
    }
  }, [wsId, module])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    void refreshDocs()
  }, [refreshDocs])

  const handleManualRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([refreshStatus(), refreshDocs()])
    } finally {
      setRefreshing(false)
    }
  }

  // Ingestion runs detached from its request, so the only way to learn it
  // finished is to ask. Polling stops as soon as nothing is in flight.
  const ingesting = docs.some((d) => d.status === "processing")
  useEffect(() => {
    if (!ingesting) return
    const t = setInterval(() => {
      void refreshDocs()
      void refreshStatus()
    }, 1000)
    return () => clearInterval(t)
  }, [ingesting, refreshDocs, refreshStatus])

  async function ask(query: string) {
    if (!wsId || !module || !query.trim()) return
    setAsking(true)
    setError(null)
    try {
      setAnswer(await api.prismQuery(wsId, { query, module }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      pushToast("error", "Query failed", msg)
    } finally {
      setAsking(false)
    }
  }

  if (!wsId) {
    return (
      <EmptyState
        icon={PrismIcon}
        title="No workspace open"
        hint="Open a repository to use PRISM document retrieval."
      />
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-5 animate-charge">
      {/* Header */}
      <header className="flex items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-kai-orange/30 bg-kai-orange/10">
          <PrismIcon size={14} className="text-kai-orange" />
        </span>
        <div className="flex-1">
          <h1 className="font-mono text-lg font-bold tracking-tight text-kai-white">PRISM</h1>
          <p className="mt-0.5 font-mono text-[11px] text-kai-dim">
            Retrieval over documents you import, grouped into modules. Grounded answers backed by graded sources.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ingesting && <LiveDot label="ingesting" />}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleManualRefresh()}
            disabled={refreshing}
            title="Refresh status and documents"
          >
            {refreshing ? <Spinner size={12} /> : <RefreshCw size={12} />}
            <span className="ml-1">Sync</span>
          </Button>
        </div>
      </header>

      {/* Pipeline status bar */}
      {status && <Capabilities status={status} />}

      {/* Error alert */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-kai-rose/30 bg-kai-rose/10 px-3 py-2 font-mono text-xs text-kai-rose">
          <TriangleAlert size={14} className="shrink-0 text-kai-rose" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* Modules section */}
      <Modules
        wsId={wsId}
        status={status}
        active={module}
        onSelect={setModule}
        onChanged={() => {
          void refreshStatus()
          void refreshDocs()
        }}
      />

      {/* Documents & Query section */}
      {module && (
        <div className="space-y-5">
          <Documents
            wsId={wsId}
            module={module}
            docs={docs}
            onChanged={() => {
              void refreshDocs()
              void refreshStatus()
            }}
          />
          <Ask asking={asking} onAsk={ask} answer={answer} />
        </div>
      )}
    </div>
  )
}

// Capabilities states plainly which halves of the pipeline are actually wired
// in. Both are optional, and both change what an answer is worth — so this is
// a permanent header, not a setup wizard that disappears once dismissed.
function Capabilities({ status }: { status: PrismStatus }) {
  const embedOn = status.embed.source !== "none"
  return (
    <Card className="hud-corners p-3">
      <SectionLabel className="mb-2">Pipeline Status</SectionLabel>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={embedOn ? "green" : "amber"}>
          <Cpu size={10} className="shrink-0" />
          {embedOn ? `embeddings: ${status.embed.detail}` : "no embedding model — lexical only"}
        </Badge>
        <Badge tone={status.utility ? "green" : "amber"}>
          <Sparkles size={10} className="shrink-0" />
          {status.utility
            ? `relevance gate: ${status.utility}`
            : "no utility model — the relevance gate cannot run"}
        </Badge>
        <Badge tone="neutral">
          <Layers size={10} className="shrink-0" />
          mode: {status.mode}
        </Badge>
        {status.options.variants > 1 && (
          <Badge tone="neutral">
            fusion: {status.options.variants} phrasings
          </Badge>
        )}
      </div>
    </Card>
  )
}

function Modules({
  wsId,
  status,
  active,
  onSelect,
  onChanged,
}: {
  wsId: string
  status: PrismStatus | null
  active: string
  onSelect: (slug: string) => void
  onChanged: () => void
}) {
  const [name, setName] = useState("")
  const [confirming, setConfirming] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const pushToast = useToastStore((s) => s.push)

  async function create() {
    if (!name.trim()) return
    setCreating(true)
    try {
      await api.createPrismModule(wsId, { name: name.trim() })
      pushToast("success", "Module created", name.trim())
      setName("")
      onChanged()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      pushToast("error", "Failed to create module", msg)
    } finally {
      setCreating(false)
    }
  }

  async function remove(m: PrismModule) {
    // Deleting a module throws away every embedding in it, which costs real
    // money to rebuild. Name what is going before it goes.
    if (confirming !== m.slug) return setConfirming(m.slug)
    try {
      await api.deletePrismModule(wsId, m.slug)
      pushToast("success", "Module deleted", m.name)
      setConfirming(null)
      onChanged()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      pushToast("error", "Failed to delete module", msg)
    }
  }

  return (
    <Card className="hud-corners p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Modules</SectionLabel>
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void create()}
            placeholder="New module name"
            className={cn(
              "rounded-md border border-border bg-background px-2.5 py-1 font-mono text-xs text-kai-text",
              "placeholder:text-kai-dim outline-none transition-colors",
              "focus:border-kai-orange/50 focus-visible:ring-2 focus-visible:ring-kai-orange/40"
            )}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => void create()}
            disabled={!name.trim() || creating}
            loading={creating}
          >
            <Plus size={12} />
            Create
          </Button>
        </div>
      </div>

      {!status?.modules.length ? (
        <div className="rounded-md border border-dashed border-border bg-panel/30 p-6 text-center">
          <FolderOpen size={20} className="mx-auto mb-2 text-kai-dim" />
          <p className="font-mono text-xs text-kai-text">No modules yet</p>
          <p className="mt-1 font-mono text-[11px] text-kai-dim">
            Create a module above, then import documents.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {status.modules.map((m) => {
            const isSelected = active === m.slug
            return (
              <li key={m.slug} className="flex flex-col">
                <div
                  className={cn(
                    "hud-corners relative flex flex-1 flex-col justify-between rounded-lg border p-3 text-left transition-all",
                    isSelected
                      ? "border-kai-orange/60 bg-accent/40 text-kai-orange shadow-[0_0_12px_-3px_var(--kai-orange)]"
                      : "border-border bg-card hover:border-kai-orange/40 hover:bg-card/80"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => onSelect(m.slug)}
                      className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50"
                    >
                      <div className={cn("truncate font-mono text-xs font-bold", isSelected ? "text-kai-orange" : "text-kai-text")}>
                        {m.name}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-kai-dim">
                        <Badge tone={isSelected ? "orange" : "neutral"}>
                          {m.document_count} doc{m.document_count === 1 ? "" : "s"} · {m.chunk_count} chunks
                        </Badge>
                      </div>
                      {m.description && (
                        <div className="mt-1.5 line-clamp-2 font-mono text-[10px] text-kai-dim">
                          {m.description}
                        </div>
                      )}
                    </button>
                    <button
                      onClick={() => void remove(m)}
                      title={
                        confirming === m.slug
                          ? `Delete ${m.slug} and all ${m.chunk_count} chunks?`
                          : "Delete module"
                      }
                      className={cn(
                        "rounded p-1 transition-colors outline-none",
                        confirming === m.slug
                          ? "bg-kai-rose/20 text-kai-rose"
                          : "text-kai-dim hover:bg-panel hover:text-kai-rose"
                      )}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {confirming === m.slug && (
                  <div className="animate-slide-up mt-1.5 rounded border border-kai-amber/30 bg-kai-amber/10 p-2 font-mono text-[10px] text-kai-amber">
                    Click again to delete {m.chunk_count} chunk{m.chunk_count === 1 ? "" : "s"} —
                    re-embedding them is not free.
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// Set of all document and source file extensions supported by PRISM ingestion
const PRISM_SUPPORTED_EXTENSIONS = new Set([
  // Text & docs
  ".md", ".markdown", ".mdx",
  ".txt", ".text",
  ".rst", ".org", ".adoc", ".asciidoc",
  ".tex",
  // Code
  ".go", ".py", ".js", ".jsx", ".ts", ".tsx",
  ".java", ".kt", ".scala", ".rb", ".rs",
  ".c", ".h", ".cc", ".cpp", ".hpp", ".cs",
  ".php", ".swift", ".sh", ".bash", ".sql",
  ".html", ".css", ".scss",
  ".yaml", ".yml", ".toml", ".json", ".xml",
])

interface ScannedFile {
  file: File
  path: string
  name: string
  ext: string
  size: number
  supported: boolean
}

const CATEGORY_PRESETS: { id: string; label: string; exts: string[] | null | "all" }[] = [
  { id: "all-supported", label: "All Supported", exts: null },
  { id: "markdown", label: "Markdown (.md)", exts: [".md", ".markdown", ".mdx"] },
  { id: "python", label: "Python (.py)", exts: [".py"] },
  { id: "ts-js", label: "TypeScript / JS", exts: [".ts", ".tsx", ".js", ".jsx"] },
  { id: "go", label: "Go (.go)", exts: [".go"] },
  { id: "rust", label: "Rust (.rs)", exts: [".rs"] },
  { id: "docs", label: "Docs (.txt, .rst)", exts: [".txt", ".text", ".rst", ".adoc", ".tex"] },
  { id: "config", label: "Config (.json, .yaml)", exts: [".json", ".yaml", ".yml", ".toml", ".xml"] },
  {
    id: "all-code",
    label: "All Code",
    exts: [
      ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs",
      ".c", ".cpp", ".h", ".hpp", ".java", ".kt", ".cs",
      ".rb", ".sh", ".sql", ".html", ".css",
    ],
  },
  { id: "all-files", label: "All Files", exts: "all" },
]

async function extractFilesFromDrop(
  dataTransfer: DataTransfer
): Promise<{ files: File[]; isFolder: boolean; folderName: string }> {
  const items = dataTransfer.items
  if (items && items.length > 0 && typeof (items[0] as unknown as { webkitGetAsEntry?: unknown }).webkitGetAsEntry === "function") {
    const entries: unknown[] = []
    let detectedFolder = false
    let folderName = ""
    for (let i = 0; i < items.length; i++) {
      const entry = (items[i] as unknown as { webkitGetAsEntry: () => { isDirectory: boolean; name: string } | null }).webkitGetAsEntry()
      if (entry) {
        if (entry.isDirectory) {
          detectedFolder = true
          if (!folderName) folderName = entry.name
        }
        entries.push(entry)
      }
    }
    if (entries.length > 0) {
      const collected: File[] = []
      async function readEntry(entry: any, basePath = ""): Promise<void> {
        if (entry.isFile) {
          await new Promise<void>((resolve) => {
            entry.file((f: File) => {
              const relPath = basePath ? `${basePath}/${f.name}` : f.name
              Object.defineProperty(f, "webkitRelativePath", {
                value: relPath,
                writable: false,
              })
              collected.push(f)
              resolve()
            }, () => resolve())
          })
        } else if (entry.isDirectory) {
          const dirReader = entry.createReader()
          const readAll = async (): Promise<any[]> => {
            const results: any[] = []
            while (true) {
              const batch = await new Promise<any[]>((res) => {
                dirReader.readEntries((r: any[]) => res(r), () => res([]))
              })
              if (!batch || batch.length === 0) break
              results.push(...batch)
            }
            return results
          }
          const children = await readAll()
          const dirPath = basePath ? `${basePath}/${entry.name}` : entry.name
          for (const child of children) {
            await readEntry(child, dirPath)
          }
        }
      }
      for (const e of entries) {
        await readEntry(e, "")
      }
      return {
        files: collected,
        isFolder: detectedFolder,
        folderName: folderName || "Dropped Folder",
      }
    }
  }

  const fileList = Array.from(dataTransfer.files || [])
  return { files: fileList, isFolder: false, folderName: "Dropped Files" }
}

function Documents({
  wsId,
  module,
  docs,
  onChanged,
}: {
  wsId: string
  module: string
  docs: PrismDocument[]
  onChanged: () => void
}) {
  const [path, setPath] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [docSearch, setDocSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "processing" | "failed">("all")
  const [clearingFailed, setClearingFailed] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const pushToast = useToastStore((s) => s.push)

  const [folderModalState, setFolderModalState] = useState<{
    open: boolean
    folderName: string
    files: File[]
  }>({
    open: false,
    folderName: "",
    files: [],
  })

  // Metrics
  const readyDocs = useMemo(() => docs.filter((d) => d.status === "ready"), [docs])
  const processingDocs = useMemo(() => docs.filter((d) => d.status === "processing"), [docs])
  const failedDocs = useMemo(() => docs.filter((d) => d.status === "failed"), [docs])
  const totalChunks = useMemo(() => docs.reduce((acc, d) => acc + (d.child_count || 0), 0), [docs])

  // Filtered documents
  const filteredDocs = useMemo(() => {
    return docs.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false
      if (docSearch.trim()) {
        const query = docSearch.trim().toLowerCase()
        if (!d.filename.toLowerCase().includes(query)) return false
      }
      return true
    })
  }, [docs, statusFilter, docSearch])

  async function importPath() {
    if (!path.trim()) return
    setBusy(true)
    setErr(null)
    try {
      await api.importPrismDocument(wsId, module, { path: path.trim() })
      pushToast("success", "Document import started", path.trim())
      setPath("")
      onChanged()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
      pushToast("error", "Failed to import path", msg)
    } finally {
      setBusy(false)
    }
  }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setErr(null)
    try {
      for (const f of Array.from(files)) {
        await api.importPrismDocument(wsId, module, { filename: f.name, text: await f.text() })
      }
      pushToast("success", `Importing ${files.length} file(s)`)
      onChanged()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
      pushToast("error", "Failed to import files", msg)
    } finally {
      setBusy(false)
    }
  }

  const handleFolderPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const list = Array.from(e.target.files)
      let name = "Selected Folder"
      if (list[0]?.webkitRelativePath) {
        const parts = list[0].webkitRelativePath.split("/")
        if (parts.length > 1) name = parts[0]
      }
      setFolderModalState({ open: true, folderName: name, files: list })
      e.target.value = ""
    }
  }

  async function deleteDoc(doc: PrismDocument) {
    try {
      await api.deletePrismDocument(wsId, module, doc.id)
      pushToast("success", "Document removed", doc.filename)
      onChanged()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      pushToast("error", "Failed to remove document", msg)
    }
  }

  async function clearAllFailed() {
    if (failedDocs.length === 0) return
    setClearingFailed(true)
    try {
      for (const d of failedDocs) {
        await api.deletePrismDocument(wsId, module, d.id)
      }
      pushToast("success", `Cleared ${failedDocs.length} failed document(s)`)
      onChanged()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      pushToast("error", "Failed to clear documents", msg)
    } finally {
      setClearingFailed(false)
    }
  }

  return (
    <Card
      className={cn(
        "hud-corners p-4 transition-colors space-y-3.5",
        isDragging && "border-kai-orange/60 bg-kai-orange/[0.04]"
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={async (e) => {
        e.preventDefault()
        setIsDragging(false)
        try {
          const { files: droppedFiles, isFolder, folderName } = await extractFilesFromDrop(e.dataTransfer)
          if (droppedFiles.length === 0) return
          if (isFolder || droppedFiles.length > 1) {
            setFolderModalState({
              open: true,
              folderName: folderName || "Dropped Folder",
              files: droppedFiles,
            })
          } else {
            void importFiles(e.dataTransfer.files)
          }
        } catch {
          void importFiles(e.dataTransfer.files)
        }
      }}
    >
      {/* Header & Import Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SectionLabel>Documents in {module}</SectionLabel>
          {docs.length > 0 && (
            <Badge tone="neutral" className="font-mono text-[10px]">
              {docs.length} file{docs.length === 1 ? "" : "s"} · {totalChunks} chunks
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void importPath()}
            placeholder="Path on this machine"
            className={cn(
              "w-48 sm:w-56 rounded-md border border-border bg-background px-2.5 py-1 font-mono text-xs text-kai-text",
              "placeholder:text-kai-dim outline-none transition-colors",
              "focus:border-kai-orange/50 focus-visible:ring-2 focus-visible:ring-kai-orange/40"
            )}
          />
          <Button
            variant="subtle"
            size="sm"
            disabled={busy || !path.trim()}
            loading={busy}
            onClick={() => void importPath()}
          >
            <Upload size={12} />
            Import
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            title="Select specific individual files to import"
          >
            <FileText size={12} />
            Files
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => folderRef.current?.click()}
            title="Select a directory and filter files by extension"
          >
            <FolderSearch size={12} />
            Folder
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => void importFiles(e.target.files)}
          />
          <input
            ref={folderRef}
            type="file"
            multiple
            // @ts-expect-error - webkitdirectory is standard in WebViews/Chromium
            webkitdirectory=""
            directory=""
            className="hidden"
            onChange={handleFolderPicked}
          />
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-md border border-kai-rose/30 bg-kai-rose/10 px-3 py-1.5 font-mono text-xs text-kai-rose">
          <TriangleAlert size={12} className="shrink-0 text-kai-rose" />
          <span>{err}</span>
        </div>
      )}

      {/* Filter / Search Bar (when there are documents) */}
      {docs.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border/60 pt-3 text-xs">
          {/* Status Filter Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-[10px] transition-colors border",
                statusFilter === "all"
                  ? "border-kai-orange/60 bg-kai-orange/15 text-kai-orange font-bold"
                  : "border-border bg-card/60 text-kai-dim hover:text-kai-text"
              )}
            >
              All ({docs.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("ready")}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-[10px] transition-colors border flex items-center gap-1",
                statusFilter === "ready"
                  ? "border-kai-green/60 bg-kai-green/15 text-kai-green font-bold"
                  : "border-border bg-card/60 text-kai-dim hover:text-kai-text"
              )}
            >
              <CheckCircle2 size={10} className={readyDocs.length > 0 ? "text-kai-green" : "text-kai-dim"} />
              Ready ({readyDocs.length})
            </button>
            {processingDocs.length > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter("processing")}
                className={cn(
                  "rounded px-2 py-0.5 font-mono text-[10px] transition-colors border flex items-center gap-1",
                  statusFilter === "processing"
                    ? "border-kai-orange/60 bg-kai-orange/15 text-kai-orange font-bold"
                    : "border-border bg-card/60 text-kai-dim hover:text-kai-text"
                )}
              >
                <Spinner size={10} className="text-kai-orange" />
                Ingesting ({processingDocs.length})
              </button>
            )}
            {failedDocs.length > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter("failed")}
                className={cn(
                  "rounded px-2 py-0.5 font-mono text-[10px] transition-colors border flex items-center gap-1",
                  statusFilter === "failed"
                    ? "border-kai-rose/60 bg-kai-rose/15 text-kai-rose font-bold"
                    : "border-kai-rose/40 bg-kai-rose/10 text-kai-rose hover:bg-kai-rose/20"
                )}
              >
                <TriangleAlert size={10} />
                Failed ({failedDocs.length})
              </button>
            )}
          </div>

          {/* Search Box & Clear Failed Button */}
          <div className="flex items-center gap-2 ml-auto">
            {failedDocs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void clearAllFailed()}
                disabled={clearingFailed}
                loading={clearingFailed}
                className="h-6 text-[10px] text-kai-rose hover:bg-kai-rose/15 hover:text-kai-rose"
                title="Remove all failed documents from this module"
              >
                <Trash2 size={11} />
                Clear failed ({failedDocs.length})
              </Button>
            )}
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-kai-dim" />
              <input
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                placeholder="Search documents..."
                className={cn(
                  "w-36 sm:w-48 rounded border border-border bg-background pl-7 pr-6 py-0.5 font-mono text-[11px] text-kai-text",
                  "placeholder:text-kai-dim/60 outline-none focus:border-kai-orange/50"
                )}
              />
              {docSearch && (
                <button
                  type="button"
                  onClick={() => setDocSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-kai-dim hover:text-kai-text"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Document List */}
      {!docs.length ? (
        <div className="rounded-md border border-dashed border-border bg-panel/30 p-8 text-center">
          <Upload size={22} className="mx-auto mb-2 text-kai-dim" />
          <p className="font-mono text-xs text-kai-text">Nothing imported yet</p>
          <p className="mt-1 font-mono text-[11px] text-kai-dim max-w-md mx-auto">
            Drop files or folders here, or click <strong>Folder</strong> to import with type filtering (.md, .py, .txt, etc.).
          </p>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-panel/20 p-6 text-center text-xs font-mono text-kai-dim">
          No documents matching <span className="text-kai-text">"{docSearch}"</span> in status "{statusFilter}".
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDocSearch("")
                setStatusFilter("all")
              }}
              className="h-6 text-[10px]"
            >
              Reset filter
            </Button>
          </div>
        </div>
      ) : (
        <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-1 rounded-md border border-border bg-background/30 p-1.5">
          {filteredDocs.map((d) => (
            <div
              key={d.id}
              className={cn(
                "rounded border p-2.5 transition-colors font-mono space-y-1.5",
                d.status === "failed"
                  ? "border-kai-rose/30 bg-kai-rose/[0.04]"
                  : d.status === "processing"
                  ? "border-kai-orange/30 bg-kai-orange/[0.03]"
                  : "border-border/80 bg-card/60 hover:bg-card hover:border-border"
              )}
            >
              {/* Row Top */}
              <div className="flex items-center gap-2.5">
                <DocStatus status={d.status} />
                <FileCode size={12} className="text-kai-dim shrink-0" />
                <span
                  className="min-w-0 flex-1 truncate text-xs font-medium text-kai-text"
                  title={d.filename}
                >
                  {d.filename}
                </span>

                <Badge
                  tone={d.status === "ready" ? "green" : d.status === "processing" ? "orange" : "rose"}
                  className="shrink-0 text-[10px]"
                >
                  {d.status}
                </Badge>

                <Badge tone="neutral" className="shrink-0 text-[10px]">
                  {d.child_count} child · {d.parent_count} parent
                </Badge>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void deleteDoc(d)}
                  className="h-6 w-6 p-0 hover:text-kai-rose shrink-0"
                  title="Remove document"
                >
                  <Trash2 size={12} />
                </Button>
              </div>

              {/* Error Banner if document failed embedding/ingestion */}
              {d.error && (
                <div className="flex items-start gap-2 rounded border border-kai-rose/30 bg-kai-rose/10 p-2 text-[10px] text-kai-rose">
                  <TriangleAlert size={12} className="shrink-0 mt-0.5 text-kai-rose" />
                  <div className="min-w-0 flex-1 break-words">
                    <span className="font-bold block mb-0.5">Embedding failed:</span>
                    <span>{d.error}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void deleteDoc(d)}
                    className="h-5 text-[9px] px-1.5 text-kai-rose hover:bg-kai-rose/20 hover:text-kai-rose shrink-0"
                  >
                    Dismiss
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {docs.length > 0 && filteredDocs.length > 0 && (
        <div className="flex items-center justify-between text-[10px] font-mono text-kai-dim px-1">
          <span>
            Showing {filteredDocs.length} of {docs.length} documents
          </span>
          {processingDocs.length > 0 && (
            <span className="text-kai-orange flex items-center gap-1">
              <Spinner size={10} /> {processingDocs.length} document{processingDocs.length === 1 ? "" : "s"} currently embedding...
            </span>
          )}
        </div>
      )}

      <FolderImportModal
        open={folderModalState.open}
        onClose={() => setFolderModalState((s) => ({ ...s, open: false }))}
        folderName={folderModalState.folderName}
        files={folderModalState.files}
        wsId={wsId}
        module={module}
        onChanged={onChanged}
      />
    </Card>
  )
}

function DocStatus({ status }: { status: PrismDocument["status"] }) {
  if (status === "processing") {
    return <Spinner size={13} className="shrink-0 text-kai-orange" />
  }
  if (status === "failed") {
    return <TriangleAlert size={13} className="shrink-0 text-kai-rose" />
  }
  return <CheckCircle2 size={13} className="shrink-0 text-kai-green" />
}

function FolderImportModal({
  open,
  onClose,
  folderName,
  files,
  wsId,
  module,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  folderName: string
  files: File[]
  wsId: string
  module: string
  onChanged: () => void
}) {
  const pushToast = useToastStore((s) => s.push)

  // Map raw files into structured scan items
  const scannedFiles: ScannedFile[] = useMemo(() => {
    return files.map((f) => {
      const p = f.webkitRelativePath || f.name
      const dotIdx = f.name.lastIndexOf(".")
      const ext = dotIdx >= 0 ? f.name.slice(dotIdx).toLowerCase() : ""
      const supported = PRISM_SUPPORTED_EXTENSIONS.has(ext)
      return {
        file: f,
        path: p,
        name: f.name,
        ext,
        size: f.size,
        supported,
      }
    })
  }, [files])

  // Count occurrences of each extension found in this folder
  const discoveredExtensions = useMemo(() => {
    const map = new Map<string, { ext: string; count: number; supported: boolean }>()
    for (const f of scannedFiles) {
      const key = f.ext || "(no ext)"
      const cur = map.get(key) || { ext: key, count: 0, supported: f.supported }
      cur.count++
      map.set(key, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [scannedFiles])

  // Filters state
  const [selectedCategory, setSelectedCategory] = useState<string>("all-supported")
  const [activeExtPills, setActiveExtPills] = useState<Set<string>>(new Set())
  const [customExtInput, setCustomExtInput] = useState<string>("")
  const [nameSearch, setNameSearch] = useState<string>("")
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  // Import execution state
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [currentFile, setCurrentFile] = useState("")

  // Filtered files computation
  const filteredFiles = useMemo(() => {
    const customList = customExtInput
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .map((s) => (s.startsWith(".") ? s : `.${s}`))

    const activeCat = CATEGORY_PRESETS.find((c) => c.id === selectedCategory)

    return scannedFiles.filter((f) => {
      // 1. Filename / path search filter
      if (nameSearch.trim()) {
        const query = nameSearch.trim().toLowerCase()
        if (!f.path.toLowerCase().includes(query)) return false
      }

      // 2. Custom extension filter input (highest precedence if typed)
      if (customList.length > 0) {
        return customList.includes(f.ext)
      }

      // 3. Clicked dynamic extension pills (if any active)
      if (activeExtPills.size > 0) {
        return activeExtPills.has(f.ext)
      }

      // 4. Category preset filter
      if (!activeCat) return true
      if (activeCat.exts === null) {
        return f.supported
      }
      if (activeCat.exts === "all") {
        return true
      }
      return activeCat.exts.includes(f.ext)
    })
  }, [scannedFiles, selectedCategory, activeExtPills, customExtInput, nameSearch])

  // When the modal opens or files change, preselect all supported matching files
  useEffect(() => {
    if (!open) return
    const initialSelected = new Set<string>()
    for (const f of filteredFiles) {
      if (f.supported) initialSelected.add(f.path)
    }
    setSelectedPaths(initialSelected)
  }, [open, filteredFiles])

  // Toggle individual extension pill
  const toggleExtPill = (ext: string) => {
    setSelectedCategory("") // clear preset when custom pill clicked
    setActiveExtPills((prev) => {
      const next = new Set(prev)
      if (next.has(ext)) {
        next.delete(ext)
      } else {
        next.add(ext)
      }
      return next
    })
  }

  // Selection actions
  const selectAll = () => {
    setSelectedPaths(new Set(filteredFiles.map((f) => f.path)))
  }

  const selectSupportedOnly = () => {
    setSelectedPaths(new Set(filteredFiles.filter((f) => f.supported).map((f) => f.path)))
  }

  const deselectAll = () => {
    setSelectedPaths(new Set())
  }

  const togglePath = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  // Selected files metrics
  const selectedFilesList = useMemo(() => {
    return filteredFiles.filter((f) => selectedPaths.has(f.path))
  }, [filteredFiles, selectedPaths])

  const totalSelectedBytes = useMemo(() => {
    return selectedFilesList.reduce((sum, f) => sum + f.size, 0)
  }, [selectedFilesList])

  // Run batch import
  async function runBatchImport() {
    if (selectedFilesList.length === 0) return
    setImporting(true)
    setImportedCount(0)
    try {
      for (let i = 0; i < selectedFilesList.length; i++) {
        const item = selectedFilesList[i]
        setCurrentFile(item.path)
        const text = await item.file.text()
        await api.importPrismDocument(wsId, module, {
          filename: item.path,
          text,
        })
        setImportedCount(i + 1)
      }
      pushToast("success", `Imported ${selectedFilesList.length} file(s) into ${module}`)
      onChanged()
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      pushToast("error", "Folder import failed", msg)
    } finally {
      setImporting(false)
      setCurrentFile("")
    }
  }

  return (
    <Modal open={open} onClose={() => !importing && onClose()} className="max-w-2xl font-mono">
      <div className="flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 bg-card/60">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-md border border-kai-orange/40 bg-kai-orange/10">
              <FolderSearch size={14} className="text-kai-orange" />
            </span>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-kai-white">
                Import Folder to <span className="text-kai-orange">{module}</span>
              </h2>
              <p className="text-[11px] text-kai-dim">
                {scannedFiles.length} files discovered in <span className="text-kai-text">{folderName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="rounded p-1 text-kai-dim transition-colors hover:bg-panel hover:text-kai-text disabled:opacity-30"
          >
            <X size={15} />
          </button>
        </div>

        {/* Filters and options */}
        <div className="p-4 space-y-3.5 border-b border-border bg-background/50 overflow-y-auto">
          {/* Presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-kai-dim flex items-center gap-1">
                <Filter size={10} /> Category Presets
              </span>
              {selectedCategory && (
                <span className="text-[10px] text-kai-orange">
                  Active: {CATEGORY_PRESETS.find((c) => c.id === selectedCategory)?.label}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_PRESETS.map((cat) => {
                const isSelected = selectedCategory === cat.id && activeExtPills.size === 0 && !customExtInput
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat.id)
                      setActiveExtPills(new Set())
                      setCustomExtInput("")
                    }}
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] transition-colors border",
                      isSelected
                        ? "border-kai-orange/60 bg-kai-orange/15 text-kai-orange font-bold"
                        : "border-border bg-card/60 text-kai-dim hover:text-kai-text hover:border-border/80"
                    )}
                  >
                    {cat.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Discovered Extensions */}
          {discoveredExtensions.length > 0 && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-kai-dim block mb-1.5">
                Discovered Extensions in Folder (Click to toggle)
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                {discoveredExtensions.map((item) => {
                  const isPillActive = activeExtPills.has(item.ext)
                  return (
                    <button
                      key={item.ext}
                      type="button"
                      onClick={() => toggleExtPill(item.ext)}
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] transition-colors border flex items-center gap-1",
                        isPillActive
                          ? "border-kai-orange bg-kai-orange/20 text-kai-orange font-bold shadow-[0_0_8px_-2px_var(--kai-orange)]"
                          : item.supported
                          ? "border-border bg-card text-kai-text hover:border-kai-orange/40 hover:text-kai-orange"
                          : "border-border/40 bg-panel/30 text-kai-dim/60 hover:text-kai-dim"
                      )}
                      title={item.supported ? `Filter by ${item.ext}` : `${item.ext} is not natively supported by PRISM`}
                    >
                      <span>{item.ext}</span>
                      <span className="text-[9px] opacity-70">({item.count})</span>
                      {!item.supported && <span className="text-[8px] text-kai-amber">⊘</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Custom Filter and Search Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-kai-dim mb-1">
                Filter by Extension (.md, .py, .txt)
              </label>
              <input
                value={customExtInput}
                onChange={(e) => {
                  setCustomExtInput(e.target.value)
                  if (e.target.value) {
                    setSelectedCategory("")
                    setActiveExtPills(new Set())
                  }
                }}
                placeholder=".md, .txt, .py, .go"
                className={cn(
                  "w-full rounded border border-border bg-card px-2.5 py-1 text-xs text-kai-text",
                  "placeholder:text-kai-dim/60 outline-none focus:border-kai-orange/50"
                )}
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-kai-dim mb-1">
                Search Filename or Path
              </label>
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-kai-dim" />
                <input
                  value={nameSearch}
                  onChange={(e) => setNameSearch(e.target.value)}
                  placeholder="e.g. guide, api, docs/..."
                  className={cn(
                    "w-full rounded border border-border bg-card pl-7 pr-2.5 py-1 text-xs text-kai-text",
                    "placeholder:text-kai-dim/60 outline-none focus:border-kai-orange/50"
                  )}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Selection Stats Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-card/40 border-b border-border text-xs">
          <div className="flex items-center gap-2">
            <Badge tone={selectedFilesList.length > 0 ? "orange" : "neutral"}>
              {selectedFilesList.length} of {filteredFiles.length} selected
            </Badge>
            <span className="text-[11px] text-kai-dim font-mono">
              {formatBytes(totalSelectedBytes)} total
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={selectAll} className="h-6 text-[10px] px-2">
              Select all
            </Button>
            <Button variant="ghost" size="sm" onClick={selectSupportedOnly} className="h-6 text-[10px] px-2">
              Supported only
            </Button>
            <Button variant="ghost" size="sm" onClick={deselectAll} className="h-6 text-[10px] px-2">
              Clear
            </Button>
          </div>
        </div>

        {/* File Preview List */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[160px] max-h-[260px] space-y-1 bg-background/30">
          {filteredFiles.length === 0 ? (
            <div className="py-8 text-center text-kai-dim text-xs">
              No files match the active filters.
            </div>
          ) : (
            filteredFiles.map((item) => {
              const isChecked = selectedPaths.has(item.path)
              return (
                <div
                  key={item.path}
                  onClick={() => togglePath(item.path)}
                  className={cn(
                    "flex items-center gap-2.5 rounded px-2.5 py-1.5 text-xs transition-colors cursor-pointer border",
                    isChecked
                      ? "border-kai-orange/30 bg-kai-orange/[0.06] text-kai-text"
                      : "border-transparent bg-card/40 text-kai-dim hover:bg-card hover:text-kai-text"
                  )}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePath(item.path)
                    }}
                    className="shrink-0 text-kai-dim hover:text-kai-orange"
                  >
                    {isChecked ? (
                      <CheckSquare size={13} className="text-kai-orange" />
                    ) : (
                      <Square size={13} />
                    )}
                  </button>

                  <FileCode size={12} className={cn("shrink-0", isChecked ? "text-kai-orange" : "text-kai-dim")} />

                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={item.path}>
                    {item.path}
                  </span>

                  <Badge tone={item.supported ? "neutral" : "amber"} className="shrink-0 text-[10px]">
                    {item.ext || "no ext"}
                  </Badge>

                  <span className="shrink-0 font-mono text-[10px] text-kai-dim tabular-nums">
                    {formatBytes(item.size)}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {/* Progress bar during import */}
        {importing && (
          <div className="px-4 py-2.5 border-t border-border bg-card/60 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-kai-orange font-bold">
                <Spinner size={12} /> Importing {importedCount} of {selectedFilesList.length}...
              </span>
              <span className="text-kai-dim truncate max-w-xs">{currentFile}</span>
            </div>
            <ProgressBar done={importedCount} total={selectedFilesList.length} />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border p-4 bg-card/60">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={importing}
          >
            Cancel
          </Button>

          <Button
            variant="primary"
            size="sm"
            disabled={selectedFilesList.length === 0 || importing}
            loading={importing}
            onClick={() => void runBatchImport()}
          >
            <Upload size={12} />
            Import {selectedFilesList.length} File{selectedFilesList.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Ask({
  asking,
  onAsk,
  answer,
}: {
  asking: boolean
  onAsk: (q: string) => void
  answer: PrismAnswer | null
}) {
  const [q, setQ] = useState("")
  const pushToast = useToastStore((s) => s.push)

  const copyChunk = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      pushToast("success", "Copied chunk to clipboard")
    }).catch(() => {})
  }

  return (
    <Card className="hud-corners p-4">
      <SectionLabel className="mb-3">Ask Module</SectionLabel>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-kai-dim pointer-events-none"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAsk(q)}
            placeholder="Ask this module a question"
            className={cn(
              "w-full rounded-md border border-border bg-background pl-8 pr-3 py-2",
              "font-mono text-xs text-kai-text placeholder:text-kai-dim outline-none transition-colors",
              "focus:border-kai-orange/50 focus-visible:ring-2 focus-visible:ring-kai-orange/40"
            )}
          />
        </div>
        <Button
          variant="primary"
          size="md"
          disabled={asking || !q.trim()}
          loading={asking}
          onClick={() => onAsk(q)}
        >
          <Search size={13} />
          Ask
        </Button>
      </div>

      {answer && (
        <div className="animate-slide-up mt-4 space-y-3">
          <Flags answer={answer} />

          {answer.route === "complex" && !!answer.steps?.length && (
            <div className="rounded-md border border-border bg-panel/30 p-3">
              <SectionLabel className="mb-2">Decomposed Steps</SectionLabel>
              <ul className="space-y-1.5 font-mono text-xs">
                {answer.steps.map((s, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Badge tone={s.source_found ? "green" : "amber"}>
                      {s.source_found ? "hit" : "miss"}
                    </Badge>
                    <span className="text-kai-text">{s.query}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!answer.chunks.length ? (
            <div className="rounded-md border border-border bg-panel/40 p-4 font-mono text-xs text-kai-dim">
              No source in this module answers that.
            </div>
          ) : (
            <div className="space-y-2.5">
              {answer.chunks.map((c, i) => (
                <div key={i} className="rounded-md border border-border bg-kai-code overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border bg-card/60 px-3 py-1.5">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-kai-dim">
                      Chunk #{i + 1}
                    </span>
                    <button
                      onClick={() => copyChunk(c)}
                      className="flex items-center gap-1 font-mono text-[10px] text-kai-dim hover:text-kai-text transition-colors outline-none focus-visible:ring-1 focus-visible:ring-kai-orange/50"
                      title="Copy chunk"
                    >
                      <Copy size={11} />
                      Copy
                    </button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-kai-text">
                    {c}
                  </pre>
                </div>
              ))}
            </div>
          )}

          {!!answer.unresolved?.length && (
            <div className="rounded-md border border-kai-amber/30 bg-kai-amber/10 p-2.5 font-mono text-xs text-kai-amber">
              Unresolved: {answer.unresolved.join(" · ")}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// Flags renders all three states, always. Folding them into one badge would
// make "the corpus has no answer" and "retrieval is broken" look identical,
// and they call for opposite responses from the reader.
function Flags({ answer }: { answer: PrismAnswer }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Flag
        ok={answer.source_found}
        good="sourced"
        bad="no source"
        hint={
          answer.source_found
            ? "A graded, query-relevant source backs this."
            : "Nothing in this module answers the question."
        }
      />
      <Flag
        ok={answer.graded}
        good="graded"
        bad="ungraded"
        hint={
          answer.graded
            ? "Every candidate was checked for relevance."
            : "The relevance gate did not run — this context is unverified however good it looks."
        }
      />
      {answer.degraded && (
        <Flag
          ok={false}
          good=""
          bad="degraded"
          hint="Retrieval ran on a reduced pipeline; quality is materially below normal."
        />
      )}
      <span className="ml-auto font-mono text-[10px] text-kai-dim">
        {answer.route} · {answer.chunks.length} chunk{answer.chunks.length === 1 ? "" : "s"} ·{" "}
        {answer.elapsed_ms}ms
      </span>
    </div>
  )
}

function Flag({ ok, good, bad, hint }: { ok: boolean; good: string; bad: string; hint: string }) {
  return (
    <Badge
      tone={ok ? "green" : bad === "degraded" ? "rose" : "amber"}
      className="cursor-help"
    >
      <span title={hint} className="inline-flex items-center gap-1">
        {ok ? <Check size={9} /> : <TriangleAlert size={9} />}
        {ok ? good : bad}
      </span>
    </Badge>
  )
}
