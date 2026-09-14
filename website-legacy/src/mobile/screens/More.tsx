import type { ReactNode } from "react"
import { Compass, ExternalLink, Monitor, Newspaper, Rocket, Terminal } from "lucide-react"
import AsciiArt from "@/components/AsciiArt"
import GithubMark from "@/components/GithubMark"
import FitText from "@/mobile/components/FitText"
import {
  Eyebrow,
  Lead,
  ListRow,
  RowGroup,
  Section,
  SectionHead,
} from "@/mobile/components/primitives"
import { setLayoutOverride } from "@/lib/viewport"
import {
  BUILDER_ART,
  BUILDER_NAME,
  GITHUB_URL,
  NEWS_URL,
  PORTFOLIO_URL,
  PROVIDERS,
} from "@/data/content"

const CONTACTS = [
  { label: "Portfolio", value: "babtich.vercel.app", href: PORTFOLIO_URL },
  { label: "GitHub", value: "github.com/babtix", href: "https://github.com/babtix" },
  { label: "Email", value: "babtichelhabib@gmail.com", href: "mailto:babtichelhabib@gmail.com" },
  {
    label: "LinkedIn",
    value: "Babtich El Habib",
    href: "https://eh.linkedin.com/in/babtich-el-habib-890a47362",
  },
  { label: "Instagram", value: "@pap1tx0", href: "https://www.instagram.com/pap1tx0/" },
]

export default function More() {
  return (
    <>
      <header className="px-4 pt-6">
        <Eyebrow>more</Eyebrow>
        <h1 className="mt-3 font-mono text-[26px] leading-[1.2] font-bold tracking-tight text-foreground">
          Everything else
        </h1>
      </header>

      <Section first className="pt-6">
        <RowGroup>
          <ListRow
            to="/showcase"
            title="Showcase"
            subtitle="The wiki Kaioken wrote about itself, and what the run cost."
            glyph={<Glyph icon={<Compass className="size-4" />} />}
          />
          <ListRow
            to="/next"
            title="Roadmap"
            subtitle="Agents, search, GUI shell, integrations — what comes next."
            glyph={<Glyph icon={<Rocket className="size-4" />} />}
          />
          <ListRow
            to="/desktop"
            title="Desktop app"
            subtitle="Twelve surfaces over the same .kaioken/ folder."
            glyph={<Glyph icon={<Monitor className="size-4" />} />}
          />
          <ListRow
            href={NEWS_URL}
            title="News"
            subtitle="kaioken-news.vercel.app"
            glyph={<Glyph icon={<Newspaper className="size-4" />} />}
            meta={<ExternalLink className="size-3.5 text-kai-dim" aria-hidden />}
            plain
          />
          <ListRow
            href={GITHUB_URL}
            title="Source"
            subtitle="github.com/babtix/kaioken"
            glyph={<Glyph icon={<GithubMark className="size-4" />} />}
            meta={<ExternalLink className="size-3.5 text-kai-dim" aria-hidden />}
            plain
          />
        </RowGroup>
      </Section>

      <Section className="pt-8">
        <SectionHead index="01" eyebrow="what this is" title="kaioken" />
        <Lead className="mt-3">
          A single Go binary with two faces: a chat agent that edits your repo behind diff approval,
          and a knowledge engine that documents it — deep wikis, knowledge cards and skills, all as
          plain files in <code className="font-mono text-kai-amber">.kaioken/</code>.
        </Lead>
        <p className="mt-4 font-mono text-[10.5px] leading-[1.9] text-kai-dim">
          {PROVIDERS.join(" · ")}
        </p>
      </Section>

      <Section className="pt-8">
        <SectionHead index="02" eyebrow="built by" title={BUILDER_NAME} />

        <div className="mt-5 overflow-hidden rounded-md border border-border bg-card px-3 py-4">
          <FitText>
            <AsciiArt art={BUILDER_ART} label={BUILDER_NAME} className="text-[6px] leading-[1.3]" />
          </FitText>
        </div>

        <RowGroup className="mt-4">
          {CONTACTS.map((c) => (
            <ListRow
              key={c.label}
              href={c.href}
              title={c.label}
              subtitle={<span className="font-mono break-all">{c.value}</span>}
              meta={<ExternalLink className="size-3.5 text-kai-dim" aria-hidden />}
              plain
            />
          ))}
        </RowGroup>
      </Section>

      <Section className="pt-8">
        <SectionHead
          index="03"
          eyebrow="layout"
          title="You are on the phone site"
          lead="This site is built for phones — separate screens, a tab bar, no wide tables. The desktop layout is still here if you want the full-width version on this device."
        />
        <button
          type="button"
          onClick={() => setLayoutOverride("desktop")}
          className="m-press mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md border border-border bg-card font-mono text-[13px] text-foreground"
        >
          <Monitor className="size-4 text-kai-orange" aria-hidden />
          Switch to the desktop layout
        </button>
        <p className="mt-2.5 font-mono text-[11px] leading-relaxed text-kai-dim">
          Remembered on this device. The desktop site&apos;s footer carries the switch back.
        </p>
      </Section>

      <footer className="border-t border-border px-4 py-8 text-center">
        <p className="font-mono text-[11px] text-kai-dim">
          <span className="text-kai-green">$</span> built for terminals · MIT
        </p>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] text-kai-dim"
        >
          <Terminal className="size-3.5 text-kai-orange" aria-hidden />
          github.com/babtix/kaioken
        </a>
      </footer>
    </>
  )
}

function Glyph({ icon }: { icon: ReactNode }) {
  return (
    <span className="flex size-8 items-center justify-center rounded-sm border border-kai-orange/25 bg-kai-orange/10 text-kai-orange">
      {icon}
    </span>
  )
}
