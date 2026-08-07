import { ArrowRight } from "lucide-react"
import Icon from "@/components/Icon"
import {
  Action,
  Eyebrow,
  Lead,
  ListRow,
  RowGroup,
  Section,
} from "@/mobile/components/primitives"
import { DOCS_NAV, DOC_ORDER } from "@/data/docs-nav"

export default function DocsIndex() {
  return (
    <>
      <header className="px-4 pt-6">
        <Eyebrow>documentation</Eyebrow>
        <h1 className="mt-3 font-mono text-[26px] leading-[1.2] font-bold tracking-tight text-foreground">
          Docs
        </h1>
        <Lead className="mt-3">
          {DOC_ORDER.length} pages: how to install it, how the TUI behaves, what the engine
          generates, and every knob in <code className="font-mono text-kai-amber">config.yaml</code>.
        </Lead>
        <Action to="/docs/install" className="mt-5">
          Start with Install
          <ArrowRight className="size-4" aria-hidden />
        </Action>
      </header>

      {DOCS_NAV.map((section, i) => (
        <Section key={section.heading} first={i === 0} className="pt-8">
          <Eyebrow index={String(i + 1).padStart(2, "0")}>{section.heading}</Eyebrow>
          <RowGroup className="mt-3.5">
            {section.links.map((link) => (
              <ListRow
                key={link.to}
                to={link.to}
                title={link.label}
                subtitle={link.blurb}
                glyph={
                  <span className="flex size-8 items-center justify-center rounded-sm border border-kai-orange/25 bg-kai-orange/10">
                    <Icon name={link.icon} className="size-4 text-kai-orange" aria-hidden />
                  </span>
                }
              />
            ))}
          </RowGroup>
        </Section>
      ))}
    </>
  )
}
