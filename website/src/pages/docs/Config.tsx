import CodeBlock from "@/components/CodeBlock"
import { C, Callout, DocPage, H2, LI, P, UL } from "@/components/docs/parts"
import { PROVIDERS } from "@/data/content"

const NOTES_YAML = `notes:
  - "Real-time features follow the dual-router pattern: REST APIRouter plus a
     sibling ws_router authenticating via short-lived JWT in the token query param."
  - "Every admin mutation must be audit-logged via the AuditLog model."`

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
        From inside the TUI, <C>/init</C> does the same and <C>/config</C> shows what is currently
        active.
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

      <H2 id="routing">Model Routing</H2>
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
          <C>/cost</C> shows what the current session has spent.
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
