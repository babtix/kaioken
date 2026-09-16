import { useState, type ReactNode } from "react"
import { Check, ChevronDown, OctagonAlert, CircleDot, Lock } from "lucide-react"
import SectionHeading from "@/components/SectionHeading"
import Icon from "@/components/Icon"
import {
  ROADMAP_CATEGORIES,
  ARCH_ENABLERS,
  type RoadmapCategory,
} from "@/data/roadmap"
import {
  MILESTONES,
  NEXT_BLOCK,
  GAPS,
  DECISIONS,
  MILESTONE_STATS,
  type Milestone,
} from "@/data/roadmap-plan"
import { cn } from "@/lib/utils"

/* ── tone styles ─────────────────────────────────────────────────────────── */

const TONE: Record<
  Milestone["tone"],
  { rule: string; badge: string; num: string; hover: string }
> = {
  red: {
    rule: "bg-kai-orange",
    badge: "border-kai-orange/40 text-kai-orange",
    num: "text-kai-orange",
    hover: "hover:border-kai-orange/40",
  },
  orange: {
    rule: "bg-kai-orange",
    badge: "border-kai-orange/40 text-kai-orange",
    num: "text-kai-orange",
    hover: "hover:border-kai-orange/40",
  },
  amber: {
    rule: "bg-kai-amber",
    badge: "border-kai-amber/40 text-kai-amber",
    num: "text-kai-amber",
    hover: "hover:border-kai-amber/45",
  },
  blue: {
    rule: "bg-kai-blue",
    badge: "border-kai-blue/40 text-kai-blue",
    num: "text-kai-blue",
    hover: "hover:border-kai-blue/40",
  },
  green: {
    rule: "bg-kai-green",
    badge: "border-kai-green/40 text-kai-green",
    num: "text-kai-green",
    hover: "hover:border-kai-green/40",
  },
}

const STATUS_LABEL: Record<Milestone["status"], string> = {
  urgent: "urgent",
  open: "open",
  "in-progress": "working on it",
  partial: "partial — remainder open",
  done: "shipped",
  superseded: "superseded",
}

const LEAF_STATUS: Record<
  string,
  { icon: ReactNode; label: string; cls: string }
> = {
  ready: {
    icon: <CircleDot className="size-3" />,
    label: "ready",
    cls: "text-kai-green border-kai-green/30",
  },
  done: {
    icon: <Check className="size-3" strokeWidth={3} />,
    label: "done",
    cls: "text-kai-green border-kai-green/30",
  },
  blocked: {
    icon: <Lock className="size-3" />,
    label: "blocked",
    cls: "text-kai-dim border-border",
  },
}

const CATEGORY_TONE: Record<
  RoadmapCategory["tone"],
  { icon: string; rule: string; badge: string }
> = {
  orange: {
    icon: "text-kai-orange",
    rule: "bg-kai-orange",
    badge: "border-kai-orange/40 text-kai-orange",
  },
  amber: {
    icon: "text-kai-amber",
    rule: "bg-kai-amber",
    badge: "border-kai-amber/40 text-kai-amber",
  },
  blue: {
    icon: "text-kai-blue",
    rule: "bg-kai-blue",
    badge: "border-kai-blue/40 text-kai-blue",
  },
  green: {
    icon: "text-kai-green",
    rule: "bg-kai-green",
    badge: "border-kai-green/40 text-kai-green",
  },
}

/* ── feature board category section (from /next) ────────────────────────── */

