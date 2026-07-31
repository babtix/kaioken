import * as React from "react"
import { Link, Navigate, useParams } from "react-router-dom"
import { ArrowLeft, ArrowRight } from "lucide-react"
import Icon from "@/components/Icon"
import { Eyebrow, Lead } from "@/mobile/components/primitives"
import { useScreenTitle } from "@/mobile/lib/chrome"
import { DOC_ORDER } from "@/data/docs-nav"
import { DocChromeContext } from "@/lib/doc-chrome"

/**
 * Documentation prose lives in one place — src/pages/docs — and both sites read
 * it from there. What differs is the frame: this screen supplies the header,
 * the back button (in the top bar) and prev/next, and switches off the chrome
 * the desktop layout brings, via DocChromeContext.
 */
const CONTENT: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  install: React.lazy(() => import("@/pages/docs/Install")),
  tui: React.lazy(() => import("@/pages/docs/Tui")),
  commands: React.lazy(() => import("@/pages/docs/CommandsDoc")),
  wiki: React.lazy(() => import("@/pages/docs/Wiki")),
  cards: React.lazy(() => import("@/pages/docs/Cards")),
  skills: React.lazy(() => import("@/pages/docs/Skills")),
  update: React.lazy(() => import("@/pages/docs/Update")),
  config: React.lazy(() => import("@/pages/docs/Config")),
  output: React.lazy(() => import("@/pages/docs/OutputDoc")),
}

const BARE = { bare: true }

export default function DocScreen() {
  const { slug = "" } = useParams()
  const index = DOC_ORDER.findIndex((d) => d.to === `/docs/${slug}`)
  const doc = index >= 0 ? DOC_ORDER[index] : undefined
  const Body = CONTENT[slug]

  useScreenTitle(doc?.label ?? null)

  if (!doc || !Body) return <Navigate to="/docs" replace />

  const prev = index > 0 ? DOC_ORDER[index - 1] : undefined
  const next = index < DOC_ORDER.length - 1 ? DOC_ORDER[index + 1] : undefined

  return (
    <>
      <article className="px-4 pt-5 pb-4">
        <header className="border-b border-border pb-5">
          <Eyebrow>
            docs · {index + 1}/{DOC_ORDER.length}
          </Eyebrow>
          <h1 className="mt-3 flex items-start gap-2.5 font-mono text-[25px] leading-[1.2] font-bold tracking-tight text-foreground">
            <Icon name={doc.icon} className="mt-1 size-5 shrink-0 text-kai-orange" aria-hidden />
            {doc.label}
          </h1>
          <Lead className="mt-3">{doc.blurb}</Lead>
        </header>

        <div className="pt-1">
          <DocChromeContext.Provider value={BARE}>
            <React.Suspense
              fallback={
                <p className="pt-8 font-mono text-[12.5px] text-kai-dim">
                  <span className="animate-caret text-kai-orange">▎</span> loading…
                </p>
              }
            >
              <Body />
            </React.Suspense>
          </DocChromeContext.Provider>
        </div>

        <nav className="mt-10 space-y-2.5 border-t border-border pt-6">
          {prev ? (
            <Link
              to={prev.to}
              className="m-press flex min-h-[60px] items-center gap-3 rounded-md border border-border bg-card px-4 py-3"
            >
              <ArrowLeft className="size-4 shrink-0 text-kai-dim" aria-hidden />
              <span className="min-w-0">
                <span className="block font-mono text-[10px] tracking-[0.15em] text-kai-dim uppercase">
                  previous
                </span>
                <span className="mt-0.5 block font-mono text-[13.5px] font-bold text-foreground">
                  {prev.label}
                </span>
              </span>
            </Link>
          ) : null}
          {next ? (
            <Link
              to={next.to}
              className="m-press flex min-h-[60px] items-center gap-3 rounded-md border border-kai-orange/35 bg-kai-orange/[0.07] px-4 py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] tracking-[0.15em] text-kai-dim uppercase">
                  next
                </span>
                <span className="mt-0.5 block font-mono text-[13.5px] font-bold text-kai-orange">
                  {next.label}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-kai-orange" aria-hidden />
            </Link>
          ) : null}
          <Link
            to="/docs"
            className="m-press flex min-h-[48px] items-center justify-center rounded-md border border-border px-4 font-mono text-[12.5px] text-muted-foreground"
          >
            all documentation
          </Link>
        </nav>
      </article>
    </>
  )
}
