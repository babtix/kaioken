package tui

import "strings"

// The slash-command registry backs the completion palette. dispatch still owns
// execution; this describes the commands so they can be listed, filtered and
// completed. A test asserts every entry here is actually accepted by dispatch,
// so the two cannot drift apart silently.

// example is one worked invocation shown by /tutorial.
type example struct {
	cmd  string // the literal thing to type
	what string // what it does
}

// command describes one slash command.
type command struct {
	name    string
	aliases []string
	args    string // argument hint shown beside the name
	summary string // one line, shown in the palette and /help
	// detail is the paragraph /tutorial adds when the summary is not enough:
	// why the command exists, or what is surprising about it.
	detail string
	// guide is the extended usage guidance /explain shows: workflow context,
	// tips, common patterns and pitfalls — richer than detail.
	guide    string
	examples []example
}

// minSubstringMatch is how much the user must type before a mid-name match
// counts. Without it a single letter drags in noise — "/w" would offer "new".
const minSubstringMatch = 3

// matches reports whether the command is a candidate for the typed prefix,
// and how good the match is: 2 for a name prefix, 1 for an alias prefix or a
// mid-name hit, 0 for no match. Ranking keeps "/co" showing `copy` and
// `compact` above anything that merely contains "co".
func (c command) matches(prefix string) int {
	if prefix == "" {
		return 2
	}
	if strings.HasPrefix(c.name, prefix) {
		return 2
	}
	for _, a := range c.aliases {
		if strings.HasPrefix(a, prefix) {
			return 1
		}
	}
	// A mid-name match only once the user has typed enough to mean it, so
	// "/date" still finds "update" without "/w" finding "new".
	if len(prefix) >= minSubstringMatch && strings.Contains(c.name, prefix) {
		return 1
	}
	return 0
}

