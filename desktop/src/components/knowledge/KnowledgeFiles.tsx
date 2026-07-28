import { useEffect, useState } from "react"
import { FileWarning, Save } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { Badge, Button, Segmented } from "@/components/ui"
import { useToastStore } from "@/store/toast"
import { cn } from "@/lib/utils"

type FileKind = "plan" | "modules" | "brief"

const META: Record<FileKind, { label: string; path: string; hint: string }> = {
  plan: {
    label: "wiki_plan.yaml",
    path: ".kaioken/wiki_plan.yaml",
    hint: "The wiki outline: sections, documents, and the files each one draws from. Edit before a re-run to steer the next generation.",
  },
  modules: {
    label: "modules.yaml",
    path: ".kaioken/modules.yaml",
    hint: "The module plan that scopes knowledge cards. Validation warnings appear when a module claims files that do not exist.",
  },
  brief: {
    label: "architecture.md",
    path: ".kaioken/architecture.md",
    hint: "The architecture brief shared by every chapter (×2 and up). Fix its vocabulary here and the next update writes with it.",
  },
}

type FileState = {
  text: string
  loadedText: string
  missing: boolean
  validation: string[]
  coverage: number | null
}

const empty = (): FileState => ({ text: "", loadedText: "", missing: false, validation: [], coverage: null })

/**
 * Editors for the three generated knowledge files the daemon already serves
 * but the UI never called (PLAN.md G2/G3): the wiki plan, the module plan,
 * and the architecture brief. Saves go through the daemon's YAML validation —
 * a bad edit comes back as a message, never a stack trace.
 */
export default function KnowledgeFiles({ wsId }: { wsId: string }) {
  const push = useToastStore((s) => s.push)
  const [kind, setKind] = useState<FileKind>("plan")
  const [files, setFiles] = useState<Record<FileKind, FileState>>({
    plan: empty(),
    modules: empty(),
    brief: empty(),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const patch = (k: FileKind, s: Partial<FileState>) => {
      if (!cancelled) setFiles((f) => ({ ...f, [k]: { ...f[k], ...s } }))
    }
    const missing = (k: FileKind) => (err: unknown) => {
      if (err instanceof ApiError && err.status === 404) patch(k, { missing: true })
    }
    api
      .wikiPlan(wsId)
      .then((r) => patch("plan", { text: r.yaml ?? "", loadedText: r.yaml ?? "", missing: false }))
      .catch(missing("plan"))
    api
      .modules(wsId)
      .then((r) =>
        patch("modules", {
          text: r.yaml ?? "",
          loadedText: r.yaml ?? "",
          missing: false,
          validation: r.validation ?? [],
          coverage: typeof r.coverage_pct === "number" ? r.coverage_pct : null,
        })
      )
      .catch(missing("modules"))
    api
      .wikiBrief(wsId)
      .then((r) => patch("brief", { text: r.markdown ?? "", loadedText: r.markdown ?? "", missing: false }))
      .catch(missing("brief"))
    return () => {
      cancelled = true
    }
  }, [wsId])

  const file = files[kind]
  const dirty = file.text !== file.loadedText

  async function save() {
    setSaving(true)
    setError(null)
    try {
      if (kind === "plan") await api.putWikiPlan(wsId, file.text)
      else if (kind === "modules") await api.putModules(wsId, file.text)
      else await api.putWikiBrief(wsId, file.text)
      setFiles((f) => ({ ...f, [kind]: { ...f[kind], loadedText: f[kind].text, missing: false } }))
      push("success", "Saved", META[kind].path)
    } catch (err) {
      // 422 invalid_yaml carries the parser's message — surface it inline
      // beside the editor instead of a toast that vanishes mid-fix.
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Segmented
        value={kind}
        onChange={(k) => {
          setKind(k)
          setError(null)
        }}
        options={(Object.keys(META) as FileKind[]).map((k) => ({ value: k, label: META[k].label }))}
      />

      <p className="mt-2 font-mono text-[10px] leading-relaxed text-kai-dim">{META[kind].hint}</p>

      {kind === "modules" && file.coverage !== null && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={file.coverage >= 80 ? "green" : "amber"}>{file.coverage}% of files covered</Badge>
          {file.validation.map((w, i) => (
            <Badge key={i} tone="amber">
              <FileWarning size={9} />
              {w}
            </Badge>
          ))}
        </div>
      )}

      {file.missing ? (
        <p className="mt-3 rounded-md border border-dashed border-border px-4 py-6 text-center font-mono text-[11px] text-kai-dim">
          No {META[kind].label} yet — it is written by the first {kind === "modules" ? "plan" : "wiki"} run.
        </p>
      ) : (
        <>
          <textarea
            value={file.text}
            onChange={(e) => {
              const text = e.target.value
              setFiles((f) => ({ ...f, [kind]: { ...f[kind], text } }))
            }}
            spellCheck={false}
            rows={18}
            aria-label={`Edit ${META[kind].label}`}
            className={cn(
              "mt-3 w-full resize-y rounded-md border border-border bg-kai-code p-3",
              "font-mono text-[11px] leading-relaxed text-kai-text outline-none",
              "focus:border-kai-orange/50 focus-visible:ring-2 focus-visible:ring-kai-orange/40"
            )}
          />

          {error && (
            <p className="mt-2 rounded border border-kai-rose/30 bg-kai-rose/10 px-3 py-2 font-mono text-[11px] text-kai-rose">
              {error}
            </p>
          )}

          <div className="mt-2 flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={save} disabled={!dirty} loading={saving}>
              <Save size={11} />
              Save
            </Button>
            {dirty && <Badge tone="amber">unsaved</Badge>}
            <p className="font-mono text-[10px] text-kai-dim">
              Writes <code className="text-kai-tan">{META[kind].path}</code>
            </p>
          </div>
        </>
      )}
    </div>
  )
}
