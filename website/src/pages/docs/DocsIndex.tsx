import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import Icon from "@/components/Icon"
import { DOCS_NAV } from "@/data/docs-nav"

export default function DocsIndex() {
  return (
    <article className="min-w-0 pb-16">
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[11px] tracking-[0.25em] text-kai-dim uppercase">
          <span className="text-kai-orange">▎</span> docs
        </p>
        <h1 className="mt-3 font-sans text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
          Everything about <span className="serif">Kaioken.</span>
        </h1>
        <p className="mt-3 max-w-2xl font-sans text-[15px] leading-relaxed text-muted-foreground">
          Kaioken is a TypeScript monorepo with two faces — an agent that edits your repo behind diff
          approval, and an engine that documents it. Start with the install, then read whichever
          half you came for.
        </p>
      </header>

      {/* System Architecture Blueprint */}
      <section className="pt-8">
        <div className="flex items-center justify-between pb-3">
          <h2 className="font-mono text-[11px] tracking-[0.25em] text-kai-amber uppercase">
            system architecture blueprint
          </h2>
          <a
            href="/assets/kaioken-pipeline.svg"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-mono text-[11px] text-kai-orange hover:underline"
          >
            <span>Raw Vector</span>
            <ArrowRight className="size-3" />
          </a>
        </div>
        <div className="overflow-hidden rounded-sm border border-border bg-[#08080a] p-2 sm:p-4">
          <a
            href="/assets/kaioken-pipeline.svg"
            target="_blank"
            rel="noopener noreferrer"
            title="Click to view full-size vector architecture"
          >
            <img
              src="/assets/kaioken-pipeline.svg"
              alt="Kaioken Knowledge Engine Architecture: Ingestion, Grounding, Provenance, and Agent Seam"
              className="h-auto w-full border border-[#232327] transition-all hover:border-kai-orange/60"
              loading="lazy"
            />
          </a>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#232327] pt-2.5 font-mono text-[11px] text-kai-dim">
            <span>OFFLINE-FIRST AST PARSING &amp; ZERO-TOKEN PROVENANCE</span>
            <span className="text-kai-orange">7 TOOLS · 18 SLASH COMMANDS · 5 SURFACES</span>
          </div>
        </div>
      </section>

      {DOCS_NAV.map((section) => (
        <section key={section.heading} className="pt-10">
          <h2 className="font-mono text-[11px] tracking-[0.25em] text-kai-amber uppercase">
            {section.heading}
          </h2>
          <div className="mt-4 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2">
            {section.links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="group flex gap-3.5 bg-card p-5 transition-colors hover:bg-kai-panel"
              >
                <Icon name={link.icon} className="mt-0.5 size-4 shrink-0 text-kai-orange" />
                <div className="min-w-0">
                  <span className="flex items-center gap-1.5 font-mono text-[14px] font-bold text-foreground transition-colors group-hover:text-kai-orange">
                    {link.label}
                    <ArrowRight className="size-3 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </span>
                  <span className="mt-1 block font-sans text-[13.5px] leading-relaxed text-muted-foreground">
                    {link.blurb}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </article>
  )
}
