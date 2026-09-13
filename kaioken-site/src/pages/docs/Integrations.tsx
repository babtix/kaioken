import CodeBlock from "@/components/CodeBlock"
import { C, Callout, DocPage, H2, H3, LI, P, UL } from "@/components/docs/parts"

const EXPORTS = [
  { name: "claude-md", out: "CLAUDE.md", body: "single context file for Claude Code — cards plus a wiki index" },
  { name: "agents-md", out: "AGENTS.md", body: "agent instruction file: cards plus the skills catalog" },
  { name: "cursor-rules", out: ".cursorrules", body: "Cursor rules file: conventions and architecture" },
  { name: "context-md", out: "CONTEXT.md", body: "universal context file, same content as claude-md" },
]

const MCP_TOOLS = [
  { name: "wiki_tree · wiki_read · wiki_search", body: "navigate, open and search the generated wiki" },
  { name: "skills_list · skills_get · skills_search", body: "find and load a task guide" },
  { name: "repo_scan · repo_status · repo_git", body: "inventory, per-module freshness, and git state" },
  { name: "review", body: "run the grounded diff review" },
  { name: "onboard", body: "assemble the day-one guide" },
  { name: "research_run", body: "run a research question — off unless -allow-research is passed" },
]

export default function Integrations() {
  return (
    <DocPage
      title="Integrations"
      lead="The knowledge is not trapped in Kaioken. Serve it over MCP, flatten it into another tool's context file, search it from a script, or drive the agent itself from a process."
    >
      <H2 id="mcp">MCP server</H2>
      <P>
        <C>kaioken mcp serve</C> exposes this repo&apos;s knowledge to any MCP client — Claude
        Desktop, Claude Code, Cursor. The client gets tools rather than a wall of pasted markdown,
        so it opens the chapter it needs instead of paying for all of them.
      </P>
      <div className="mt-4 overflow-hidden rounded-sm border border-border">
        {MCP_TOOLS.map((t) => (
          <div
            key={t.name}
            className="grid gap-1 border-b border-border bg-card px-4 py-2.5 last:border-b-0 sm:grid-cols-[17rem_1fr] sm:items-baseline sm:gap-4"
          >
            <span className="font-mono text-[12.5px] font-semibold text-kai-amber">{t.name}</span>
            <p className="font-sans text-[13.5px] leading-relaxed text-muted-foreground">{t.body}</p>
          </div>
        ))}
      </div>
      <div className="pt-4">
        <CodeBlock
          title="powershell"
          prompt
          code={`kaioken mcp manifest            # print the client config snippet
kaioken mcp serve               # stdio — what a desktop client launches
kaioken mcp serve -transport http -port 7788
kaioken mcp validate            # check the setup before wiring a client to it`}
        />
      </div>
      <Callout kind="note" title="stdio owns stdout">
        The protocol has stdout to itself, so logs go to stderr or to <C>-log-file</C>. The HTTP
        transport mints a bearer token per repo unless you explicitly opt out.
      </Callout>

      <H2 id="export">Export to another tool</H2>
      <P>
        Pure assembly from what generation already wrote: no model calls, no cost, deterministic
        output. <C>-full</C> inlines the wiki chapters instead of linking them, <C>-out</C> overrides
        the path, <C>-force</C> overwrites.
      </P>
      <div className="mt-4 overflow-hidden rounded-sm border border-border">
        {EXPORTS.map((e) => (
          <div
            key={e.name}
            className="grid gap-1 border-b border-border bg-card px-4 py-3 last:border-b-0 sm:grid-cols-[10rem_1fr] sm:items-baseline sm:gap-4"
          >
            <div className="flex min-w-0 flex-col">
              <span className="font-mono text-[13px] font-semibold text-kai-orange">{e.name}</span>
              <span className="font-mono text-[11.5px] text-kai-dim">→ {e.out}</span>
            </div>
            <p className="font-sans text-[13.5px] leading-relaxed text-muted-foreground">{e.body}</p>
          </div>
        ))}
      </div>
      <div className="pt-4">
        <CodeBlock title="powershell" prompt code={`kaioken export claude-md -full`} />
      </div>

      <H2 id="search">Index and search</H2>
      <P>
        <C>kaioken index</C> builds a search index over the generated wiki, cards and skills;{" "}
        <C>kaioken search</C> queries it from the terminal. The lexical half works offline and is
        rebuilt automatically when the corpus changes. Configure <C>search.embed_model</C> and{" "}
        <C>index</C> adds the semantic half on top — searching never calls an embedding endpoint, so
        a query stays fast and offline-safe.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="powershell"
          prompt
          code={`kaioken index                   # -force rebuilds from scratch
kaioken search "how does the retry budget work"`}
        />
      </div>

      <H2 id="extensions">Extensions</H2>
      <P>
        Extensions install from GitHub releases into <C>~/.kaioken/extensions</C>, pinned in a
        lockfile by version and archive hash. They are per-user, so one install serves every
        repository.
      </P>
      <UL>
        <LI>
          <strong className="font-semibold text-foreground">declarative</strong> — contributes
          skills, never runs code.
        </LI>
        <LI>
          <strong className="font-semibold text-foreground">mcp</strong> — declares a server process.
          Trusting it shows the exact <em>unsandboxed</em> command it would run.
        </LI>
        <LI>
          <strong className="font-semibold text-foreground">wasm</strong> — ships a sandboxed plugin
          module whose tools the agent may call. Trusting it shows the permissions it asked for
          (<C>fs:read:workspace</C> mounts your repo read-only; there is no network).
        </LI>
      </UL>
      <P>
        An mcp or wasm extension stays inert until <C>/ext trust &lt;id&gt;</C>, both require an
        explicit yes, and updating an extension revokes its trust until you re-grant it. Every tool
        call still goes through the normal approval prompt.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="tui"
          code={`/ext browse                       # the community registry, enter installs
/ext install alice/kaioken-git-flow@1.2.0
/ext trust alice.git-flow         # review what it would run, then grant
/ext update                       # nothing updates silently
/x git-flow status                # run a command a wasm extension contributed`}
        />
      </div>
      <P>
        Authors: <C>kaioken ext dev &lt;path&gt;</C> installs a working tree for a fast dev loop and{" "}
        <C>kaioken ext validate</C> lints it before publishing.
      </P>

      <H2 id="headless">Headless and embedded</H2>
      <H3>One prompt, one exit</H3>
      <div className="pt-4">
        <CodeBlock
          title="powershell"
          prompt
          code={`kaioken run -p "add a health endpoint" -approve edits
kaioken run -p "summarise the auth flow" -mode plan -json`}
        />
      </div>
      <P>
        <C>-mode</C> picks the permission preset (default <C>build</C>), <C>-approve</C> sets the
        policy for state-changing actions — <C>never</C> (default), <C>edits</C>, or <C>all</C> — and{" "}
        <C>-json</C> emits typed events as JSON lines for a CI job to parse.
      </P>

      <H3>JSON-RPC over stdio</H3>
      <P>
        <C>kaioken rpc</C> drives the agent over JSON-RPC 2.0 for editors, scripts and other
        processes embedding it: <C>agent.prompt</C>, <C>agent.steer</C>, <C>agent.approve</C>,{" "}
        <C>agent.cancel</C>, <C>agent.state</C>, plus <C>session.new</C> and <C>session.resume</C>.
        Events arrive as notifications.
      </P>

      <H3>Desktop</H3>
      <P>
        <C>kaioken daemon</C> serves the engine over a loopback HTTP API — the same binary and the
        same <C>.kaioken/</C> the CLI uses. It is what Kaioken Desktop talks to, with a bearer token
        and an ephemeral port by default.
      </P>

      <H2 id="portable">Taking it elsewhere</H2>
      <UL>
        <LI>
          <C>kaioken publish</C> renders the wiki as a static site anyone can browse — no server, no
          Kaioken needed.
        </LI>
        <LI>
          <C>kaioken pack</C> bundles the generated knowledge into one portable{" "}
          <C>.tar.gz</C> for an offline or air-gapped machine; <C>-extract</C> unpacks one.
        </LI>
        <LI>
          <C>kaioken onboard</C> writes <C>ONBOARDING.md</C>, a day-one guide assembled from the
          wiki, cards, skills and scan.
        </LI>
        <LI>
          <C>kaioken hub</C> keeps a cross-repo registry at <C>~/.kaioken/hub.yaml</C> so freshness
          is one command across a whole portfolio.
        </LI>
      </UL>

      <H2 id="upgrade">Keeping the binary current</H2>
      <div className="pt-4">
        <CodeBlock
          title="powershell"
          prompt
          code={`kaioken upgrade check     # is there a newer release?
kaioken upgrade           # update from the latest GitHub release`}
        />
      </div>
      <P>
        The check runs in the background on interactive launches and prints a notice from a later
        command, so it never corrupts the TUI mid-frame. <C>selfupdate</C> in{" "}
        <C>~/.kaioken/config.yaml</C> controls the channel, the interval, and whether it only
        notifies.
      </P>
    </DocPage>
  )
}