// commands is the full palette, grouped roughly as the help text is.
var commands = []command{
	// ---- getting started ----
	{
		name: "tutorial", args: "[chapter|command]",
		summary: "guided walkthrough of every command",
		detail: "Start here. With no argument it gives an overview and a first-run sequence. " +
			"Pass a chapter to go deeper, or any command name to see just that one.",
		guide: "The tutorial is organized into chapters that group related commands. " +
			"Start with the overview, then drill into a chapter that matches what you " +
			"are trying to do. For a single command's full reference page — syntax, " +
			"workflow tips, and every example — use /explain instead.",
		examples: []example{
			{"/tutorial", "the overview and the chapter list"},
			{"/tutorial knowledge", "everything about the documentation pipelines"},
			{"/tutorial wiki", "just the /wiki command, in detail"},
			{"/tutorial all", "the entire manual in one go"},
		},
	},
	{
		name: "explain", args: "[command]",
		summary: "in-depth reference for every command",
		detail: "Like /tutorial but goes deeper: full syntax, aliases, workflow guidance, " +
			"tips and every example for each command. With no argument it shows a " +
			"grouped index of all commands. Pass a command name for its full page.",
		guide: "Use /explain when you know which command you want but need the full " +
			"picture — syntax, aliases, when to reach for it, and worked examples. " +
			"/explain all prints the complete reference in one go.",
		examples: []example{
			{"/explain", "grouped index of every command"},
			{"/explain wiki", "the full reference page for /wiki"},
			{"/explain all", "the complete command reference"},
		},
	},
	{
		name: "help", aliases: []string{"h", "?"},
		summary: "show all commands",
		detail:  "A compact reference. For explanations and examples use /tutorial instead.",
		examples: []example{
			{"/help", "the full command list"},
		},
	},
	{
		name: "init", args: "[force]",
		summary: "full first-run setup: config, scan, AGENTS.md",
		detail: "Writes the per-repo config (model, provider, scope excludes, steering notes), " +
			"scans the repository, and generates AGENTS.md — the root instruction file an " +
			"agent reads before editing: the real commands, the package boundaries, the " +
			"gotchas. When a wiki or skills already exist, init writes AGENTS.md in their " +
			"vocabulary and links to them. Re-running is safe: an existing AGENTS.md is left " +
			"alone unless you pass force.",
		examples: []example{
			{"/init", "set the repo up (keeps an existing AGENTS.md)"},
			{"/init force", "rewrite AGENTS.md from the current sources"},
		},
	},
	{
		name: "key", args: "[value]",
		summary: "set the API key (blank = hidden prompt)",
		detail: "Saved to ~/.kaioken/config.yaml with 0600 permissions, so it carries across " +
			"repos and restarts. Typing /key with no value hides your input, which is what " +
			"you want when someone is watching. Resolution order: this key, then the " +
			"provider's environment variable.",
		examples: []example{
			{"/key", "prompt for the key with the input hidden"},
			{"/key sk-or-v1-...", "set it inline (it will appear in the transcript)"},
		},
	},

	// ---- chat and the agent ----
	{
		name:    "yolo",
		summary: "toggle auto-approve for edits and commands",
		detail: "Off by default: every file write, edit and shell command shows a diff and waits " +
			"for y/n. Turning this on skips the prompt entirely — fast, and exactly as risky " +
			"as it sounds. /undo still works afterwards.",
		examples: []example{
			{"/yolo", "toggle it; the footer shows 'yolo' while it is on"},
		},
	},
	{
		name: "mode", args: "[build|plan|general|explore]",
		summary: "switch the agent's permission mode",
		detail: "Build is the full-access default. Plan and explore are read-only — the agent can " +
			"inspect but not change anything; general keeps every tool but always asks first. " +
			"Switching mid-conversation tells the model its toolset changed, and the mode is " +
			"saved with the session so /resume restores it.",
		guide: "Use /mode plan when you want a proposal you can review before anything is " +
			"touched, /mode explore when you are only asking questions about the code, and " +
			"/mode general when you want full capability with a mandatory prompt on every " +
			"change — even with /yolo on. Bare /mode shows where you are; switching back to " +
			"build restores the default. The switch is announced to the model mid-conversation, " +
			"so it stops offering edits it can no longer make.",
		examples: []example{
			{"/mode", "show the current mode and the alternatives"},
			{"/mode plan", "read-only: propose changes without applying them"},
			{"/mode build", "back to full access"},
		},
	},
	{
		name:    "undo",
		summary: "revert the last file write/edit",
		detail: "Kaioken records each file's contents before the agent changes it. Repeat to walk " +
			"further back. A file the agent created is deleted rather than restored.",
		examples: []example{
			{"/undo", "revert the most recent change"},
		},
	},
	{
		name:    "diff",
		summary: "show git diff for the working tree",
		detail:  "Runs git diff in the repo so you can review everything the agent changed at once.",
		examples: []example{
			{"/diff", "show uncommitted changes"},
		},
	},
	{
		name:    "stop",
		summary: "stop the running task",
		detail: "Cancels whatever is in flight — a chat turn, a wiki run, a compaction. Esc and " +
			"ctrl+c do the same. Text the model already streamed is kept, not discarded.",
		examples: []example{
			{"/stop", "cancel the current run"},
		},
	},
	{
		name: "queue", args: "[clear]",
		summary: "show or clear queued steering messages",
		detail: "While the agent is working, anything you type is queued and joins the " +
			"conversation after its current step. /queue shows how many messages are " +
			"waiting; /queue clear drops them before the agent reads them.",
		guide: "Steering replaces cancel-and-retype: when you see the agent head down the " +
			"wrong path, just type the correction and press enter. It queues, and joins " +
			"the conversation after the current step completes — the agent reads it " +
			"before deciding what to do next. /queue shows what is waiting; /queue clear " +
			"drops it if you changed your mind. To abandon the whole turn instead, use " +
			"/stop.",
		examples: []example{
			{"/queue", "how many messages are queued"},
			{"/queue clear", "drop the queued messages"},
		},
	},
	{
		name: "fork", args: "[turns]",
		summary: "rewind the conversation to retry a different way",
		detail: "Rewinds the active branch by the given number of user turns (default 1). " +
			"Nothing is deleted: the rewound turns stay in the session tree, and the " +
			"next message you send grows a sibling branch instead.",
		guide: "Use /fork when an approach went wrong and re-explaining would poison the " +
			"context: rewind past the bad turns and ask again. The abandoned turns are " +
			"still there — /tree lists every branch and switches between them, so a fork " +
			"is an experiment, not a deletion.",
		examples: []example{
			{"/fork", "rewind the last turn"},
			{"/fork 3", "rewind the last three turns"},
		},
	},
	{
		name: "tree", args: "[n [summarize]]",
		summary: "list conversation branches and switch between them",
		detail: "Every /fork, compaction, or retry leaves a branch in the session tree. " +
			"/tree lists the branch tips; /tree <n> makes one of them the active " +
			"conversation. Adding summarize also briefs the model on the branch you " +
			"are leaving, so its lessons carry over.",
		guide: "Branches accumulate whenever history diverges — a /fork, an auto-compaction, " +
			"a retried approach. /tree shows each tip with its newest prompt and age; the " +
			"active one is starred. Switching replays the transcript so you can see where " +
			"that branch stands. Use the summarize variant when the abandoned branch " +
			"learned something the new one should know — it costs one model call.",
		examples: []example{
			{"/tree", "list the branches"},
			{"/tree 2", "switch to branch 2"},
			{"/tree 2 summarize", "switch and brief the model on the branch left behind"},
		},
	},

	// ---- sessions ----
	{
		name:    "sessions",
		summary: "list saved conversations",
		detail:  "Conversations are saved per repo after every reply, under .kaioken/sessions/.",
		examples: []example{
			{"/sessions", "list them, newest first"},
		},
	},
	{
		name: "resume", args: "[id]",
		summary: "reopen a saved conversation (no id = picker)",
		detail: "Restores the full message history, so the model keeps its context. The transcript " +
			"is replayed so you can see where you left off.",
		examples: []example{
			{"/resume", "pick from a searchable list"},
			{"/resume 20260724-153012-4821", "jump straight to one"},
		},
	},
	{
		name: "switch", args: "[id]",
		summary: "save this session and open another",
		detail: "Like /resume, but the current conversation is saved first and extensions get " +
			"a chance to veto the change (a hook holding unflushed state can say no). " +
			"No id opens the picker.",
		guide: "Use /switch when you are hopping between two live conversations — a refactor " +
			"in one session, a bug hunt in another — and want both preserved as you move. " +
			"/resume alone reopens a session; /switch also saves the one you are leaving and " +
			"lets extension hooks veto the move, which matters once hooks hold in-flight state. " +
			"Sessions created by /import or forking show their lineage in /sessions.",
		examples: []example{
			{"/switch", "save, then pick a session"},
			{"/switch 20260724-153012-4821", "save, then open that one"},
		},
	},
	{
		name: "import", args: "<path>",
		summary: "bring an external transcript in as a new session",
		detail: "Reads a saved session file, a JSON array of messages, or JSONL with one " +
			"message per line, stores it as a new session in this repo, and opens it. " +
			"Lines that are not messages are skipped, so other tools' event logs import too.",
		guide: "Use /import to continue a conversation that started somewhere else: a session " +
			"file copied from another repo, a transcript exported by another tool, or a JSONL " +
			"event log. The import becomes a normal session — saved, listed, resumable — and " +
			"the conversation you were in is saved before the switch, so nothing is lost.",
		examples: []example{
			{"/import C:\\tmp\\transcript.jsonl", "import and open a transcript"},
		},
	},
	{
		name: "new", aliases: []string{"reset"},
		summary: "start a fresh session (current one is saved)",
		detail:  "Clears the model's context without losing anything — /resume brings the old one back.",
		examples: []example{
			{"/new", "start over with a clean context"},
		},
	},
	{
		name:    "compact",
		summary: "summarize the conversation to free context",
		detail: "Replaces older history with an LLM-written summary, keeping the system prompt and " +
			"the most recent turns intact. Kaioken also reduces context on its own when a turn " +
			"would not fit: first by dropping stale tool output (free, keeps the conversation), " +
			"then by summarizing if that was not enough. Run it by hand when you would rather " +
			"choose the moment, such as before starting a long task.",
		examples: []example{
			{"/compact", "summarize and continue"},
		},
	},
	{
		name:    "learn",
		summary: "distill this session into a skill",
		detail: "Reviews the session and, if it taught something worth keeping, writes or patches " +
			"a skill in .kaioken/skills/ so the agent loads it before doing this task again. Also " +
			"writes a digest the recall tool can find later, and reinforces any skill consulted. " +
			"Runs automatically at session end when memory.learn >= 5; /learn forces it now.",
		examples: []example{
			{"/learn", "turn this session's lessons into a skill"},
		},
	},
	{
		name:    "copy",
		summary: "copy the last reply to the clipboard",
		examples: []example{
			{"/copy", "copy the model's most recent answer"},
		},
	},
	{
		name: "cost", aliases: []string{"usage"},
		summary: "token usage and spend for the active model",
		detail: "Counts reset when you switch model or provider, since that starts a new client. " +
			"On OpenRouter the real USD spend is shown too, and budget.warn_at / budget.hard_stop " +
			"in config.yaml turn it into a guardrail.",
		examples: []example{
			{"/cost", "calls, prompt/output tokens, and USD spend so far"},
		},
	},
	{
		name: "clear", aliases: []string{"cls"},
		summary: "clear the screen",
		detail:  "Only clears the display. The conversation is untouched — that is /new.",
		examples: []example{
			{"/clear", "wipe the transcript from view"},
		},
	},

	// ---- model and provider ----
	{
		name: "model", args: "[id|list]",
		summary: "pick a model (no id = interactive picker)",
		detail: "The picker fetches the provider's live catalog, so it is always current. Your " +
			"choice is saved as the default for new repos.",
		examples: []example{
			{"/model", "browse and filter the catalog"},
			{"/model anthropic/claude-sonnet-4.5", "set one directly"},
			{"/model list", "print the catalog to the screen"},
		},
	},
	{
		name: "models", args: "[filter]",
		summary: "list the provider's models",
		examples: []example{
			{"/models", "print the whole catalog"},
			{"/models free", "only ids containing 'free'"},
		},
	},
	{
		name: "thinking", args: "[off|low|medium|high]",
		summary: "set the model's reasoning depth",
		detail: "Reasoning models can spend extra tokens thinking before they answer. " +
			"This sets how much: off sends nothing, low/medium/high request increasing " +
			"depth. Applied where the endpoint supports it — OpenRouter, OpenAI, and " +
			"Anthropic; other hosts are left untouched rather than risking a rejected " +
			"request.",
		guide: "Depth is a cost dial, not a quality switch: a rename needs none, an " +
			"architecture question benefits from high. The level applies to the active " +
			"client and resets on /model or /provider switches. With no argument the " +
			"current level is shown.",
		examples: []example{
			{"/thinking", "show the current level"},
			{"/thinking high", "maximum reasoning depth"},
			{"/thinking off", "back to plain replies"},
		},
	},
	{
		name: "provider", args: "[name|list]",
		summary: "switch API provider (no arg = list all)",
		detail: "Any OpenAI-compatible endpoint works: openrouter, openai, groq, together, " +
			"deepseek, mistral, ollama, fireworks, perplexity, xai, cerebras, sambanova, " +
			"huggingface, cohere, anyscale. Each keeps its own saved key.",
		examples: []example{
			{"/provider", "list all providers with their details"},
			{"/provider list", "same — show all available providers"},
			{"/provider groq", "switch to Groq"},
		},
	},
	{
		name: "repo", args: "<path>",
		summary: "point at a different repository",
		detail:  "Everything — chat tools, the knowledge engine, skills — retargets to the new path.",
		examples: []example{
			{`/repo D:\work\other-project`, "work somewhere else without restarting"},
		},
	},
	{
		name:    "config",
		summary: "show the active configuration",
		examples: []example{
			{"/config", "model, provider, repo, scope and notes"},
		},
	},
	{
		name: "theme", args: "[default|light|highcontrast]",
		summary: "switch the colour palette",
		detail: "Three palettes ship built-in: default (for dark terminals), light (for white " +
			"backgrounds), and highcontrast (for accessibility or projectors). The choice " +
			"is saved in .kaioken/config.yaml and applies on the next start.",
		guide: "Use /theme with no argument to see what is active; give a name to switch. " +
			"Switching is instant: every style in the terminal updates immediately, so a " +
			"quick flip between default and light tells you which suits your current ambient.",
		examples: []example{
			{"/theme", "show the active theme"},
			{"/theme light", "switch and save"},
		},
	},
	{
		name:    "session",
		summary: "stats for the current session",
		detail: "Shows the active session's id, title, turn count, model, token estimates, " +
			"cost (when the provider reports it), epoch count, and lineage if forked.",
		guide: "/session is a quick health check: how long is this conversation, how much " +
			"has it cost, and how close is it to triggering compaction. Useful before a " +
			"long task to decide whether to /compact or /new first.",
		examples: []example{
			{"/session", "show stats for the current session"},
		},
	},
	{
		name: "notes", args: "[add <text>|clear]",
		summary: "steering notes injected into prompts",
		detail: "The human-in-the-loop channel. Notes are injected verbatim into every generation " +
			"prompt, so use them for the tribal knowledge the code does not state — conventions, " +
			"guardrails, 'never do X here'. This is the highest-leverage way to improve output.",
		examples: []example{
			{"/notes", "show the current notes"},
			{"/notes add Every admin mutation must be audit-logged.", "teach the generator a rule"},
			{"/notes clear", "remove them all"},
		},
	},

	// ---- knowledge engine ----
	{
		name: "wiki", args: "[xN] [force|update|retry]",
		summary: "deep multi-pass wiki",
		detail: "The main event. Pass 1 plans 8-16 sections over the whole repo; pass 2 plans each " +
			"section in detail; pass 3 writes long-form chapters plus one document per subsection. " +
			"The multiplier is the Kaioken dial: ×1 sections only, ×2 adds subsection documents, " +
			"×3 (the default) goes deep, ×4 adds a critique-and-revise pass, ×10 adds grounding " +
			"verification. An existing plan is reused so you can edit wiki_plan.yaml first.",
		examples: []example{
			{"/wiki", "the default ×3 run"},
			{"/wiki x1", "a fast, shallow pass"},
			{"/wiki x10 force", "maximum depth, re-planning from scratch"},
			{"/wiki retry", "regenerate only the sections that failed"},
			{"/wiki update", "same as /update"},
		},
	},
	{
		name: "update", args: "[base-rev]",
		summary: "git-diff refresh of the wiki and skills",
		detail: "A full wiki run is expensive; this one is not. Kaioken records the commit the wiki " +
			"reflects, diffs the repo against it — including uncommitted and untracked files — and " +
			"revises only the documents that diff invalidates, then refreshes the skills whose " +
			"sources changed. Each document is revised, not rewritten, so structure and diagrams survive.",
		examples: []example{
			{"/update", "refresh against the recorded baseline"},
			{"/update HEAD~10", "use an explicit baseline instead"},
		},
	},
	{
		name: "skills", aliases: []string{"skill"}, args: "[force|list]",
		summary: "build task guides for agents",
		detail: "Kaioken proposes the recurring tasks in your repo, then writes one SKILL.md per " +
			"task under .kaioken/skills/ — prerequisites, numbered steps naming real files, " +
			"local conventions, how to verify, and the mistakes people actually make here. The " +
			"frontmatter records which files each skill was built from, which is how /update " +
			"knows what to refresh. Build them after a wiki or card run, when there is " +
			"something to draw on.",
		examples: []example{
			{"/skills", "plan and build the set"},
			{"/skills list", "show what exists"},
			{"/skills force", "rewrite them all"},
			{"/skills add-an-api-endpoint", "rebuild just one"},
		},
	},
	{
		name: "impact", aliases: []string{"imp"}, args: "<description of the change>",
		summary: "predict what a change would touch",
		detail: "Describe a refactor in plain words and Kaioken maps its blast radius before " +
			"you edit anything: the symbols and files involved, the modules they belong to, " +
			"the wiki documents and skills that would go stale, and the tests to re-run. " +
			"Every claim is verified against the symbol index; anything the index cannot " +
			"confirm is listed separately as unverified.",
		guide: "Run it before a refactor, not after. Name the symbols you intend to touch — " +
			"the more precisely the intent names real identifiers, the sharper the " +
			"prediction. The report opens as a navigable tree: arrows move, enter folds a " +
			"group, f cycles the kind filter, and q closes it into the transcript. Each run " +
			"is saved under .kaioken/impact/ for later reference. Results are richest " +
			"after /plan, /wiki and /skills have run, but only the intent is required.",
		examples: []example{
			{"/impact rename parseArgs to parseCLIArgs", "map every caller, doc and skill a rename touches"},
			{"/impact change the return type of Load to (*Plan, error)", "gauge an interface change before committing to it"},
		},
	},
	{
		name: "research", args: "[xN] <question>",
		summary: "deep web search with a cited report",
		detail: "Answers a question from the open web: plans subquestions, searches, reads " +
			"pages, then searches again for whatever is still missing, and writes a cited " +
			"report to .kaioken/research/. The same runs power the desktop app's Deep " +
			"Search history. Needs a web-search API key (tavily, firecrawl, brave or exa) " +
			"in ~/.kaioken/config.yaml on top of the LLM key.",
		guide: "Research never reads the repository — it is for questions the code cannot " +
			"answer: library comparisons, release notes, current best practice. The " +
			"leading xN multiplier is the usual Kaioken dial: x1 is a quick look, x3 the " +
			"default, higher digs deeper at real cost in searches and model calls. Every " +
			"claim in the report cites a numbered source that was actually read. Reports " +
			"land in .kaioken/research/<slug>.md and rerunning the same question " +
			"overwrites its predecessor.",
		examples: []example{
			{"/research what changed in Go 1.24 garbage collection?", "the default ×3 run"},
			{"/research x1 is htmx still maintained?", "a quick, shallow look"},
			{"/research x5 compare tauri and electron for a Go sidecar app", "dig deeper"},
		},
	},
	{
		name: "ext", aliases: []string{"extension", "extensions"},
		args:    "[list|install|remove|update|search|trust|tools|…]",
		summary: "manage community extensions",
		detail: "Extensions are packages installed from GitHub releases into " +
			"~/.kaioken/extensions. Declarative ones contribute skills and never run " +
			"code; mcp ones declare a server process and wasm ones ship a sandboxed " +
			"plugin module whose tools the agent can call — but only after you " +
			"explicitly trust that exact version, and every call still goes through " +
			"the normal approval prompt. Installs are pinned in a lockfile by version " +
			"and archive hash.",
		guide: "Browse the community registry interactively with /ext browse (enter installs " +
			"the selection), or install directly with /ext install owner/repo — add @1.2.0 " +
			"to pin a version. Keep things current with /ext update; nothing updates " +
			"silently. An mcp or wasm extension stays inert until /ext trust <id>: mcp " +
			"trust shows the exact UNSANDBOXED command it would run, wasm trust shows the " +
			"sandboxed module and the permissions it asked for (fs:read:workspace mounts " +
			"your repo read-only; there is no network). Both require an explicit yes, and " +
			"updating an extension revokes its trust until you re-grant it. Authors: " +
			"`kaioken ext dev <path>` installs a working tree for a fast dev loop, and " +
			"`kaioken ext validate` lints it before publishing. /ext remove uninstalls; " +
			"extensions are per-user, so one install serves every repository.",
		examples: []example{
			{"/ext", "list installed extensions and their trust state"},
			{"/ext browse", "pick from the community registry and install"},
			{"/ext search git", "find community extensions about git"},
			{"/ext install alice/kaioken-git-flow", "install one from its GitHub releases"},
			{"/ext trust alice.git-flow", "review what an mcp extension would run"},
			{"/ext update", "check every extension for a newer release"},
		},
	},
	{
		name: "x", args: "[ext command [args]]",
		summary: "run a command a wasm extension contributed",
		detail: "Trusted wasm extensions may declare named commands in their manifest. " +
			"/x alone lists them; /x <ext> <command> runs one in the sandbox and prints " +
			"what it returns. The extension id may be shortened to its name part when " +
			"unambiguous.",
		guide: "Extension commands are how a plugin talks to you instead of the model: a " +
			"status report, a generated checklist, a lint summary. They run in the same " +
			"wasm sandbox as extension tools — no network, read-only workspace at most — " +
			"and only for extensions you explicitly trusted. A command may also offer a " +
			"steering message; if an agent run is active it joins the queue, otherwise it " +
			"is dropped with a note.",
		examples: []example{
			{"/x", "list available extension commands"},
			{"/x alice.git-flow status", "run git-flow's status command"},
			{"/x git-flow status", "same, short id (when unambiguous)"},
		},
	},
	{
		name: "templates", aliases: []string{"template"},
		summary: "list prompt templates (/t:<name> runs one)",
		detail: "Templates are parameterized prompts in .kaioken/templates/<name>.md. " +
			"{{placeholders}} are filled from key=value arguments; leftover words land in " +
			"{{args}}. /t:<name> expands the file and sends it as a normal chat message.",
		guide: "A template captures a request you keep retyping — \"review X for Y\", \"write " +
			"a migration for Z\" — as a versioned file the whole team shares. Write " +
			".kaioken/templates/review.md containing 'Review {{file}} focusing on {{args}}', " +
			"then /t:review file=main.go error handling sends the expanded prompt. " +
			"Placeholders left unfilled stop the send and are named, so a half-filled " +
			"prompt never reaches the model silently.",
		examples: []example{
			{"/templates", "list templates and their placeholders — then /t:<name> [key=value…] sends one"},
		},
	},
	{
		name: "serve", args: "[port]",
		summary: "browse the wiki in a browser",
		detail: "Renders .kaioken/wiki/ as a local site with sidebar navigation, search and mermaid " +
			"diagrams. Runs in the background so chat stays usable.",
		examples: []example{
			{"/serve", "start on port 7777"},
			{"/serve 8080", "pick a port"},
			{"/serve stop", "shut it down"},
		},
	},
	{
		name: "publish",
		summary: "render the wiki as a static site",
		detail: "Writes .kaioken/wiki/ out as plain HTML under .kaioken/site/ — no server, no " +
			"Kaioken needed to read it. The artifact to put on GitHub Pages or share with " +
			"teammates who just want a browser.",
		examples: []example{
			{"/publish", "write the static site to .kaioken/site/"},
		},
	},
	{
		name: "onboard",
		summary: "write the day-one ONBOARDING.md",
		detail: "Assembles ONBOARDING.md at the repo root from the wiki chapters, knowledge " +
			"cards, skills and scan inventory — the document you hand a new teammate. No LLM " +
			"calls, so it never invents anything.",
		examples: []example{
			{"/onboard", "write ONBOARDING.md"},
			{"/onboard force", "overwrite an existing guide"},
		},
	},
	{
		name: "draft", args: "[base]",
		summary: "draft the commit message + PR description",
		detail: "Reads the current diff, the repo's recent commit style and your steering " +
			"notes, and asks the model for a conventional-commit message plus a what/why/how-to-" +
			"test PR description. Advisory only — nothing is staged or committed.",
		examples: []example{
			{"/draft", "draft from the uncommitted changes"},
			{"/draft HEAD~3", "draft from everything since that commit"},
		},
	},
	{
		name: "handoff",
		summary: "write a continuation briefing for this session",
		detail: "Distills the current session into goal, decisions, state and open threads, " +
			"appends the collapsed transcript, and writes the document under .kaioken/handoffs/ " +
			"— what a teammate or a fresh agent needs to pick the work up.",
		examples: []example{
			{"/handoff", "brief the current session"},
		},
	},
	{
		name: "verify",
		summary: "run the repo's build/test gate",
		detail: "Detects the repo's own verification commands (Makefile check, go build+test, " +
			"npm test) and runs them, reporting each verdict. Ask the agent to fix whatever " +
			"fails, then verify again — the gate's word is final. The headless CLI version " +
			"(kaioken verify) adds an automatic fix loop.",
		examples: []example{
			{"/verify", "run the gate and show each verdict"},
		},
	},
	{
		name: "hook", args: "[install|remove]",
		summary: "auto-update the wiki after each commit",
		detail: "Installs a git post-commit hook running /update in the background, so documentation " +
			"never drifts. It appends a delimited block, so an existing hook is preserved.",
		examples: []example{
			{"/hook", "report whether it is installed"},
			{"/hook install", "refresh docs after every commit"},
			{"/hook remove", "take it back out"},
		},
	},
	{
		name:    "scan",
		summary: "scan the repo and print an inventory",
		detail:  "A dry run: what Kaioken sees after .gitignore and your scope excludes apply.",
		examples: []example{
			{"/scan", "file counts, sizes and the tree"},
		},
	},
	{
		name:    "plan",
		summary: "propose modules.yaml with the LLM",
		detail: "The first step of the knowledge-card pipeline. The result is meant to be edited — " +
			"module boundaries are a judgment call you should own.",
		examples: []example{
			{"/plan", "propose a module tree, then edit modules.yaml"},
		},
	},
	{
		name: "cards", aliases: []string{"generate", "gen"}, args: "[force|id]",
		summary: "generate knowledge cards",
		detail: "The other pipeline: short, dense, fixed-schema files per module (overview, " +
			"architecture, conventions, tech stack) meant as compact agent context rather than " +
			"human reading. Unchanged modules are skipped via content hashing.",
		examples: []example{
			{"/cards", "generate for every module, skipping unchanged ones"},
			{"/cards force", "rebuild everything"},
			{"/cards api/routes", "just one module"},
		},
	},
	{
		name:    "status",
		summary: "per-module freshness",
		examples: []example{
			{"/status", "which modules are up to date, changed or missing"},
		},
	},

	// ---- misc ----
	{
		name: "version", aliases: []string{"v"},
		summary: "print the Kaioken version",
		examples: []example{
			{"/version", "version, Go build and platform"},
		},
	},
	{
		name: "quit", aliases: []string{"exit", "q"},
		summary: "exit Kaioken",
		detail:  "ctrl+d does the same when nothing is running. The session is already saved.",
		examples: []example{
			{"/quit", "leave"},
		},
	},
}

// filterCommands returns the commands matching a typed prefix (without the
// leading slash), best matches first, preserving registry order within a tier.
func filterCommands(prefix string) []command {
	prefix = strings.ToLower(strings.TrimSpace(prefix))
	var strong, weak []command
	for _, c := range commands {
		switch c.matches(prefix) {
		case 2:
			strong = append(strong, c)
		case 1:
			weak = append(weak, c)
		}
	}
	return append(strong, weak...)
}
