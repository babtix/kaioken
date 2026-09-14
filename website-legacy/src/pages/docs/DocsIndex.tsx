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
        <h1 className="mt-3 font-mono text-3xl font-bold tracking-tight text-foreground">
          Documentation
        </h1>
        <p className="mt-3 max-w-2xl font-sans text-[15px] leading-relaxed text-muted-foreground">
          Kaioken is one Go binary with two faces — an agent that edits your repo behind diff
          approval, and an engine that documents it. Start with the install, then read whichever
          half you came for.
        </p>
      </header>

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
