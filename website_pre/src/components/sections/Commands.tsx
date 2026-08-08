import { ArrowRight } from "lucide-react"
import Icon from "@/components/Icon"
import SectionHeading from "@/components/SectionHeading"
import LinkButton from "@/components/LinkButton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { COMMAND_GROUPS } from "@/data/content"

export default function Commands() {
  return (
    <section id="commands" className="relative border-t border-border py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          index="04"
          eyebrow="slash commands"
          title="Drive everything from inside"
          description="Type “/” in the TUI and the palette filters as you go — arrows move, tab completes, enter runs. Long operations stream progress live and never freeze the UI; ctrl+c cancels an in-flight run."
        />

        <Tabs defaultValue={COMMAND_GROUPS[0].id} className="mt-10">
          <TabsList className="h-auto flex-wrap gap-1 rounded-sm bg-kai-panel p-1">
            {COMMAND_GROUPS.map((g) => (
              <TabsTrigger
                key={g.id}
                value={g.id}
                className="gap-1.5 rounded-sm font-mono text-[12.5px] data-[selected]:text-kai-orange"
              >
                <Icon name={g.icon} className="size-3.5" />
                {g.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {COMMAND_GROUPS.map((g) => (
            <TabsContent key={g.id} value={g.id} className="mt-5">
              <p className="mb-4 font-sans text-sm text-muted-foreground">{g.blurb}</p>
              <div className="overflow-hidden rounded-sm border border-border">
                {g.commands.map((c) => (
                  <div
                    key={c.name}
                    className="group grid gap-1 border-b border-border bg-card px-4 py-3 transition-colors last:border-b-0 hover:bg-kai-panel sm:grid-cols-[16rem_1fr] sm:items-baseline sm:gap-5"
                  >
                    <div className="flex min-w-0 items-baseline gap-2 font-mono text-[13px]">
                      <span
                        className="text-kai-orange opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      >
                        ▎
                      </span>
                      <span className="font-semibold text-kai-blue">{c.name}</span>
                      {c.args ? <span className="truncate text-kai-dim">{c.args}</span> : null}
                    </div>
                    <p className="font-sans text-[13.5px] leading-relaxed text-muted-foreground">
                      {c.summary}
                    </p>
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <LinkButton to="/docs/commands" variant="outline" className="mt-6">

          Full command reference

          <ArrowRight data-icon="inline-end" />

        </LinkButton>
      </div>
    </section>
  )
}
