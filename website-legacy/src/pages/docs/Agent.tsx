import CodeBlock from "@/components/CodeBlock"
import TerminalWindow from "@/components/TerminalWindow"
import { C, Callout, DocPage, H2, H3, LI, P, UL } from "@/components/docs/parts"

const MODES = [
  {
    name: "build",
    tag: "default",
    body: "Full access. Every write, edit and command still shows a diff and waits for y/n unless /yolo is on.",
  },
  {
    name: "plan",
    body: "Read-only. The agent inspects and proposes, but changes nothing — for when you want a proposal to review before anything is touched.",
  },
  {
    name: "explore",
    body: "Read-only as well, for when you are only asking questions about the code.",
  },
  {
    name: "review",
    body: "Read-only code review mode for security audits, diff analysis, and architecture inspection.",
  },
  {
    name: "prism",
    body: "Precision knowledge retrieval mode — automatically retrieves and grounds answers in imported PRISM documents on every turn.",
  },
  {
    name: "general",
    body: "Every tool available, but a mandatory prompt on every change — even with /yolo on.",
  },
]

const TOOLS = [
  { name: "read_file", body: "open a file, or a line range of one" },
  { name: "list_files", body: "walk the tree inside the target repo" },
  { name: "search", body: "grep the repo for a pattern" },
  { name: "query_prism", body: "hybrid BM25 + semantic vector search with relevance gating over imported PRISM documents" },
  { name: "write_file", body: "create or replace a file — behind approval" },
  { name: "edit_file", body: "a unique-match replacement — behind approval" },
  { name: "run_command", body: "run a shell command in the repo — behind approval" },
  { name: "read_knowledge", body: "open any generated card, wiki chapter or skill" },
  { name: "todo", body: "keep a visible plan for a multi-step task" },
  { name: "task", body: "spawn a read-only sub-agent with its own context" },
  { name: "delegate", body: "hand a writable sub-task to an isolated git worktree" },
  { name: "remember / recall", body: "write a note about this repo, or find one from a past session" },
]

