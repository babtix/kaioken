import { useMemo, useState, type ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Check, Copy, CornerDownLeft, Download, RefreshCw, TriangleAlert } from "lucide-react"
import { openInBrowser } from "@/lib/openInBrowser"
import { cn } from "@/lib/utils"
import CodeBlock from "@/components/common/CodeBlock"
import { SourceCard, SourceChip, SourceRow } from "./SourceChip"
import { ResearchSteps } from "./ResearchSteps"
import type { Answer, AnswerSource } from "./types"

/**
 * AnswerCard treats a result as a small report rather than a chat bubble:
 * structured prose with inline citations, a provenance row, parallel views of
 * the same result, and per-answer actions.
 *
 * Two of the teardown's criticisms are designed out rather than inherited:
 *
 *  · Tabs compete with the answer on first load. So Answer is not merely the
 *    default tab — it carries the complete story on its own, inline chips and
 *    source row included. Sources and Steps are audit views, never the place
 *    a required fact lives.
 *  · Long follow-up lists push the composer off screen. Capped at three, with
 *    the rest behind a toggle.
 */
export function AnswerCard({
  answer,
  searched,
  rounds,
  busy = false,
  onFollowUp,
  onOpenSource,
  onCopy,
  onExport,
  onRewrite,
}: {
  answer: Answer
  searched?: number
  rounds?: number
  busy?: boolean
  onFollowUp?: (q: string) => void
  onOpenSource?: (s: AnswerSource) => void
  onCopy?: () => void
  onExport?: () => void
  onRewrite?: () => void
}) {
  const [tab, setTab] = useState<"answer" | "sources" | "steps">("answer")

  return (
    <article className="answer-surface hud-corners animate-charge">
      <header className="flex items-start gap-3 border-b border-border px-4 py-3">
        <h2 className="min-w-0 flex-1 font-mono text-[15px] leading-snug font-semibold text-kai-white">
          {answer.question}
        </h2>
        <SourceRow sources={answer.sources} onOpen={onOpenSource} />
      </header>

      <div className="space-y-3 px-4 py-3">
        <ResearchSteps
          steps={answer.steps}
          searched={searched}
          rounds={rounds}
          sourceCount={answer.sources.length}
        />

        <Tabs
          tab={tab}
          onChange={setTab}
          counts={{ sources: answer.sources.length, steps: answer.steps.length }}
        />

        {tab === "answer" && (
          <div className="md-body md-chat">
            <CitedText text={answer.body} sources={answer.sources} onOpen={onOpenSource} />
            {busy && <span className="animate-caret ml-0.5 inline-block h-3.5 w-1.5 bg-kai-orange" />}
          </div>
        )}

        {tab === "sources" && (
          <div className="grid gap-1.5">
            {answer.sources.length === 0 ? (
              <Empty>No sources were read for this answer.</Empty>
            ) : (
              answer.sources.map((s) => (
                <SourceCard key={s.n} source={s} onOpen={onOpenSource} />
              ))
            )}
          </div>
        )}

        {tab === "steps" && (
          <ResearchSteps
            steps={answer.steps}
            searched={searched}
            rounds={rounds}
            sourceCount={answer.sources.length}
            defaultOpen
          />
        )}

        {answer.incomplete && (
          <p className="flex items-start gap-1.5 rounded-[var(--radius)] border border-kai-amber/30
                        bg-kai-amber/8 px-2.5 py-1.5 font-mono text-[10.5px] text-kai-amber">
            <TriangleAlert size={12} className="mt-px shrink-0" />
            Some subquestions stayed thinly evidenced when the round limit was reached.
          </p>
        )}
      </div>

      <footer className="flex items-center gap-1 border-t border-border px-3 py-2">
        <Action icon={Copy} label="Copy" onClick={onCopy} />
        <Action icon={Download} label="Export" onClick={onExport} />
        <Action icon={RefreshCw} label="Rewrite" onClick={onRewrite} />
      </footer>

      {answer.followUps.length > 0 && (
        <FollowUps items={answer.followUps} onPick={onFollowUp} />
      )}
    </article>
  )
}

function Tabs({
  tab,
  onChange,
  counts,
}: {
  tab: string
  onChange: (t: "answer" | "sources" | "steps") => void
  counts: { sources: number; steps: number }
}) {
  const items = [
    { id: "answer", label: "Answer", count: undefined },
    { id: "sources", label: "Sources", count: counts.sources },
    { id: "steps", label: "Steps", count: counts.steps },
  ] as const

  return (
    <div role="tablist" className="flex items-center gap-0.5 border-b border-border">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={tab === it.id}
          onClick={() => onChange(it.id)}
          className={cn(
            "relative px-2.5 py-1.5 font-mono text-[11px] transition-colors outline-none",
            "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
            tab === it.id ? "text-kai-orange" : "text-kai-dim hover:text-kai-text"
          )}
        >
          {it.label}
          {it.count !== undefined && <span className="ml-1 text-kai-muted">{it.count}</span>}
          {tab === it.id && (
            <span className="absolute inset-x-1 -bottom-px h-px bg-kai-orange" aria-hidden />
          )}
        </button>
      ))}
    </div>
  )
}

