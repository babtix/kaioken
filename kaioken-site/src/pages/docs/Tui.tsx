import { Link } from "react-router-dom"
import CodeBlock from "@/components/CodeBlock"
import TerminalWindow from "@/components/TerminalWindow"
import { C, Callout, DocPage, H2, H3, LI, P, UL } from "@/components/docs/parts"

export default function Tui() {
  return (
    <DocPage
      title="The TUI"
      lead="An in-terminal app in the spirit of Claude Code and OpenCode, built on Bubble Tea. Chat and the knowledge engine share one window."
    >
      <H2 id="chat">Chat</H2>
      <P>
        Just type. Replies stream token by token and render as markdown — headings, tables, and
        syntax-highlighted code. The composer is multi-line: <C>alt+enter</C> (or <C>ctrl+j</C>)
        inserts a newline, so pasting a stack trace works.
      </P>
      <P>
        Pick your model interactively with <C>/model</C>, fetched live from the provider.
        Conversations are saved per repo and reopened with <C>/resume</C>.
      </P>

      <H2 id="tools">What the agent can do</H2>
      <P>
        The core tools are all confined to the target repo: <C>read_file</C>, <C>list_files</C>,{" "}
        <C>search</C>, <C>write_file</C>, <C>edit_file</C> and <C>run_command</C>. On top of those it
        keeps a visible <C>todo</C> plan for multi-step work, spawns read-only sub-agents with{" "}
        <C>task</C>, hands writable sub-tasks to an isolated git worktree with <C>delegate</C>, and{" "}
        <C>remember</C>/<C>recall</C> carry notes across sessions. It is also knowledge-aware — when a
        repo has generated docs, the system prompt advertises them and <C>read_knowledge</C> opens
        any card, chapter or skill on demand.
      </P>
      <Callout kind="note" title="Knowledge feeds the agent">
        The engine you ran actually feeds the assistant, instead of it re-reading source every
        time. Skills lead the knowledge catalog, and the agent is instructed to open a matching one
        before starting a task.
      </Callout>

      <H2 id="modes">How much it may do</H2>
      <P>
        <C>/mode</C> sets the permission mode: <C>build</C> is full access, <C>plan</C> and{" "}
        <C>explore</C> are read-only, and <C>general</C> keeps every tool but prompts on every change
        — even with <C>/yolo</C> on. The switch is announced to the model mid-conversation, and it
        travels with the session. See{" "}
        <Link
          to="/docs/agent"
          className="font-mono text-kai-orange underline decoration-kai-orange/40 underline-offset-4 transition-colors hover:text-kai-amber"
        >
          Modes &amp; memory
        </Link>{" "}
        for the rest — steering, branching, and what survives the session.
      </P>

      <H2 id="approval">Diff approval</H2>
      <P>
        When the model wants to change a file it proposes a diff. Nothing touches disk until you
        answer.
      </P>
      <div className="pt-4">
        <TerminalWindow title="kaioken — approval" bodyClassName="text-[12.5px]">
          <div className="text-kai-tan">● proposed edit: internal/api/handler.go</div>
          <div className="text-kai-rose">- {"\t"}return nil</div>
          <div className="text-kai-green">
            + {"\t"}return fmt.Errorf(&quot;validate: %w&quot;, err)
          </div>
          <div className="mt-2 font-semibold text-kai-amber">
            apply edit → internal/api/handler.go ?   [y] yes   [n] no
          </div>
        </TerminalWindow>
      </div>

      <H3>Safety guarantees</H3>
      <UL>
        <LI>
          All file paths are confined to the target repo — no <C>..</C> escapes.
        </LI>
        <LI>A declined action never touches disk.</LI>
        <LI>
          <C>edit_file</C> refuses non-unique matches rather than guessing which one you meant.
        </LI>
        <LI>
          <C>/yolo</C> auto-approves for the session, when you have decided you trust the run.
        </LI>
      </UL>

      <H2 id="palette">The command palette</H2>
      <P>
        Typing <C>/</C> opens a filtered list above the composer. Arrows move through it, tab
        completes, enter runs the highlighted command. It only appears while the command{" "}
        <em>name</em> is being typed — once there is a space you are writing arguments, and the
        menu gets out of the way.
      </P>
      <div className="pt-4">
        <TerminalWindow title="kaioken — palette" bodyClassName="text-[12.5px]">
          <div className="text-kai-blue"> /wiki <span className="text-kai-dim">[xN] [force]</span></div>
          <div className="bg-kai-line/60">
            <span className="text-kai-orange">▎</span>
            <span className="font-bold text-kai-amber">/skills</span>
            <span className="text-kai-dim"> [force|name]</span>
            <span className="ml-6 text-foreground">build task guides an AI loads here</span>
          </div>
          <div className="text-kai-blue"> /update <span className="text-kai-dim">[&lt;base-rev&gt;]</span></div>
          <div className="mt-1 text-kai-dim">  ↑↓ move · tab complete · enter run · esc close</div>
        </TerminalWindow>
      </div>

      <H2 id="long-runs">Long operations</H2>
      <P>
        Wiki, research and card runs stream progress live and never freeze the UI. <C>/stop</C> —
        or esc, or <C>ctrl+c</C> — cancels an in-flight run without exiting the app, and text the
        model already streamed is kept. Anything you type <em>while</em> it works is queued as
        steering rather than lost, so a wrong turn is a correction, not a restart.{" "}
        <C>/serve</C> starts the wiki browser in the background so chat stays usable, and{" "}
        <C>/serve stop</C> ends it.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="tui"
          code={`/wiki x3            # deep wiki at the default depth
/wiki retry         # only the sections that failed last run
/research x3 …      # the open web, routed to the fast or the deep path
/impact …           # what a change would touch, before you make it
/serve 8080         # browse the result, background
/cost               # what this session has spent`}
        />
      </div>

      <Callout kind="warn" title="Streaming is not retried mid-flight">
        Once tokens have been shown, a failed stream surfaces as an error rather than replaying and
        duplicating output.
      </Callout>

      <H2 id="manual">The manual is in the app</H2>
      <P>
        <C>/tutorial</C> is a guided walkthrough — no argument gives an overview and a first-run
        sequence, a chapter name goes deeper, and a command name shows just that one.{" "}
        <C>/explain &lt;command&gt;</C> prints a single command&apos;s full reference page, and{" "}
        <C>/explain all</C> prints the lot. <C>/theme</C> switches between the dark, light and
        high-contrast palettes.
      </P>
    </DocPage>
  )
}
