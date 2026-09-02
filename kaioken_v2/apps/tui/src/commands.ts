/**
 * The slash-command registry.
 *
 * A direct port of the v1 Go TUI's `commands.go`: same commands, same aliases,
 * same argument hints, same summaries, and the same prose behind `/tutorial`
 * and `/explain`. Ported rather than paraphrased — the text is the product's
 * documentation, and re-writing it from memory is how two surfaces end up
 * describing the same command differently.
 *
 * `dispatch` still owns execution; this only describes the commands so they
 * can be listed, filtered and completed. A test asserts every entry here is
 * actually accepted by dispatch, so the two cannot drift apart silently.
 *
 * Ordered by how often each is reached for, most used first, so `/help` and
 * the `/` completion list put the everyday commands up top and the
 * rarely-touched admin ones at the bottom.
 */

/** One worked invocation, shown by `/tutorial`. */
export interface CommandExample {
	/** The literal thing to type. */
	cmd: string;
	/** What it does. */
	what: string;
}

export interface Command {
	name: string;
	aliases?: string[];
	/** Argument hint shown beside the name. */
	args?: string;
	/** One line, shown in the palette and `/help`. */
	summary: string;
	/**
	 * The paragraph `/tutorial` adds when the summary is not enough: why the
	 * command exists, or what is surprising about it.
	 */
	detail?: string;
	/** Extended usage guidance for `/explain`: workflow, tips, pitfalls. */
	guide?: string;
	examples?: CommandExample[];
}

