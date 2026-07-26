import { useEffect, useState } from "react"
import { useWorkspaceStore } from "@/store/workspace"
import { api } from "@/lib/api"

export default function Cards() {
  const ws = useWorkspaceStore((s) => s.active)
  const [cards, setCards] = useState<any>(null)
  const [skills, setSkills] = useState<any[]>([])
  const [tab, setTab] = useState<"cards" | "skills">("cards")

  useEffect(() => {
    if (!ws) return
    api.cards(ws.id).then(setCards).catch(() => {})
    api.skills(ws.id).then((r) => setSkills(r.skills || [])).catch(() => {})
  }, [ws?.id])

  if (!ws) return <div className="flex h-full items-center justify-center font-mono text-sm text-kai-dim">Open a workspace first</div>

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex gap-3">
        <button onClick={() => setTab("cards")} className={`font-mono text-xs ${tab === "cards" ? "text-kai-orange" : "text-kai-dim"}`}>Cards</button>
        <button onClick={() => setTab("skills")} className={`font-mono text-xs ${tab === "skills" ? "text-kai-orange" : "text-kai-dim"}`}>Skills</button>
      </div>

      {tab === "cards" && (
        <div className="space-y-3">
          {cards?.modules?.map((mod: any) => (
            <div key={mod.id} className="rounded border border-border bg-card p-3">
              <p className="font-mono text-xs font-bold text-kai-text">{mod.id}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {mod.cards?.map((c: any) => (
                  <span key={c.name} className="rounded bg-panel px-2 py-0.5 font-mono text-[10px] text-kai-muted">
                    {c.name} ({c.lines}L)
                  </span>
                ))}
              </div>
            </div>
          ))}
          {(!cards?.modules || cards.modules.length === 0) && (
            <p className="font-mono text-xs text-kai-dim">No cards generated yet — run Generate from Activity</p>
          )}
        </div>
      )}

      {tab === "skills" && (
        <div className="space-y-2">
          {skills.map((sk: any) => (
            <div key={sk.name} className="rounded border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <p className="font-mono text-xs font-bold text-kai-text">{sk.name}</p>
                {sk.stale && <span className="rounded bg-kai-amber/20 px-1.5 font-mono text-[9px] text-kai-amber">stale</span>}
              </div>
              <p className="mt-1 font-mono text-[10px] text-kai-muted">{sk.description}</p>
            </div>
          ))}
          {skills.length === 0 && (
            <p className="font-mono text-xs text-kai-dim">No skills yet — run Skills from Activity</p>
          )}
        </div>
      )}
    </div>
  )
}
