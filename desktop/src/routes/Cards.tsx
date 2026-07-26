import { useEffect, useState } from "react"
import { FileStack, Layers, Sparkles, X } from "lucide-react"
import { useWorkspaceStore } from "@/store/workspace"
import { api } from "@/lib/api"
import Markdown from "@/components/common/Markdown"
import EmptyState from "@/components/EmptyState"
import { Badge, Card, Modal, Segmented, Skeleton } from "@/components/ui"
import { cn } from "@/lib/utils"

type CardMeta = { name: string; path: string; lines: number }
type ModuleCards = { id: string; cards: CardMeta[] }
type Skill = { name: string; description: string; sources: string[]; stale: boolean }

export default function Cards() {
  const ws = useWorkspaceStore((s) => s.active)
  const [tab, setTab] = useState<"cards" | "skills">("cards")
  const [modules, setModules] = useState<ModuleCards[] | null>(null)
  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [viewing, setViewing] = useState<{ title: string; markdown: string } | null>(null)

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
      setViewing({ title: `${moduleId} · ${card.name}`, markdown: res.markdown })
    } catch {
      /* the viewer simply does not open */
    }
  }

  async function openSkill(name: string) {
    if (!ws) return
    try {
      const res = await api.getSkill(ws.id, name)
      setViewing({ title: name, markdown: res.markdown })
    } catch {
      /* ignore */
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
        ]}
      />

      <div className="mt-5">
        {tab === "cards" ? (
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
          <button
            onClick={() => setViewing(null)}
            className="ml-auto shrink-0 rounded p-1 text-kai-dim transition-colors hover:text-kai-text"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {viewing && <Markdown>{viewing.markdown}</Markdown>}
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