export const COMMANDS: readonly Command[] = [
	{
		name: "help",
		aliases: ["h", "?"],
		summary: "show all commands",
		detail: "A compact reference. For explanations and examples use /tutorial instead.",
		examples: [
			{ cmd: "/help", what: "the full command list" },
		],
	},
	{
		name: "research",
		args: "[xN] <question>",
		summary: "deep web search with a cited report",
		detail:
			"Answers a question from the open web: plans subquestions, searches, reads pages, then searches again " +
			"for whatever is still missing, and writes a cited report to .kaioken/research/. The same runs power " +
			"the desktop app's Deep Search history. Needs a web-search API key (tavily, firecrawl, brave or exa) " +
			"in ~/.kaioken/config.yaml on top of the LLM key.",
		guide:
			"Research never reads the repository — it is for questions the code cannot answer: library " +
			"comparisons, release notes, current best practice. The leading xN multiplier is the usual Kaioken " +
			"dial: x1 is a quick look, x3 the default, higher digs deeper at real cost in searches and model " +
			"calls. Every claim in the report cites a numbered source that was actually read. Reports land in " +
			".kaioken/research/<slug>.md and rerunning the same question overwrites its predecessor.",
		examples: [
			{ cmd: "/research what changed in Go 1.24 garbage collection?", what: "the default ×3 run" },
			{ cmd: "/research x1 is htmx still maintained?", what: "a quick, shallow look" },
			{ cmd: "/research x5 compare tauri and electron for a Go sidecar app", what: "dig deeper" },
		],
	},
	{
		name: "wiki",
		args: "[xN] [force|update|retry]",
		summary: "deep multi-pass wiki",
		detail:
			"The main event. Pass 1 plans chapters over the whole repo; pass 2 plans each chapter's " +
			"subsections; pass 3 writes long-form chapters and subsections, verifying every claim against " +
			"the structural index. The multiplier is the Kaioken dial: x1..x4 buys breadth with 1 repair pass; " +
			"x5 and above adds critique passes and additional repair passes. An existing plan is reused so you can " +
			"edit wiki-plan.yaml first.",
		examples: [
			{ cmd: "/wiki", what: "the default ×3 run" },
			{ cmd: "/wiki x1", what: "a fast, shallow pass" },
			{ cmd: "/wiki x10 force", what: "maximum depth, re-planning from scratch" },
			{ cmd: "/wiki retry", what: "regenerate only the sections that failed" },
			{ cmd: "/wiki update", what: "same as /update" },
		],
	},
	{
		name: "mode",
		args: "[build|plan|general|explore|review|prism]",
		summary: "switch the agent's permission mode",
		detail:
			"Build is the full-access default. Plan, explore, review, and prism are read-only — the agent can " +
			"inspect or retrieve but not change files; general keeps every tool but always asks first. In prism " +
			"mode, every user question automatically retrieves and grounds answers from imported documents. " +
			"Switching mid-conversation tells the model its toolset changed, and the mode is saved with the " +
			"session so /resume restores it.",
		guide:
			"Use /mode plan when you want a proposal you can review before anything is touched, /mode explore " +
			"when you are asking questions about the code, /mode review for code review and security audits, " +
			"/mode prism when you want answers grounded in your imported PRISM documents, and /mode general when " +
			"you want full capability with a mandatory prompt on every change — even with /yolo on. Bare /mode " +
			"shows where you are; switching back to build restores the default. The switch is announced to the " +
			"model mid-conversation, so it stops offering edits it can no longer make.",
		examples: [
			{ cmd: "/mode", what: "show the current mode and the alternatives" },
			{ cmd: "/mode plan", what: "read-only: propose changes without applying them" },
			{ cmd: "/mode prism", what: "grounded retrieval: answer from imported PRISM documents" },
			{ cmd: "/mode build", what: "back to full access" },
		],
	},
	{
		name: "model",
		args: "[id|list]",
		summary: "set the model, or report the active one",
		detail:
			"Set one directly with the full spec — the first segment names the provider, so an OpenRouter id with slashes of its own still parses. " +
			"If the first segment names no provider but the whole spec is a model id of a configured one — OpenRouter ids carry their own " +
			"namespace, so z-ai/glm-4.5 is really openrouter/z-ai/glm-4.5 — the prefix is added and said. The choice is saved to .kaioken/model.json, " +
			"so the CLI's commands run on the same model. No model is assumed: until one is picked, generating commands stop and say so.",
		examples: [
			{ cmd: "/model", what: "report the active model and provider" },
			{ cmd: "/model openrouter/z-ai/glm-5.3-flash", what: "set one directly" },
			{ cmd: "/model z-ai/glm-4.5", what: "an id without its openrouter/ prefix — added for you" },
			{ cmd: "/model list", what: "print the catalog to the screen" },
		],
	},
	{
		name: "models",
		args: "[filter]",
		summary: "list the provider's models",
		detail:
			"From the provider catalog's snapshot: /models prints the active provider's models, /models <text> " +
			"searches every configured one, and the running model is marked. /provider list shows who is configured.",
		examples: [
			{ cmd: "/models", what: "print the catalog" },
			{ cmd: "/models free", what: "only ids containing 'free'" },
		],
	},
	{
		name: "new",
		aliases: ["reset"],
		summary: "start a fresh session (current one is saved)",
		detail: "Clears the model's context without losing anything — /resume brings the old one back.",
		examples: [
			{ cmd: "/new", what: "start over with a clean context" },
		],
	},
	{
		name: "clear",
		aliases: ["cls"],
		summary: "clear the screen",
		detail: "Only clears the display. The conversation is untouched — that is /new.",
		examples: [
			{ cmd: "/clear", what: "wipe the transcript from view" },
		],
	},
	{
		name: "undo",
		summary: "revert the last file write/edit",
		detail:
			"Kaioken records each file's contents before the agent changes it. Repeat to walk further back. A " +
			"file the agent created is deleted rather than restored.",
		examples: [
			{ cmd: "/undo", what: "revert the most recent change" },
		],
	},
	{
		name: "diff",
		summary: "show git diff for the working tree",
		detail: "Runs git diff in the repo so you can review everything the agent changed at once.",
		examples: [
			{ cmd: "/diff", what: "show uncommitted changes" },
		],
	},
	{
		name: "compact",
		summary: "summarize the conversation to free context",
		detail:
			"Replaces older history with an LLM-written summary, keeping the system prompt and the most recent " +
			"turns intact. Kaioken also reduces context on its own when a turn would not fit: first by dropping " +
			"stale tool output (free, keeps the conversation), then by summarizing if that was not enough. Run it " +
			"by hand when you would rather choose the moment, such as before starting a long task.",
		examples: [
			{ cmd: "/compact", what: "summarize and continue" },
		],
	},
	{
		name: "cost",
		aliases: ["usage"],
		summary: "token usage and spend for the active model",
		detail:
			"Counts reset when you switch model or provider, since that starts a new client. On OpenRouter the " +
			"real USD spend is shown too, and budget.warn_at / budget.hard_stop in config.yaml turn it into a " +
			"guardrail.",
		examples: [
			{ cmd: "/cost", what: "calls, prompt/output tokens, and USD spend so far" },
		],
	},
	{
		name: "sessions",
		summary: "list saved conversations",
		detail: "Conversations are saved per repo after every reply, under .kaioken/sessions/.",
		examples: [
			{ cmd: "/sessions", what: "list them, newest first" },
		],
	},
	{
		name: "resume",
		args: "[id]",
		summary: "reopen a saved conversation (no id = picker)",
		detail:
			"Restores the full message history, so the model keeps its context. The transcript is replayed so you " +
			"can see where you left off.",
		examples: [
			{ cmd: "/resume", what: "pick from a searchable list" },
			{ cmd: "/resume 20260724-153012-4821", what: "jump straight to one" },
		],
	},
	{
		name: "key",
		args: "[value]",
		summary: "set the API key (blank = hidden prompt)",
		detail:
			"Held for this session in the active provider's environment variable — nothing is written to disk, so it " +
			"dies with the TUI. Typing /key with no value hides your input, which is what you want when someone is " +
			"watching. Switching provider with /provider changes which variable the key lands in.",
		examples: [
			{ cmd: "/key", what: "prompt for the key with the input hidden" },
			{ cmd: "/key sk-or-v1-...", what: "set it inline (it will appear in the transcript)" },
		],
	},
	{
		name: "yolo",
		summary: "toggle auto-approve for edits and commands",
		detail:
			"Off by default: every file write, edit and shell command shows a diff and waits for y/n. Turning " +
			"this on skips the prompt entirely — fast, and exactly as risky as it sounds. /undo still works " +
			"afterwards.",
		examples: [
			{ cmd: "/yolo", what: "toggle it; the footer shows 'yolo' while it is on" },
		],
	},
	{
		name: "thinking",
		args: "[off|low|medium|high]",
		summary: "set the model's reasoning depth",
		detail:
			"Reasoning models can spend extra tokens thinking before they answer. This sets how much: off sends " +
			"nothing, low/medium/high request increasing depth. Applied where the endpoint supports it — " +
			"OpenRouter, OpenAI, and Anthropic; other hosts are left untouched rather than risking a rejected " +
			"request.",
		guide:
			"Depth is a cost dial, not a quality switch: a rename needs none, an architecture question benefits " +
			"from high. The level applies to the active client and resets on /model or /provider switches. With " +
			"no argument the current level is shown.",
		examples: [
			{ cmd: "/thinking", what: "show the current level" },
			{ cmd: "/thinking high", what: "maximum reasoning depth" },
			{ cmd: "/thinking off", what: "back to plain replies" },
		],
	},
	{
		name: "stop",
		summary: "stop the running task",
		detail:
			"Cancels whatever is in flight — a chat turn, a wiki run, a compaction. Esc and ctrl+c do the same. " +
			"Text the model already streamed is kept, not discarded.",
		examples: [
			{ cmd: "/stop", what: "cancel the current run" },
		],
	},
	{
		name: "queue",
		args: "[clear]",
		summary: "show or clear queued steering messages",
		detail:
			"While the agent is working, anything you type is queued and joins the conversation after its current " +
			"step. /queue shows how many messages are waiting; /queue clear drops them before the agent reads " +
			"them.",
		guide:
			"Steering replaces cancel-and-retype: when you see the agent head down the wrong path, just type the " +
			"correction and press enter. It queues, and joins the conversation after the current step completes — " +
			"the agent reads it before deciding what to do next. /queue shows what is waiting; /queue clear drops " +
			"it if you changed your mind. To abandon the whole turn instead, use /stop.",
		examples: [
			{ cmd: "/queue", what: "how many messages are queued" },
			{ cmd: "/queue clear", what: "drop the queued messages" },
		],
	},
	{
		name: "btw",
		args: "<text>",
		summary: "tell the agent something without asking for a reply",
		detail:
			"Drops context into the conversation without starting a turn. The model reads it before its next " +
			"reply instead of answering it now, so nothing is spent until you actually ask something. Use it for " +
			"what you just remembered: a file that moved, a test already known to be flaky, a constraint you " +
			"forgot to mention. While the agent is working the aside joins the steering queue and lands after the " +
			"current step.",
		guide:
			"Three channels carry context and they differ in reach. /notes is permanent and repo-wide — injected " +
			"into every prompt, forever. A plain message is a request, and the agent answers it. /btw sits " +
			"between them: this conversation only, no answer, no cost until the next real turn. Reach for it " +
			"whenever you would otherwise send a message ending in \"no need to respond\". The aside is saved with " +
			"the session, so /resume brings it back with everything else.",
		examples: [
			{ cmd: "/btw staging is down, ignore those integration failures", what: "context the agent cannot see" },
			{ cmd: "/btw I renamed parseArgs to parseCLIArgs on disk just now", what: "tell it the ground truth changed" },
		],
	},
	{
		name: "switch",
		args: "[id]",
		summary: "save this session and open another",
		detail:
			"Like /resume, but the current conversation is saved first and extensions get a chance to veto the " +
			"change (a hook holding unflushed state can say no). No id opens the picker.",
		guide:
			"Use /switch when you are hopping between two live conversations — a refactor in one session, a bug " +
			"hunt in another — and want both preserved as you move. /resume alone reopens a session; /switch also " +
			"saves the one you are leaving and lets extension hooks veto the move, which matters once hooks hold " +
			"in-flight state. Sessions created by /import or forking show their lineage in /sessions.",
		examples: [
			{ cmd: "/switch", what: "save, then pick a session" },
			{ cmd: "/switch 20260724-153012-4821", what: "save, then open that one" },
		],
	},
	{
		name: "update",
		args: "[base-rev]",
		summary: "git-diff refresh of the wiki and skills",
		detail:
			"A full wiki run is expensive; this one is not. Kaioken records the commit the wiki reflects, diffs " +
			"the repo against it — including uncommitted and untracked files — and revises only the documents " +
			"that diff invalidates, then refreshes the skills whose sources changed. Each document is revised, " +
			"not rewritten.",
		examples: [
			{ cmd: "/update", what: "refresh against the recorded baseline" },
			{ cmd: "/update HEAD~10", what: "use an explicit baseline instead" },
		],
	},
	{
		name: "skills",
		aliases: ["skill"],
		args: "[force|list]",
		summary: "build task guides for agents",
		detail:
			"Kaioken proposes the recurring tasks in your repo, then writes one SKILL.md per task under " +
			".kaioken/skills/ — prerequisites, numbered steps naming real files, local conventions, how to " +
			"verify, and the mistakes people actually make here. The frontmatter records which files each skill " +
			"was built from, which is how /update knows what to refresh. Build them after a wiki or card run, " +
			"when there is something to draw on.",
		examples: [
			{ cmd: "/skills", what: "plan and build the set" },
			{ cmd: "/skills list", what: "show what exists" },
			{ cmd: "/skills force", what: "rewrite them all" },
			{ cmd: "/skills add-an-api-endpoint", what: "rebuild just one" },
		],
	},
	{
		name: "impact",
		aliases: ["imp"],
		args: "<description of the change>",
		summary: "predict what a change would touch",
		detail:
			"Describe a refactor in plain words and Kaioken maps its blast radius before you edit anything: the " +
			"symbols and files involved, the modules they belong to, the wiki documents and skills that would go " +
			"stale, and the tests to re-run. Every claim is verified against the symbol index; anything the index " +
			"cannot confirm is listed separately as unverified.",
		guide:
			"Run it before a refactor, not after. Name the symbols you intend to touch — the more precisely the " +
			"intent names real identifiers, the sharper the prediction. The report opens as a navigable tree: " +
			"arrows move, enter folds a group, f cycles the kind filter, and q closes it into the transcript. " +
			"Each run is saved under .kaioken/impact/ for later reference. Results are richest after /plan, /wiki " +
			"and /skills have run, but only the intent is required.",
		examples: [
			{ cmd: "/impact rename parseArgs to parseCLIArgs", what: "map every caller, doc and skill a rename touches" },
			{ cmd: "/impact change the return type of Load to (*Plan, error)", what: "gauge an interface change before committing to it" },
		],
	},
	{
		name: "provider",
		args: "[name|list]",
		summary: "switch API provider (no arg = list all)",
		detail:
			"Any OpenAI-compatible endpoint works: openrouter, openai, groq, together, deepseek, mistral, ollama, " +
			"fireworks, perplexity, xai, cerebras, sambanova, huggingface, cohere, anyscale. The switch is " +
			"session-scoped: a provider needs its key in the environment (or /key), and the model is retargeted " +
			"from the provider's catalog when the current one cannot run there.",
		examples: [
			{ cmd: "/provider", what: "list all providers with their details" },
			{ cmd: "/provider list", what: "same — show all available providers" },
			{ cmd: "/provider groq", what: "switch to Groq" },
		],
	},
	{
		name: "fetcher",
		args: "[api|local] [on|off]",
		summary: "choose what reads the pages research finds",
		detail:
			"Finding a page and reading it are separate jobs. This sets the second. Two independent readers: the " +
			"API reader sends each URL to Firecrawl, which renders it and strips the boilerplate for a credit; " +
			"the local reader opens a browser already on this machine and re-reads anything that came back as an " +
			"empty shell.  Either, both or neither. Both is the default and the usual answer — the local reader " +
			"picks up whatever the API misses. With neither, pages are plain fetches, which is free and fine for " +
			"articles but returns almost nothing for a single-page app.",
		guide:
			"Turn the API reader off to stop spending Firecrawl credits without giving up on JavaScript-heavy " +
			"pages — the local browser handles those for free, just slower. Turn the local reader off on a " +
			"machine with no browser installed, or when you would rather a run fail than take the extra seconds. " +
			"The setting is global, saved to ~/.kaioken/config.yaml, and the same one the desktop app shows under " +
			"Research engines.",
		examples: [
			{ cmd: "/fetcher", what: "show what reads pages now, and what each reader needs" },
			{ cmd: "/fetcher api off", what: "stop sending URLs to Firecrawl" },
			{ cmd: "/fetcher local on", what: "re-read empty pages in a local browser" },
		],
	},
	{
		name: "config",
		summary: "show the active configuration",
		examples: [
			{ cmd: "/config", what: "model, provider, repo, scope and notes" },
		],
	},
	{
		name: "prism",
		args: "[subcommand]",
		summary: "retrieve over documents you import, grouped into modules",
		detail:
			"PRISM is a separate corpus from the wiki: you import documents into a module and ask questions " +
			"scoped to it. Retrieval is hybrid (BM25 plus vectors), and when a utility model is configured a " +
			"relevance gate drops chunks that do not actually answer the question — so 'no source found' is an " +
			"answer it can give.  Every answer carries three flags. sourced means a graded source backs it; " +
			"UNGRADED means the gate never ran, so the context is unverified however good it looks; DEGRADED " +
			"means retrieval ran on a reduced pipeline. They are separate because one flag cannot tell 'the " +
			"corpus has no answer' from 'retrieval is broken'.",
		guide:
			"Start with /prism new, /prism import, then just ask. The relevance gate runs on the chat model " +
			"the session already uses; the semantic half of retrieval turns on with an embeddings key " +
			"(OPENAI_API_KEY, or anything OpenAI-compatible via OPENAI_BASE_URL).",
		examples: [
			{ cmd: "/prism", what: "status: the module list, and whether vectors are stored" },
			{ cmd: "/prism use contract-law", what: "switch the active module" },
			{ cmd: "/prism import ./docs", what: "ingest a file or a whole directory" },
			{ cmd: "/prism docs", what: "per-document ingestion status" },
			{ cmd: "/prism what does clause 4 say", what: "ask the active module" },
		],
	},
	{
		name: "session",
		summary: "stats for the current session",
		detail:
			"Shows the active session's id, title, turn count, model, token estimates, cost (when the provider " +
			"reports it), epoch count, and lineage if forked.",
		guide:
			"/session is a quick health check: how long is this conversation, how much has it cost, and how close " +
			"is it to triggering compaction. Useful before a long task to decide whether to /compact or /new " +
			"first.",
		examples: [
			{ cmd: "/session", what: "show stats for the current session" },
		],
	},
	{
		name: "notes",
		args: "[add <text>|clear]",
		summary: "steering notes injected into prompts",
		detail:
			"The human-in-the-loop channel. Notes are injected verbatim into every generation prompt, so use them " +
			"for the tribal knowledge the code does not state — conventions, guardrails, 'never do X here'. This " +
			"is the highest-leverage way to improve output.",
		examples: [
			{ cmd: "/notes", what: "show the current notes" },
			{ cmd: "/notes add Every admin mutation must be audit-logged.", what: "teach the generator a rule" },
			{ cmd: "/notes clear", what: "remove them all" },
		],
	},
	{
		name: "fork",
		args: "[turns]",
		summary: "rewind the conversation to retry a different way",
		detail:
			"Rewinds the active branch by the given number of user turns (default 1). Nothing is deleted: the " +
			"rewound turns stay in the session tree, and the next message you send grows a sibling branch " +
			"instead.",
		guide:
			"Use /fork when an approach went wrong and re-explaining would poison the context: rewind past the " +
			"bad turns and ask again. The abandoned turns are still there — /tree lists every branch and switches " +
			"between them, so a fork is an experiment, not a deletion.",
		examples: [
			{ cmd: "/fork", what: "rewind the last turn" },
			{ cmd: "/fork 3", what: "rewind the last three turns" },
		],
	},
	{
		name: "tree",
		args: "[n [summarize]]",
		summary: "list conversation branches and switch between them",
		detail:
			"Every /fork, compaction, or retry leaves a branch in the session tree. /tree lists the branch tips; " +
			"/tree <n> makes one of them the active conversation. Adding summarize also briefs the model on the " +
			"branch you are leaving, so its lessons carry over.",
		guide:
			"Branches accumulate whenever history diverges — a /fork, an auto-compaction, a retried approach. " +
			"/tree shows each tip with its newest prompt and age; the active one is starred. Switching replays " +
			"the transcript so you can see where that branch stands. Use the summarize variant when the abandoned " +
			"branch learned something the new one should know — it costs one model call.",
		examples: [
			{ cmd: "/tree", what: "list the branches" },
			{ cmd: "/tree 2", what: "switch to branch 2" },
			{ cmd: "/tree 2 summarize", what: "switch and brief the model on the branch left behind" },
		],
	},
	{
		name: "verify",
		summary: "run the repo's build/test gate",
		detail:
			"Detects the repo's own verification commands (Makefile check, go build+test, npm test) and runs " +
			"them, reporting each verdict. Ask the agent to fix whatever fails, then verify again — the gate's " +
			"word is final. The headless CLI version (kaioken verify) adds an automatic fix loop.",
		examples: [
			{ cmd: "/verify", what: "run the gate and show each verdict" },
		],
	},
	{
		name: "init",
		args: "[force]",
		summary: "full first-run setup: config, scan, AGENTS.md",
		detail:
			"Writes the per-repo config (model, provider, scope excludes, steering notes), scans the repository, " +
			"and generates AGENTS.md — the root instruction file an agent reads before editing: the real " +
			"commands, the package boundaries, the gotchas. When a wiki or skills already exist, init writes " +
			"AGENTS.md in their vocabulary and links to them. Re-running is safe: an existing AGENTS.md is left " +
			"alone unless you pass force.",
		examples: [
			{ cmd: "/init", what: "set the repo up (keeps an existing AGENTS.md)" },
			{ cmd: "/init force", what: "rewrite AGENTS.md from the current sources" },
		],
	},
	{
		name: "draft",
		args: "[base]",
		summary: "draft the commit message + PR description",
		detail:
			"Reads the current diff, the repo's recent commit style and your steering notes, and asks the model " +
			"for a conventional-commit message plus a what/why/how-to-test PR description. Advisory only — " +
			"nothing is staged or committed.",
		examples: [
			{ cmd: "/draft", what: "draft from the uncommitted changes" },
			{ cmd: "/draft HEAD~3", what: "draft from everything since that commit" },
		],
	},
	{
		name: "import",
		args: "<path>",
		summary: "bring an external transcript in as a new session",
		detail:
			"Reads a saved session file, a JSON array of messages, or JSONL with one message per line, stores it " +
			"as a new session in this repo, and opens it. Lines that are not messages are skipped, so other " +
			"tools' event logs import too.",
		guide:
			"Use /import to continue a conversation that started somewhere else: a session file copied from " +
			"another repo, a transcript exported by another tool, or a JSONL event log. The import becomes a " +
			"normal session — saved, listed, resumable — and the conversation you were in is saved before the " +
			"switch, so nothing is lost.",
		examples: [
			{ cmd: "/import C:\\tmp\\transcript.jsonl", what: "import and open a transcript" },
		],
	},
	{
		name: "templates",
		aliases: ["template"],
		summary: "list prompt templates (/t:<name> runs one)",
		detail:
			"Templates are parameterized prompts in .kaioken/templates/<name>.md. {{placeholders}} are filled " +
			"from key=value arguments; leftover words land in {{args}}. /t:<name> expands the file and sends it " +
			"as a normal chat message.",
		guide:
			"A template captures a request you keep retyping — \"review X for Y\", \"write a migration for Z\" — as a " +
			"versioned file the whole team shares. Write .kaioken/templates/review.md containing 'Review {{file}} " +
			"focusing on {{args}}', then /t:review file=main.go error handling sends the expanded prompt. " +
			"Placeholders left unfilled stop the send and are named, so a half-filled prompt never reaches the " +
			"model silently.",
		examples: [
			{ cmd: "/templates", what: "list templates and their placeholders — then /t:<name> [key=value…] sends one" },
		],
	},
	{
		name: "ext",
		aliases: ["extension", "extensions"],
		args: "[list|install|remove|update|search|trust|tools|…]",
		summary: "manage community extensions",
		detail:
			"Extensions are packages installed from GitHub releases into ~/.kaioken/extensions. Declarative ones " +
			"contribute skills and never run code; mcp ones declare a server process and wasm ones ship a " +
			"sandboxed plugin module whose tools the agent can call — but only after you explicitly trust that " +
			"exact version, and every call still goes through the normal approval prompt. Installs are pinned in " +
			"a lockfile by version and archive hash.",
		guide:
			"Browse the community registry interactively with /ext browse (enter installs the selection), or " +
			"install directly with /ext install owner/repo — add @1.2.0 to pin a version. Keep things current " +
			"with /ext update; nothing updates silently. An mcp or wasm extension stays inert until /ext trust " +
			"<id>: mcp trust shows the exact UNSANDBOXED command it would run, wasm trust shows the sandboxed " +
			"module and the permissions it asked for (fs:read:workspace mounts your repo read-only; there is no " +
			"network). Both require an explicit yes, and updating an extension revokes its trust until you re- " +
			"grant it. Authors: `kaioken ext dev <path>` installs a working tree for a fast dev loop, and " +
			"`kaioken ext validate` lints it before publishing. /ext remove uninstalls; extensions are per-user, " +
			"so one install serves every repository.",
		examples: [
			{ cmd: "/ext", what: "list installed extensions and their trust state" },
			{ cmd: "/ext browse", what: "pick from the community registry and install" },
			{ cmd: "/ext search git", what: "find community extensions about git" },
			{ cmd: "/ext install alice/kaioken-git-flow", what: "install one from its GitHub releases" },
			{ cmd: "/ext trust alice.git-flow", what: "review what an mcp extension would run" },
			{ cmd: "/ext update", what: "check every extension for a newer release" },
		],
	},
	{
		name: "x",
		args: "[ext command [args]]",
		summary: "run a command a wasm extension contributed",
		detail:
			"Trusted wasm extensions may declare named commands in their manifest. /x alone lists them; /x <ext> " +
			"<command> runs one in the sandbox and prints what it returns. The extension id may be shortened to " +
			"its name part when unambiguous.",
		guide:
			"Extension commands are how a plugin talks to you instead of the model: a status report, a generated " +
			"checklist, a lint summary. They run in the same wasm sandbox as extension tools — no network, read- " +
			"only workspace at most — and only for extensions you explicitly trusted.",
		examples: [
			{ cmd: "/x", what: "list available extension commands" },
			{ cmd: "/x alice.git-flow status", what: "run git-flow's status command" },
			{ cmd: "/x git-flow status", what: "same, short id (when unambiguous)" },
		],
	},
	{
		name: "theme",
		args: "[default|light|highcontrast]",
		summary: "switch the colour palette",
		detail:
			"Three palettes ship built-in: default (for dark terminals), light (for white backgrounds), and " +
			"highcontrast (for accessibility or projectors). The choice is saved in .kaioken/theme.json and " +
			"applies on the next start in this repository.",
		guide:
			"Use /theme with no argument to see what is active; give a name to switch. Switching is instant: " +
			"every style in the terminal updates immediately, so a quick flip between default and light tells you " +
			"which suits your current ambient.",
		examples: [
			{ cmd: "/theme", what: "show the active theme" },
			{ cmd: "/theme light", what: "switch and save" },
		],
	},
	{
		name: "repo",
		args: "<path>",
		summary: "point at a different repository",
		detail: "Everything — chat tools, the knowledge engine, skills — retargets to the new path.",
	},
	{
		name: "learn",
		summary: "distill this session into a skill",
		detail:
			"Reviews the session and, if it taught something worth keeping, writes or patches a skill in " +
			".kaioken/skills/ so the agent loads it before doing this task again. Also writes a digest the recall " +
			"tool can find later, and reinforces any skill consulted. Runs automatically at session end when " +
			"memory.learn >= 5; /learn forces it now.",
		examples: [
			{ cmd: "/learn", what: "turn this session's lessons into a skill" },
		],
	},
	{
		name: "handoff",
		summary: "write a continuation briefing for this session",
		detail:
			"Distills the current session into goal, decisions, state and open threads, appends the collapsed " +
			"transcript, and writes the document under .kaioken/handoffs/ — what a teammate or a fresh agent " +
			"needs to pick the work up.",
		examples: [
			{ cmd: "/handoff", what: "brief the current session" },
		],
	},
	{
		name: "copy",
		summary: "copy the last reply to the clipboard",
		examples: [
			{ cmd: "/copy", what: "copy the model's most recent answer" },
		],
	},
	{
		name: "hook",
		args: "[install|remove]",
		summary: "auto-update the wiki after each commit",
		detail:
			"Installs a git post-commit hook running /update in the background, so documentation never drifts. It " +
			"appends a delimited block, so an existing hook is preserved.",
		examples: [
			{ cmd: "/hook", what: "report whether it is installed" },
			{ cmd: "/hook install", what: "refresh docs after every commit" },
			{ cmd: "/hook remove", what: "take it back out" },
		],
	},
	{
		name: "serve",
		args: "[port]",
		summary: "browse the wiki in a browser",
		detail:
			"Renders .kaioken/wiki/ as a local site with sidebar navigation and search. Runs in " +
			"the background so chat stays usable.",
		examples: [
			{ cmd: "/serve", what: "start on port 7777" },
			{ cmd: "/serve 8080", what: "pick a port" },
			{ cmd: "/serve stop", what: "shut it down" },
		],
	},
	{
		name: "tutorial",
		args: "[chapter|command]",
		summary: "guided walkthrough of every command",
		detail:
			"Start here. With no argument it gives an overview and a first-run sequence. Pass a chapter to go " +
			"deeper, or any command name to see just that one.",
		guide:
			"The tutorial is organized into chapters that group related commands. Start with the overview, then " +
			"drill into a chapter that matches what you are trying to do. For a single command's full reference " +
			"page — syntax, workflow tips, and every example — use /explain instead.",
		examples: [
			{ cmd: "/tutorial", what: "the overview and the chapter list" },
			{ cmd: "/tutorial knowledge", what: "everything about the documentation pipelines" },
			{ cmd: "/tutorial wiki", what: "just the /wiki command, in detail" },
			{ cmd: "/tutorial all", what: "the entire manual in one go" },
		],
	},
	{
		name: "explain",
		args: "[command]",
		summary: "in-depth reference for every command",
		detail:
			"Like /tutorial but goes deeper: full syntax, aliases, workflow guidance, tips and every example for " +
			"each command. With no argument it shows a grouped index of all commands. Pass a command name for its " +
			"full page.",
		guide:
			"Use /explain when you know which command you want but need the full picture — syntax, aliases, when " +
			"to reach for it, and worked examples. /explain all prints the complete reference in one go.",
		examples: [
			{ cmd: "/explain", what: "grouped index of every command" },
			{ cmd: "/explain wiki", what: "the full reference page for /wiki" },
			{ cmd: "/explain all", what: "the complete command reference" },
		],
	},
	{
		name: "publish",
		summary: "render the wiki as a static site",
		detail:
			"Writes .kaioken/wiki/ out as plain HTML under .kaioken/site/ — no server, no Kaioken needed to read " +
			"it. The artifact to put on GitHub Pages or share with teammates who just want a browser.",
		examples: [
			{ cmd: "/publish", what: "write the static site to .kaioken/site/" },
		],
	},
	{
		name: "onboard",
		summary: "write the day-one ONBOARDING.md",
		detail:
			"Assembles ONBOARDING.md at the repo root from the wiki chapters, knowledge cards, skills and scan " +
			"inventory — the document you hand a new teammate. No LLM calls, so it never invents anything.",
		examples: [
			{ cmd: "/onboard", what: "write ONBOARDING.md" },
			{ cmd: "/onboard force", what: "overwrite an existing guide" },
		],
	},
	{
		name: "scan",
		summary: "scan the repo and print an inventory",
		detail: "A dry run: what Kaioken sees after .gitignore and your scope excludes apply.",
		examples: [
			{ cmd: "/scan", what: "file counts, sizes and the tree" },
		],
	},
	{
		name: "plan",
		summary: "propose modules.yaml with the LLM",
		detail:
			"The first step of the knowledge-card pipeline. The result is meant to be edited — module boundaries " +
			"are a judgment call you should own.",
		examples: [
			{ cmd: "/plan", what: "propose a module tree, then edit modules.yaml" },
		],
	},
	{
		name: "cards",
		aliases: ["generate", "gen"],
		args: "[force|id]",
		summary: "generate knowledge cards",
		detail:
			"The other pipeline: short, dense, fixed-schema files per module (overview, architecture, " +
			"conventions, tech stack) meant as compact agent context rather than human reading. Unchanged modules " +
			"are skipped via content hashing.",
		examples: [
			{ cmd: "/cards", what: "generate for every module, skipping unchanged ones" },
			{ cmd: "/cards force", what: "rebuild everything" },
			{ cmd: "/cards api/routes", what: "just one module" },
		],
	},
	{
		name: "status",
		summary: "per-module freshness",
		examples: [
			{ cmd: "/status", what: "which modules are up to date, changed or missing" },
		],
	},
	{
		name: "graph",
		summary: "derive the knowledge graph",
		detail:
			"Works out which documents share ground and what references what, and writes .kaioken/graph.json. No " +
			"model, no credentials.",
		examples: [
			{ cmd: "/graph", what: "rebuild the graph from the current cards, wiki and skills" },
		],
	},
	{
		name: "version",
		aliases: ["v"],
		summary: "print the Kaioken version",
		examples: [
			{ cmd: "/version", what: "version, Go build and platform" },
		],
	},
	{
		name: "quit",
		aliases: ["exit", "q"],
		summary: "exit Kaioken",
		detail: "ctrl+d does the same when nothing is running. The session is already saved.",
		examples: [
			{ cmd: "/quit", what: "leave" },
		],
	},
];

