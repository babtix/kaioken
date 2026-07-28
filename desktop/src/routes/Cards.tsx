import { useEffect, useState } from "react"
import { FileStack, Layers, Pencil, Save, Sparkles, X } from "lucide-react"
import { useWorkspaceStore } from "@/store/workspace"
import { api } from "@/lib/api"
import Markdown from "@/components/common/Markdown"
import EmptyState from "@/components/EmptyState"
import KnowledgeFiles from "@/components/knowledge/KnowledgeFiles"
import { Badge, Button, Card, Modal, Segmented, Skeleton } from "@/components/ui"
import { useToastStore } from "@/store/toast"
import { cn } from "@/lib/utils"

type CardMeta = { name: string; path: string; lines: number }
type ModuleCards = { id: string; cards: CardMeta[] }
type Skill = { name: string; description: string; sources: string[]; stale: boolean }

type Viewing =
  | { kind: "card"; title: string; markdown: string }
  | { kind: "skill"; title: string; markdown: string; name: string; description: string; sources: string[] }

export default function Cards() {
  const ws = useWorkspaceStore((s) => s.active)
  const push = useToastStore((s) => s.push)
  const [tab, setTab] = useState<"cards" | "skills" | "files">("cards")
  const [modules, setModules] = useState<ModuleCards[] | null>(null)
  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [viewing, setViewing] = useState<Viewing | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ description: "", markdown: "" })
  const [savingSkill, setSavingSkill] = useState(false)
  const [skillError, setSkillError] = useState<string | null>(null)

  useEffect(() => {
    if (!ws) return
    api.cards(ws.id).then((r) => setModules(r.modules || [])).catch(() => setModules([]))
    api.skills(ws.id).then((r) => setSkills(r.skills || [])).catch(() => setSkills([]))
  }, [ws?.id])

  if (!ws) {
    return <EmptyState icon={Layers} title="No workspace open" hint="Open a repository to browse its knowledge." />
  }

  async function openCard(moduleId: string, card: CardMeta) {
    if (!ws) return
    try {
      const res = await api.card(ws.id, moduleId, card.name)
      setViewing({ kind: "card", title: `${moduleId} · ${card.name}`, markdown: res.markdown })
    } catch {
      /* the viewer simply does not open */
    }
  }

  async function openSkill(name: string) {
    if (!ws) return
    try {
      const res = await api.getSkill(ws.id, name)
      setViewing({
        kind: "skill",
        title: name,
        markdown: res.markdown,
        name: res.name,
        description: res.description,
        sources: res.sources ?? [],
      })
      setEditing(false)
      setSkillError(null)
    } catch {
      /* ignore */
    }
  }

  async function saveSkill() {
    if (!ws || !viewing || viewing.kind !== "skill") return
    setSavingSkill(true)
    setSkillError(null)
    try {
      const saved = await api.putSkill(ws.id, viewing.name, {
        description: draft.description,
        sources: viewing.sources,
        markdown: draft.markdown,
      })
      setViewing({ ...viewing, markdown: saved.markdown, description: saved.description })
      setEditing(false)
      setSkills((all) =>
        all ? all.map((s) => (s.name === saved.name ? { ...s, description: saved.description } : s)) : all
      )
      push("success", "Skill saved", `.kaioken/skills/${saved.name}/SKILL.md`)
    } catch (err) {
      // 422 = the frontmatter round-trip failed; show the parser's words.
      setSkillError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingSkill(false)
    }
  }

  const cardCount = modules?.reduce((n, m) => n + m.cards.length, 0) ?? 0

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "cards", label: "Knowledge cards", count: cardCount },
          { value: "skills", label: "Skills", count: skills?.length },
          { value: "files", label: "Plan & brief" },
        ]}
      />

      <div className="mt-5">
        {tab === "files" ? (
          <KnowledgeFiles wsId={ws.id} />
        ) : tab === "cards" ? (
          modules === null ? (
            <ListSkeleton />
          ) : modules.length === 0 ? (
            <EmptyState
              icon={FileStack}
              title="No knowledge cards yet"
              hint="Cards are dense per-module briefs an agent loads as project context. Generate them from the Activity screen."
            />
          ) : (
            <div className="space-y-2">
              {modules.map((m) => (
                <Card key={m.id} className="p-3">
                  <p className="font-mono text-xs font-semibold text-kai-text">{m.id}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.cards.map((c) => (
                      <button
                        key={c.name}
                        onClick={() => openCard(m.id, c)}
                        className={cn(
                          "rounded border border-border bg-panel px-2 py-0.5 font-mono text-[10px] text-kai-muted",
                          "transition-colors outline-none hover:border-kai-orange/40 hover:text-kai-orange",
                          "focus-visible:ring-2 focus-visible:ring-kai-orange/50"
                        )}
                      >
                        {c.name}
                        <span className="ml-1 text-kai-dim">{c.lines}L</span>
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : skills === null ? (
          <ListSkeleton />
        ) : skills.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No skills yet"
            hint="A skill is a task-oriented capsule — how to do X in this repository, which files to touch, in what order. Build them from Activity."
          />
        ) : (
          <div className="space-y-2">
            {skills.map((s) => (
              <button
                key={s.name}
                onClick={() => openSkill(s.name)}
                className={cn(
                  "block w-full rounded-lg border border-border bg-card p-3 text-left transition-colors outline-none",
                  "hover:border-kai-orange/40 focus-visible:ring-2 focus-visible:ring-kai-orange/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={12} className="shrink-0 text-kai-tan" />
                  <span className="font-mono text-xs font-semibold text-kai-text">{s.name}</span>
                  {s.stale && <Badge tone="amber">stale</Badge>}
                </div>
                <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-kai-muted">
                  {s.description}
                </p>
                {s.sources?.length > 0 && (
                  <p className="mt-1.5 truncate font-mono text-[9px] text-kai-dim">
                    {s.sources.join(" · ")}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        labelledBy="viewer-title"
        className="max-w-3xl"
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 id="viewer-title" className="min-w-0 truncate font-mono text-sm font-bold text-kai-text">
            {viewing?.title}
          </h2>
          {viewing?.kind === "skill" && !editing && (
            <button
              onClick={() => {
                setDraft({ description: viewing.description, markdown: viewing.markdown })
                setEditing(true)
              }}
              className={cn(
                "ml-auto flex shrink-0 items-center gap-1 rounded border border-border px-2 py-0.5",
                "font-mono text-[10px] text-kai-dim transition-colors outline-none",
                "hover:border-kai-orange/40 hover:text-kai-orange focus-visible:ring-2 focus-visible:ring-kai-orange/50"
              )}
            >
              <Pencil size={10} />
              Edit
            </button>
          )}
          <button
            onClick={() => setViewing(null)}
            className={cn(
              "shrink-0 rounded p-1 text-kai-dim transition-colors hover:text-kai-text",
              !(viewing?.kind === "skill" && !editing) && "ml-auto"
            )}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {viewing && !editing && <Markdown>{viewing.markdown}</Markdown>}
          {viewing?.kind === "skill" && editing && (
            <div className="space-y-3">
              <label className="block">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-kai-dim">
                  Description
                </span>
                <input
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  className={cn(
                    "mt-1 w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-kai-text",
                    "outline-none focus:border-kai-orange/50 focus-visible:ring-2 focus-visible:ring-kai-orange/40"
                  )}
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-kai-dim">
                  SKILL.md body
                </span>
                <textarea
                  value={draft.markdown}
                  onChange={(e) => setDraft((d) => ({ ...d, markdown: e.target.value }))}
                  rows={16}
                  spellCheck={false}
                  className={cn(
                    "mt-1 w-full resize-y rounded-md border border-border bg-kai-code p-3",
                    "font-mono text-[11px] leading-relaxed text-kai-text outline-none",
                    "focus:border-kai-orange/50 focus-visible:ring-2 focus-visible:ring-kai-orange/40"
                  )}
                />
              </label>
              {skillError && (
                <p className="rounded border border-kai-rose/30 bg-kai-rose/10 px-3 py-2 font-mono text-[11px] text-kai-rose">
                  {skillError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" onClick={saveSkill} loading={savingSkill}>
                  <Save size={11} />
                  Save skill
                </Button>
                <Button size="sm" onClick={() => { setEditing(false); setSkillError(null) }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  )
}