/**
 * linkCitations turns bare [n] markers into `#cite:` links before the parse,
 * so a citation inside a list item, heading or bold run survives as a chip.
 * Code spans and fences keep their brackets literally, and a real markdown
 * link whose text is a number (`[3](url)`) is left alone.
 */
function linkCitations(text: string): string {
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1 ? part : part.replace(/\[(\d{1,3})\](?!\()/g, "[$1](#cite:$1)")
    )
    .join("")
}

/**
 * CitedText renders the answer body as real markdown — the model writes
 * headings, lists and emphasis, and they should read as such, not as raw
 * `##` noise — while swapping [n] markers for live chips. Markers whose
 * number has no source render inert — see SourceChip.
 */
export function CitedText({
  text,
  sources,
  onOpen,
}: {
  text: string
  sources: AnswerSource[]
  onOpen?: (s: AnswerSource) => void
}) {
  const byN = useMemo(() => new Map(sources.map((s) => [s.n, s])), [sources])

  const components = useMemo(
    () => ({
      a({ href, children: kids, ...props }: any) {
        const target = String(href ?? "")

        // Citation markers became #cite: links in linkCitations — swap them
        // back into chips here, inside whatever block the parser put them in.
        const cite = /^#cite:(\d{1,3})$/.exec(target)
        if (cite) {
          const n = Number(cite[1])
          return <SourceChip n={n} source={byN.get(n)} onOpen={onOpen} />
        }

        // External links open in the in-app browser tab.
        if (/^https?:\/\//i.test(target)) {
          return (
            <a
              href={target}
              onClick={(e) => {
                e.preventDefault()
                openInBrowser(target)
              }}
              {...props}
            >
              {kids}
            </a>
          )
        }

        // Anything else is model output we do not trust — inert text.
        return (
          <span className="text-kai-dim underline decoration-dotted" title={target}>
            {kids}
          </span>
        )
      },
      code({ className: cls, children: kids, ...props }: any) {
        const raw = String(kids).replace(/\n$/, "")
        const match = /language-(\w+)/.exec(cls || "")
        // Inline code has no language class and no newlines — let the
        // stylesheet handle it.
        if (!match && !raw.includes("\n")) {
          return (
            <code className={cls} {...props}>
              {kids}
            </code>
          )
        }
        return <CodeBlock code={raw} lang={match?.[1]} />
      },
      // react-markdown wraps fenced code in <pre>; CodeBlock brings its own.
      pre({ children: kids }: any) {
        return <>{kids}</>
      },
    }),
    [byN, onOpen]
  )

  // Memoise on the source so a streaming body re-parses, a re-render doesn't.
  const body = useMemo(() => linkCitations(text), [text])

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {body}
    </ReactMarkdown>
  )
}

/** FollowUps: contextual next questions, capped so they cannot bury the composer. */
export function FollowUps({
  items,
  onPick,
  visible = 3,
}: {
  items: string[]
  onPick?: (q: string) => void
  visible?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, visible)
  const hidden = items.length - shown.length

  return (
    <div className="border-t border-border px-3 py-2.5">
      <div className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-kai-dim uppercase">
        Follow up
      </div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick?.(q)}
            className="group flex items-center gap-1.5 rounded-[var(--radius)] border border-border
                       bg-card px-2.5 py-1 text-left font-sans text-[12px] text-kai-text
                       transition-colors hover:border-kai-orange/40 hover:bg-accent hover:text-kai-white
                       outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50"
          >
            {q}
            <CornerDownLeft
              size={11}
              className="shrink-0 text-kai-dim opacity-0 transition-opacity group-hover:opacity-100"
            />
          </button>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-[var(--radius)] px-2 py-1 font-mono text-[11px] text-kai-dim
                       transition-colors hover:text-kai-orange outline-none
                       focus-visible:ring-2 focus-visible:ring-kai-orange/50"
          >
            +{hidden} more
          </button>
        )}
      </div>
    </div>
  )
}

function Action({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Copy
  label: string
  onClick?: () => void
}) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.()
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
      className="flex items-center gap-1.5 rounded-[var(--radius)] px-2 py-1 font-mono text-[10.5px]
                 text-kai-dim transition-colors hover:bg-accent hover:text-kai-text
                 outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50"
    >
      {done ? <Check size={12} className="text-kai-green" /> : <Icon size={12} />}
      {label}
    </button>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="py-4 text-center font-mono text-[11px] text-kai-dim">{children}</p>
  )
}