export default function Agent() {
  return (
    <DocPage
      title="Modes & memory"
      lead="The chat half of Kaioken: what the agent may do, how you steer it mid-run, how a wrong turn gets rewound, and what survives the session."
    >
      <H2 id="modes">Permission modes</H2>
      <P>
        <C>/mode</C> switches how much the agent is allowed to do. The switch is announced to the
        model mid-conversation, so it stops offering edits it can no longer make, and the mode is
        saved with the session — <C>/resume</C> restores it.
      </P>
      <div className="mt-4 overflow-hidden rounded-sm border border-border">
        {MODES.map((m) => (
          <div
            key={m.name}
            className="grid gap-1 border-b border-border bg-card px-4 py-3 last:border-b-0 sm:grid-cols-[9rem_1fr] sm:items-baseline sm:gap-4"
          >
            <div className="flex items-baseline gap-2 font-mono text-[13px]">
              <span className="font-semibold text-kai-blue">/mode {m.name}</span>
              {m.tag ? (
                <span className="rounded-sm bg-kai-green/12 px-1.5 py-px text-[10.5px] text-kai-green">
                  {m.tag}
                </span>
              ) : null}
            </div>
            <p className="font-sans text-[13.5px] leading-relaxed text-muted-foreground">{m.body}</p>
          </div>
        ))}
      </div>
      <Callout kind="warn" title="/yolo is exactly as risky as it sounds">
        It skips the prompt entirely for the rest of the session. <C>/undo</C> still works
        afterwards, and <C>/mode general</C> keeps the prompt mandatory even with yolo on.
      </Callout>

      <H2 id="tools">What the agent can reach</H2>
      <P>
        Every path is confined to the target repo — no <C>..</C> escapes — and a declined action
        never touches disk. Trusted extensions and connected MCP servers can add more tools; those
        go through the same approval prompt.
      </P>
      <div className="mt-4 overflow-hidden rounded-sm border border-border">
        {TOOLS.map((t) => (
          <div
            key={t.name}
            className="grid gap-1 border-b border-border bg-card px-4 py-2.5 last:border-b-0 sm:grid-cols-[12rem_1fr] sm:items-baseline sm:gap-4"
          >
            <span className="font-mono text-[13px] font-semibold text-kai-amber">{t.name}</span>
            <p className="font-sans text-[13.5px] leading-relaxed text-muted-foreground">{t.body}</p>
          </div>
        ))}
      </div>

      <H2 id="steering">Steering instead of cancelling</H2>
      <P>
        While the agent is working, anything you type is queued and joins the conversation after its
        current step — it reads your correction before deciding what to do next. So when you see it
        heading down the wrong path, just type the correction; there is no need to cancel and start
        over.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="tui"
          code={`/queue              # how many messages are waiting
/queue clear        # drop them before the agent reads them
/stop               # abandon the whole turn instead (esc, ctrl+c)`}
        />
      </div>
      <P>
        Text the model already streamed survives a <C>/stop</C> rather than being discarded.
      </P>

      <H2 id="branching">Rewinding a wrong turn</H2>
      <P>
        Re-explaining a failed approach poisons the context. <C>/fork</C> rewinds the active branch
        past the bad turns instead, and the next message you send grows a sibling branch. Nothing is
        deleted — the abandoned turns stay in the session tree.
      </P>
      <div className="pt-4">
        <TerminalWindow title="kaioken — /tree" bodyClassName="text-[12.5px]">
          <div className="text-kai-amber">★ 1  &ldquo;use a worker pool here&rdquo;         2m ago</div>
          <div className="text-kai-dim">  2  &ldquo;rewrite it with channels&rdquo;      18m ago</div>
          <div className="text-kai-dim">  3  &ldquo;first attempt, compacted&rdquo;      41m ago</div>
          <div className="mt-1 text-kai-dim">  /tree 2 switches · /tree 2 summarize also briefs the model</div>
        </TerminalWindow>
      </div>
      <P>
        Branches accumulate from every fork, retry and auto-compaction. <C>/tree</C> lists the tips
        with their newest prompt and age, and switching replays the transcript so you can see where
        that branch stands. The <C>summarize</C> variant costs one model call and carries the
        abandoned branch&apos;s lessons across.
      </P>

      <H2 id="context">Context that manages itself</H2>
      <P>
        When a turn would not fit, Kaioken reduces context on its own: first by dropping stale tool
        output — free, and the conversation is untouched — then by summarizing if that was not
        enough. <C>/compact</C> runs it by hand when you would rather choose the moment, such as
        before starting a long task.
      </P>
      <P>
        <C>/thinking off|low|medium|high</C> sets how many tokens a reasoning model may spend before
        it answers. It is a cost dial, not a quality switch: a rename needs none, an architecture
        question earns high. Applied where the endpoint supports it — OpenRouter, OpenAI and
        Anthropic — and left alone elsewhere rather than risking a rejected request.
      </P>

      <H2 id="memory">Memory</H2>
      <P>
        Sessions are saved per repo, but memory is the part that outlives them.
      </P>
      <UL>
        <LI>
          <C>remember</C> writes a durable note about this repo; <C>recall</C> finds one again — and
          finds the digest written beside each closed session, so past work is searchable without
          re-reading whole transcripts.
        </LI>
        <LI>
          <C>/learn</C> reviews the session and, if it taught something worth keeping, writes or
          patches a skill in <C>.kaioken/skills/</C> so the agent loads it before doing that task
          again. It also reinforces any skill the session consulted.
        </LI>
        <LI>
          Learning runs on its own at session end once <C>memory.learn</C> turns are in;{" "}
          <C>/learn</C> forces it now, and <C>memory.disable</C> turns the whole thing off.
        </LI>
      </UL>

      <H2 id="sessions">Sessions</H2>
      <div className="pt-4">
        <CodeBlock
          title="tui"
          code={`/sessions           # list them, newest first
/resume [id]        # reopen one (no id = searchable picker)
/switch [id]        # save this one, then open another
/import <path>      # bring an external transcript in as a session
/new                # start clean; the current session is saved
/handoff            # write a continuation briefing from a session`}
        />
      </div>

      <H2 id="templates">Prompt templates</H2>
      <P>
        A request you keep retyping belongs in a file the whole team shares. Templates live in{" "}
        <C>.kaioken/templates/&lt;name&gt;.md</C>; <C>{"{{placeholders}}"}</C> are filled from{" "}
        <C>key=value</C> arguments and leftover words land in <C>{"{{args}}"}</C>.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="tui"
          code={`/templates                                # list them and their placeholders
/t:review file=main.go error handling     # expand and send`}
        />
      </div>
      <P>
        A placeholder left unfilled stops the send and is named, so a half-filled prompt never
        reaches the model silently.
      </P>

      <H2 id="delegation">Sub-agents and worktrees</H2>
      <H3>Read-only sub-agents</H3>
      <P>
        The <C>task</C> tool spawns a sub-agent with its own context for work that would otherwise
        flood the main conversation — surveying a large area of the codebase, checking a hypothesis
        across many files. It returns a compressed answer, not a transcript.
      </P>
      <H3>Writable delegation</H3>
      <P>
        <C>delegate</C> hands a sub-task to an agent working in an isolated temporary git worktree.
        Untrusted draft edits cannot corrupt your working tree, and the changes land in the main
        repo only when you approve the combined diff.
      </P>

      <H2 id="learn-more">Learn it from inside</H2>
      <P>
        <C>/tutorial</C> is a guided walkthrough — pass a chapter to go deeper, or any command name
        to see just that one. <C>/explain &lt;command&gt;</C> prints a full reference page for one
        command, and <C>/explain all</C> prints the whole manual.
      </P>
    </DocPage>
  )
}