/**
 * How much the user must type before a mid-name match counts.
 *
 * Without it a single letter drags in noise — `/w` would offer `new`.
 */
export const MIN_SUBSTRING_MATCH = 3;

/**
 * How well a command matches a typed prefix: 2 for a name prefix, 1 for an
 * alias prefix or a mid-name hit, 0 for no match.
 *
 * Ranking is what keeps `/co` showing `copy` and `compact` above anything that
 * merely contains "co".
 */
export function matchScore(command: Command, prefix: string): number {
	if (prefix === "") return 2;
	const needle = prefix.toLowerCase();
	if (command.name.startsWith(needle)) return 2;
	for (const alias of command.aliases ?? []) {
		if (alias.startsWith(needle)) return 1;
	}
	// A mid-name match only once the user has typed enough to mean it, so
	// `/date` still finds `update` without `/w` finding `new`.
	if (needle.length >= MIN_SUBSTRING_MATCH && command.name.includes(needle)) return 1;
	return 0;
}

/**
 * The commands matching a prefix, best first.
 *
 * Registry order breaks ties, which is why the registry is ordered by use: two
 * equally good matches are offered in the order they are reached for, not
 * alphabetically.
 */
export function filterCommands(prefix: string, commands: readonly Command[] = COMMANDS): Command[] {
	const scored: Array<{ command: Command; score: number; index: number }> = [];
	for (let i = 0; i < commands.length; i++) {
		const command = commands[i] as Command;
		const score = matchScore(command, prefix);
		if (score > 0) scored.push({ command, score, index: i });
	}
	scored.sort((a, b) => b.score - a.score || a.index - b.index);
	return scored.map((entry) => entry.command);
}

/** Look a command up by name or alias, the way dispatch does. */
export function findCommand(name: string, commands: readonly Command[] = COMMANDS): Command | undefined {
	const needle = name.toLowerCase();
	return commands.find((c) => c.name === needle || (c.aliases ?? []).includes(needle));
}
