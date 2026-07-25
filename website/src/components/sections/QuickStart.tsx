import { ArrowRight } from "lucide-react"
import GithubMark from "@/components/GithubMark"
import CodeBlock from "@/components/CodeBlock"
import SectionHeading from "@/components/SectionHeading"
import LinkButton from "@/components/LinkButton"
import { GITHUB_URL, QUICK_START } from "@/data/content"

const REQUIREMENTS = [
  { label: "Go", value: "≥ 1.24" },
  { label: "an API key", value: "OpenRouter, OpenAI, Groq, …" },
  { label: "a git repo", value: "for incremental updates" },
]

export default function QuickStart() {
  return (
    <section id="quick-start" className="relative border-t border-border py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.25fr] lg:gap-14">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <SectionHeading
              index="07"
              eyebrow="quick start"
              title="Running in one build"
              description="One Go build, one environment variable, and you are in the TUI. Bare kaioken launches it; every subcommand exists too, for CI."
            />

            <dl className="mt-8 space-y-3">
              {REQUIREMENTS.map((r) => (
                <div key={r.label} className="flex items-baseline gap-3 font-mono text-[12.5px]">
                  <dt className="w-28 shrink-0 text-kai-amber">{r.label}</dt>
                  <dd className="text-muted-foreground">{r.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton to="/docs/install">
                Install guide
                <ArrowRight data-icon="inline-end" />
              </LinkButton>
              <LinkButton href={GITHUB_URL} variant="outline">
                <GithubMark data-icon="inline-start" />
                Source
              </LinkButton>
            </div>
          </div>

          <div className="space-y-4">
            <CodeBlock title="powershell" code={QUICK_START} />
            <p className="font-mono text-[11.5px] leading-relaxed text-kai-dim">
              <span className="text-kai-green">✓</span> a model id ending in{" "}
              <span className="text-kai-green">:free</span> caps parallelism at 2 — those tiers
              rate-limit hard, and four parallel calls mostly buys 429s
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