function CategorySection({ cat }: { cat: RoadmapCategory }) {
  const tone = CATEGORY_TONE[cat.tone]
  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="mt-0.5 font-mono text-[11px] tracking-[0.25em] text-kai-dim">
            {cat.index}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Icon name={cat.icon} className="size-4.5 text-kai-orange" />
              <h3 className="font-mono text-lg font-bold tracking-tight text-foreground sm:text-xl">
                {cat.title}
              </h3>
              {cat.status && (
                <span
                  className={cn(
                    "rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase",
                    tone.badge
                  )}
                >
                  {cat.status}
                </span>
              )}
            </div>
            <p className="mt-2 max-w-2xl font-sans text-[13.5px] leading-relaxed text-muted-foreground">
              {cat.blurb}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "hidden shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase sm:block",
            tone.badge
          )}
        >
          {cat.items.length} features
        </span>
      </div>

      {/* feature cards */}
      <div className="mt-8 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {cat.items.map((item) => (
          <article
            key={item.title}
            className="group relative glass p-5 transition-all duration-300 hover:brightness-110"
          >
            <span
              className={cn(
                "absolute inset-y-0 left-0 w-[2px] origin-top scale-y-0 transition-transform duration-300 group-hover:scale-y-100",
                tone.rule
              )}
              aria-hidden
            />
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-mono text-[13.5px] font-bold text-foreground">{item.title}</h4>
              {item.done && (
                <span
                  className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-kai-green/15 text-kai-green"
                  title="Already shipped"
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
            </div>
            <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}

/* ── milestone card ──────────────────────────────────────────────────────── */

function MilestoneCard({ m }: { m: Milestone }) {
  const tone = TONE[m.tone]
  const [open, setOpen] = useState(m.status === "urgent")

  return (
    <article
      className={cn(
        "overflow-hidden rounded-sm border border-border bg-card transition-colors",
        tone.hover
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-4 p-5 text-left sm:gap-5 sm:p-6"
      >
        <span
          className={cn(
            "mt-0.5 shrink-0 font-mono text-sm font-bold tracking-tight",
            tone.num
          )}
        >
          {m.num}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-[15px] font-bold tracking-tight text-foreground sm:text-base">
              {m.title}
            </h3>
            {m.priority && (
              <span
                className={cn(
                  "rounded-sm border px-1.5 py-px font-mono text-[10px] font-bold tracking-wider",
                  tone.badge
                )}
              >
                {m.priority}
              </span>
            )}
            <span
              className={cn(
                "rounded-sm border px-1.5 py-px font-mono text-[10px] tracking-wider uppercase",
                tone.badge
              )}
            >
              {STATUS_LABEL[m.status]}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-kai-dim">{m.target}</p>
          {!open && (
            <p className="mt-2 line-clamp-2 font-sans text-[13px] leading-relaxed text-muted-foreground">
              {m.tagline}
            </p>
          )}
        </div>
        <ChevronDown
          className={cn(
            "mt-1 size-4 shrink-0 text-kai-dim transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="border-t border-border px-5 pb-6 pt-5 sm:px-6">
          <p className="max-w-3xl font-sans text-[13.5px] leading-relaxed text-muted-foreground">
            {m.tagline}
          </p>

          <p className="mt-3 font-mono text-[11px] tracking-wider text-kai-dim uppercase">
            verdict · <span className={cn("normal-case", tone.num)}>{m.verdict}</span>
          </p>

          {/* ships */}
          <ul className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {m.ships.map((s) => (
              <li key={s} className="flex items-start gap-2">
                <span className={cn("mt-1.5 h-px w-3 shrink-0", tone.rule)} aria-hidden />
                <span className="font-sans text-[13px] leading-relaxed text-foreground/90">
                  {s}
                </span>
              </li>
            ))}
          </ul>

          {/* leaves */}
          <div className="mt-5 overflow-hidden rounded-sm border border-border">
            {m.leaves.map((leaf, i) => {
              const ls = LEAF_STATUS[leaf.status ?? "ready"] ?? LEAF_STATUS.ready
              return (
                <div
                  key={leaf.num}
                  className={cn(
                    "flex items-center gap-3 px-3.5 py-2.5",
                    i % 2 === 1 && "bg-kai-panel/40",
                    i > 0 && "border-t border-white/[0.05]"
                  )}
                >
                  <span className="shrink-0 font-mono text-[11px] text-kai-dim">
                    {leaf.num}
                  </span>
                  <span className="min-w-0 flex-1 font-mono text-[12.5px] leading-snug text-foreground/90">
                    {leaf.title}
                  </span>
                  {leaf.size && (
                    <span className="shrink-0 font-mono text-[10.5px] text-kai-dim">
                      {leaf.size}
                    </span>
                  )}
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-px font-mono text-[9.5px] tracking-wider uppercase",
                      ls.cls
                    )}
                  >
                    {ls.icon}
                    {ls.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </article>
  )
}

/* ── page ────────────────────────────────────────────────────────────────── */

export default function RoadmapPage() {
  return (
    <div className="pt-24">
      {/* hero */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="roadmap"
          title={
            <>
              What is left, <span className="serif">in what order.</span>
            </>
          }
          description="The canonical roadmap lives in the repository — one folder per milestone, one brief per sub-deliverable, each written to be handed to a coding agent as a single session. What follows is the reconciled plan: the next block of work, the milestone table, the public feature board, and what is deliberately refused."
        />

        {/* stats bar */}
        <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-5">
          {[
            { value: String(MILESTONE_STATS.milestones), label: "milestones" },
            { value: String(MILESTONE_STATS.leaves), label: "session briefs" },
            { value: String(MILESTONE_STATS.ready), label: "runnable now" },
            { value: String(MILESTONE_STATS.blocked), label: "blocked" },
            { value: String(MILESTONE_STATS.gaps), label: "known gaps" },
          ].map((s) => (
            <div key={s.label} className="glass px-5 py-5">
              <dt className="font-mono text-[10.5px] tracking-[0.2em] text-kai-dim uppercase">
                {s.label}
              </dt>
              <dd className="mt-1 font-mono text-2xl font-bold text-kai-orange">{s.value}</dd>
            </div>
          ))}
        </dl>

        {/* context note */}
        <div className="mt-6 rounded-sm p-5 glass">
          <p className="font-mono text-[12.5px] leading-relaxed text-kai-dim">
            <span className="text-kai-orange">▎</span> The premise: the implementer is an agent with
            no memory of any prior conversation, that cannot ask a clarifying question mid-run and
            will confidently invent a plausible answer if a fact is missing. So every leaf carries a
            paste-ready session brief, an explicit out-of-scope list, the real gate commands, and a
            traps section. A brief that cannot be executed without asking a question is{" "}
            <span className="text-foreground">not finished.</span>
          </p>
        </div>
      </section>

      {/* suggested next block */}
      <section className="mt-16 border-t border-border py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="next block"
            title={
              <>
                The next <span className="serif">block of work.</span>
              </>
            }
            description="A reading of the milestone table and the known gaps together. Treated as a proposal, not a plan of record."
          />
          <ul className="mt-8 space-y-0 overflow-hidden rounded-sm border border-border">
            {NEXT_BLOCK.map((item, i) => (
              <li
                key={item.priority}
                className="group flex flex-col gap-2 border-b border-white/[0.06] glass px-5 py-4 transition-all duration-200 last:border-b-0 sm:flex-row sm:items-center sm:gap-5"
              >
                <span className="shrink-0 font-mono text-[11px] text-kai-dim">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-sm border px-1.5 py-px font-mono text-[10px] font-bold tracking-wider",
                    item.tone === "red" && "border-kai-orange/40 text-kai-orange",
                    item.tone === "orange" && "border-kai-orange/40 text-kai-orange",
                    item.tone === "amber" && "border-kai-amber/40 text-kai-amber",
                    item.tone === "blue" && "border-kai-blue/40 text-kai-blue"
                  )}
                >
                  {item.priority}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[13.5px] font-bold text-foreground">{item.work}</p>
                  <p className="mt-1 font-sans text-[13px] leading-relaxed text-muted-foreground">
                    {item.rationale}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* milestones */}
      <div className="mt-4 border-t border-border pt-16 sm:pt-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="milestones"
            title={
              <>
                The milestone <span className="serif">table.</span>
              </>
            }
            description="The original 12-month sequence, reconciled against the v2 rewrite. The sequencing logic survived the rewrite; the milestone contents did not."
          />
          <div className="mt-8 space-y-3">
            {MILESTONES.map((m) => (
              <MilestoneCard key={m.id} m={m} />
            ))}
          </div>
        </div>
      </div>

      {/* public feature board (merged from /next) */}
      <section className="mt-16 border-t border-border py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="feature board"
            title={
              <>
                The public feature <span className="serif">board.</span>
              </>
            }
            description="Ten categories × six features — the enhancement surface, grounded in the existing architecture. Check marks are already shipped."
          />
          <div className="mt-14 space-y-16 sm:space-y-20">
            {ROADMAP_CATEGORIES.map((cat) => (
              <CategorySection key={cat.id} cat={cat} />
            ))}
          </div>
        </div>
      </section>

      {/* architectural enablers (merged from /next) */}
      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="foundation"
            title={
              <>
                Architectural <span className="serif">enablers.</span>
              </>
            }
            description="Cross-cutting changes that underpin multiple categories above. Each one extends an existing structure rather than introducing a new system."
          />
          <ul className="mt-8 space-y-0 overflow-hidden rounded-sm border border-border">
            {ARCH_ENABLERS.map((item, i) => (
              <li
                key={item.title}
                className="group flex gap-4 border-b border-white/[0.06] glass px-5 py-4 transition-all duration-200 last:border-b-0"
              >
                <span className="mt-px shrink-0 font-mono text-[11px] text-kai-dim">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-[13.5px] font-bold text-foreground">{item.title}</p>
                    {item.done && (
                      <span
                        className="flex size-4 shrink-0 items-center justify-center rounded-full bg-kai-green/15 text-kai-green"
                        title="Already shipped"
                      >
                        <Check className="size-2.5" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-sans text-[13px] leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* gaps */}
      <section className="mt-16 border-t border-border py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="honesty"
            title={
              <>
                Known <span className="serif">gaps.</span>
              </>
            }
            description="Documented, not scheduled. Each is a roadmap candidate; none is currently on a milestone. The engine records these honestly rather than hiding them."
          />
          <div className="mt-8 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {GAPS.map((g) => (
              <article key={g.id} className="glass p-5">
                <div className="flex items-center gap-2.5">
                  <OctagonAlert className="size-3.5 text-kai-amber" />
                  <p className="font-mono text-[13px] font-bold text-foreground">
                    {g.id} · {g.title}
                  </p>
                </div>
                <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted-foreground">
                  {g.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* decisions */}
      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="open questions"
            title={
              <>
                Four decisions gate the <span className="serif">back half.</span>
              </>
            }
            description="Decision records, not build briefs. Twelve leaves are blocked on these four files and nothing else."
          />
          <div className="mt-8 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2">
            {DECISIONS.map((d) => (
              <article key={d.id} className="glass p-5">
                <div className="flex items-center gap-2.5">
                  <CircleDot className="size-3.5 text-kai-blue" />
                  <p className="font-mono text-[13px] font-bold text-foreground">
                    {d.id} · {d.title}
                  </p>
                </div>
                <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted-foreground">
                  {d.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* closing */}
      <section className="relative overflow-hidden border-t border-border">
        <div className="rule-sweep absolute inset-x-0 top-0 h-px" aria-hidden />
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <p className="font-mono text-[11px] tracking-[0.3em] text-kai-dim uppercase">
            the operating rules
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl text-balance font-sans text-2xl font-bold tracking-[-0.03em] text-foreground sm:text-3xl">
            The bottleneck is <span className="serif">review,</span> not generation.
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-sans text-[14px] leading-relaxed text-muted-foreground">
            The agent's UI interface, the tool schema, the Progress callbacks, the serve routes, and
            the codemap Index — these are the extension points each enhancement plugs into.
          </p>
        </div>
      </section>
    </div>
  )
}
