import CodeBlock from "@/components/CodeBlock"
import { C, Callout, DocPage, H2, LI, P, UL } from "@/components/docs/parts"
import { PROVIDERS } from "@/data/content"

const NOTES_YAML = `notes:
  - "Real-time features follow the dual-router pattern: REST APIRouter plus a
     sibling ws_router authenticating via short-lived JWT in the token query param."
  - "Every admin mutation must be audit-logged via the AuditLog model."`

const BLOCKS_YAML = `budget:
  warn_at: 5.00          # USD — warn past this
  hard_stop: 20.00       # USD — refuse to continue

memory:
  learn: 5               # turns before a session distils itself into a skill
  max_skills: 40

search:
  embed_model: openai/text-embedding-3-small
  embed_provider: openai

compaction:
  reserve_tokens: 8000
  keep_recent_tokens: 24000`

const GLOBAL_YAML = `default_provider: openrouter
default_model: anthropic/claude-sonnet-4.5

keys:
  openrouter: sk-or-...
  tavily: tvly-...        # web search, for research

research:
  search_provider: tavily
  max_rounds: 4
  max_minutes: 20
  mode: auto              # auto | fast | deep
  verify: false
  max_cost_usd: 3.00

selfupdate:
  enabled: true
  channel: stable
  notify_only: false`

export default function Config() {
  return (
    <DocPage
      title="Configuration"
      lead="One YAML file per repo, at .kaioken/config.yaml. It holds the model, the scope excludes, and the steering notes injected into every prompt."
    >
      <H2 id="create">Creating it</H2>
      <div className="pt-4">
        <CodeBlock title="powershell" prompt code={`kaioken init`} />
      </div>
      <P>
        <C>init</C> is the whole first run, not just a file: it writes <C>.kaioken/config.yaml</C>,
        scans the repo, and writes <C>AGENTS.md</C> — the instruction file agents read before
        editing. <C>-force</C> rewrites an existing <C>AGENTS.md</C>. From inside the TUI,{" "}
        <C>/init</C> does the same and <C>/config</C> shows what is currently active.
      </P>

      <H2 id="providers">Providers</H2>
      <P>
        Kaioken is provider-agnostic over any OpenAI-compatible endpoint, plus Anthropic's own
        Messages API directly (its own auth header, not a compatibility shim). Switch at runtime
        and the model list refetches from whichever provider is active.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="tui"
          code={`/provider anthropic
/models claude          # filter the live catalog
/model claude-opus-4
/key                    # hidden prompt, in-memory only`}
        />
      </div>
      <p className="pt-4 font-mono text-[12.5px] text-kai-dim">{PROVIDERS.join("  ·  ")}</p>
      <Callout kind="warn" title="Free tiers">
        A model id ending in <C>:free</C> caps parallelism at 2, because those tiers rate-limit hard
        and four parallel calls mostly buys 429s.
      </Callout>

      <H2 id="notes">The steering-notes channel</H2>
      <P>
        The most valuable idea borrowed from Qoder&apos;s <C>wiki_plan.yaml</C>: <C>notes</C> in{" "}
        <C>config.yaml</C> are <strong>authoritative instructions injected into every prompt</strong>{" "}
        — use them for tribal knowledge the code does not state.
      </P>
      <div className="pt-4">
        <CodeBlock title="config.yaml" code={NOTES_YAML} />
      </div>
      <P>
        Edit them from the TUI with <C>/notes add &lt;text&gt;</C>, review with <C>/notes</C>, and
        wipe with <C>/notes clear</C>.
      </P>

      <H2 id="routing">Model routing</H2>
      <P>
        Map specific operational roles onto different models in <C>config.yaml</C>. Supported roles are{" "}
        <C>plan</C>, <C>edit</C>, <C>task</C>, <C>compact</C>, <C>impact</C>, and <C>summarize</C>. If a role is unset, it falls back to the primary <C>model</C>.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="config.yaml"
          code={`models:
  plan: anthropic/claude-3-5-sonnet
  edit: anthropic/claude-3-5-sonnet
  compact: google/gemini-2.0-flash-001
  task: anthropic/claude-3-5-sonnet`}
        />
      </div>

      <H2 id="budget">Budgets, memory and search</H2>
      <P>
        Three optional blocks turn behaviour that is otherwise implicit into something you set. All
        of them live in the same per-repo <C>config.yaml</C>.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="config.yaml"
          code={BLOCKS_YAML}
        />
      </div>
      <UL>
        <LI>
          <C>budget</C> — <C>warn_at</C> prints a warning past that spend, <C>hard_stop</C> refuses
          to continue. On OpenRouter the real USD figure is available, so this is a guardrail rather
          than an estimate.
        </LI>
        <LI>
          <C>memory</C> — <C>learn</C> is how many turns a session needs before it distils itself
          into a skill at close; <C>disable</C> turns the whole mechanism off, and{" "}
          <C>max_skills</C> caps how many it may keep.
        </LI>
        <LI>
          <C>search</C> — set <C>embed_model</C> (with its own provider and base URL when it differs)
          and <C>kaioken index</C> adds a semantic half to the lexical index. Leave it out and search
          stays purely offline.
        </LI>
        <LI>
          <C>compaction</C> — <C>reserve_tokens</C> and <C>keep_recent_tokens</C> tune when context
          reduction kicks in and how much recent conversation it protects.
        </LI>
      </UL>

      <H2 id="global">The global file</H2>
      <P>
        Machine-wide settings live in <C>~/.kaioken/config.yaml</C>, separate from any repo: the
        default provider and model, the per-provider API keys, self-update behaviour, extra local
        endpoints, and the research defaults.
      </P>
      <div className="pt-4">
        <CodeBlock title="~/.kaioken/config.yaml" code={GLOBAL_YAML} />
      </div>
      <Callout kind="note" title="Research needs a search key">
        The web-search key is separate from the LLM key. <C>tavily</C>, <C>firecrawl</C>,{" "}
        <C>brave</C> and <C>exa</C> are supported; with Firecrawl in the set its scrape API reads
        the pages too.
      </Callout>

      <H2 id="editable">Files meant to be edited</H2>
      <UL>
        <LI>
          <C>config.yaml</C> — model, scope excludes, steering notes.
        </LI>
        <LI>
          <C>modules.yaml</C> — the proposed module tree. Boundaries are yours to own.
        </LI>
        <LI>
          <C>wiki_plan.yaml</C> — the proposed wiki outline.
        </LI>
        <LI>
          <C>architecture.md</C> — the shared brief and glossary injected into every chapter. Edit
          it and every chapter inherits the correction on the next run.
        </LI>
      </UL>

      <H2 id="cost">Cost controls</H2>
      <UL>
        <LI>A wiki run prints its estimated calls and tokens before starting.</LI>
        <LI>Past a threshold it asks for confirmation.</LI>
        <LI>
          <C>/cost</C> shows what the current session has spent; <C>kaioken usage</C> aggregates it
          across sessions by operation, model and workspace.
        </LI>
        <LI>
          <C>/compact</C> summarizes the conversation to reclaim context rather than paying for it
          repeatedly.
        </LI>
        <LI>Low temperature (0.2) throughout — output should be factual, not creative.</LI>
      </UL>

      <H2 id="sessions">Sessions</H2>
      <P>
        Conversations are saved per repo under <C>.kaioken/sessions/</C>. <C>/sessions</C> lists
        them, <C>/resume &lt;id&gt;</C> reopens one, and <C>/new</C> starts fresh while saving the
        current one.
      </P>
    </DocPage>
  )
}
