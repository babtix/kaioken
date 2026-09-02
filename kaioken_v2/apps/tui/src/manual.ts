import { COMMANDS, filterCommands, findCommand, type Command } from "./commands.js";
import { bold, dim, fg } from "./theme.js";

/**
 * `/help`, `/tutorial` and `/explain`.
 *
 * Ported from v1's `tutorial.go` and `explain.go`. All three are built from
 * the same registry that drives the completion palette, so a command cannot
 * exist without appearing here — which is the property that keeps the manual
 * honest as commands come and go.
 *
 * `/help` is the compact reference, `/tutorial` the guided tour grouped into
 * readable chapters, `/explain` the full page for one command.
 */

const RULE_WIDTH = 52;

/** A chapter groups commands into something worth reading end to end. */
export interface Chapter {
	name: string;
	title: string;
	intro?: string;
	commands: string[];
}

export const CHAPTERS: readonly Chapter[] = [
	{
		name: "start",
		title: "Getting started",
		intro:
			"Kaioken needs an API key and a model, and nothing else. Everything is\n" +
			"stored per repo in .kaioken/, with your key kept globally in ~/.kaioken.",
		commands: ["tutorial", "explain", "help", "key", "init"],
	},
	{
		name: "chat",
		title: "Chatting and editing code",
		intro:
			"Type anything that is not a command to talk to the model. It can read,\n" +
			"search, write and edit files, and run shell commands — every change is\n" +
			"shown as a diff and applied only after you approve it.\n\n" +
			"Replies stream as they arrive and render as markdown. The composer is\n" +
			"multi-line: alt+enter (or ctrl+j) adds a newline, so pasting a stack\n" +
			"trace works.",
		commands: ["yolo", "mode", "undo", "diff", "draft", "verify", "stop", "queue", "btw"],
	},
	{
		name: "sessions",
		title: "Sessions and context",
		intro:
			"Conversations are saved per repo after every reply, so nothing is lost\n" +
			"when you quit. When a session gets long, compact it rather than losing\n" +
			"the thread.",
		commands: [
			"sessions", "session", "resume", "switch", "import", "new", "fork",
			"tree", "compact", "learn", "copy", "handoff", "cost", "clear",
		],
	},
	{
		name: "model",
		title: "Models, providers and steering",
		intro:
			"Kaioken works with any OpenAI-compatible endpoint. Notes are the most\n" +
			"valuable setting here: they are injected into every generation prompt.",
		commands: ["model", "models", "thinking", "theme", "provider", "repo", "config", "notes"],
	},
	{
		name: "knowledge",
		title: "The knowledge engine",
		intro:
			"Two pipelines read the same repo and produce different things.\n\n" +
			"  The WIKI is long-form documentation for humans and deep agent dives:\n" +
			"  planned sections, chapters of real depth, verified against the repo.\n\n" +
			"  CARDS are short, fixed-schema context blocks per module, meant to be\n" +
			"  fed to an AI agent cheaply before it touches code.\n\n" +
			"They are independent — run either, or both. Once a wiki exists, /update\n" +
			"keeps it current from the git diff instead of regenerating everything.\n\n" +
			"  PRISM is the third corpus, and the only one you fill yourself: import\n" +
			"  documents into a module and ask questions scoped to it. Its answers\n" +
			"  say whether a graded source actually backs them, so 'nothing here\n" +
			"  answers that' is a result rather than a plausible-looking guess.",
		commands: [
			"wiki", "update", "scan", "plan", "cards", "status", "graph", "impact",
			"research", "fetcher", "prism",
		],
	},
	{
		name: "skills",
		title: "Skills: teaching an agent your project",
		intro:
			"The wiki says what the code IS. A skill says how to DO something in it:\n" +
			"which files to touch, in what order, following which local conventions.\n" +
			"That is what an agent actually needs when it starts a task, and exactly\n" +
			"what a general model cannot know about your project.\n\n" +
			"Build them after a wiki or card run. They stay current through /update.\n\n" +
			"Community extensions add more skills from GitHub — installed per user,\n" +
			"available in every repo, and never executing any code.",
		commands: ["skills", "ext", "x", "templates"],
	},
	{
		name: "browse",
		title: "Browsing and automation",
		intro:
			"Reading a two-thousand-line chapter in an editor is rough; serve it\n" +
			"instead. And let a git hook keep everything fresh without you asking.",
		commands: ["serve", "publish", "onboard", "hook"],
	},
	{
		name: "misc",
		title: "Everything else",
		commands: ["version", "quit"],
	},
];

export function findChapter(name: string): Chapter | undefined {
	const needle = name.trim().toLowerCase();
	return CHAPTERS.find((chapter) => chapter.name === needle);
}

// ---- /help ----

/**
 * The compact reference, ported verbatim from v1.
 *
 * Hand-written rather than generated from the registry because it groups by
 * task and elides the rarely-used commands — `/tutorial` and `/explain` are
 * where completeness lives.
 */
export const HELP_TEXT: readonly string[] = [
	"Chat: type anything to talk to the model. It can use tools:",
	"  read_file · list_files · search · read_knowledge · write_file · edit_file · run_command",
	"  task     delegate a search to a read-only sub-agent with its own context",
	"  todo     keep a visible checklist on multi-step work",
	"  file writes, edits and commands ask for your y/n approval first.",
	"",
	"Run control:",
	"  esc / ctrl+c            stop the current task (chat turn, plan, generate, wiki, compact)",
	"  /stop                   same, as a typed command   ·   ctrl+d quits",
	"  ctrl+c (idle)           press twice to quit",
	"  ctrl+t                  cycle reasoning depth for model (3 to 7 levels)",
	"  alt+t                   toggle thinking display (show · hide)",
	"",
	"Reading the transcript:",
	"  pageup / pagedown       scroll a page   ·   home / end jump to either end",
	"  ctrl+up / ctrl+down     jump to the previous / next thing you typed",
	"  ctrl+shift+f            search the transcript  (enter next · esc close)",
	"  mouse wheel             scroll   ·   drag selects, and copies on release",
	"",
	"Composing:",
	"  alt+enter               newline without sending",
	"  up / down               recall an earlier prompt, from the first line",
	"  ctrl+w / ctrl+u         kill the last word / the whole line",
	"  tab                     complete a path, or a command's argument",
	"",
	"Session:",
	"  /sessions               list saved conversations for this repo",
	"  /resume [id]            reopen a saved conversation (no id = picker)",
	"  /new                    start a fresh session (the current one is saved)",
	"  /undo                   revert the last file write/edit the agent made (repeatable)",
	"  /diff                   show `git diff` for the repo's working tree",
	"  /cost                   token usage and call count for the active model",
	"  /compact                summarize the conversation to free up context",
	"  /learn                  distill this session into a skill + write a digest for /recall",
	"  /copy                   copy the last assistant reply to the clipboard",
	"  /reset                  alias for /new",
	"  /version                print the Kaioken version",
	"",
	"Model & provider:",
	"  /model [id]             pick a model (no id = interactive picker from provider)",
	"  /models [filter]        list provider models to the screen",
	"  /provider [name|list]   switch API provider (no arg = list all available)",
	"  /key [value]            set API key (blank = hidden prompt) — saved to ~/.kaioken",
	"  /yolo                   toggle auto-approve for edits and commands",
	"  /mode [name]            agent permission mode: build · plan · general · explore",
	"  /repo <path>            point at a different repository",
	"",
	"Knowledge engine:",
	"  /wiki [xN] [force]      DEEP wiki: global plan → per-section plans → long docs",
	"                          ×3 default (deepest) · ×2 +subsection docs · ×1 sections only",
	"  /update [<base-rev>]    INCREMENTAL: git-diff the repo against the commit the wiki",
	"                          was built from, and revise only the documents it invalidates",
	"                          (base defaults to the recorded baseline; e.g. /update HEAD~5)",
	"  /wiki retry             regenerate only the sections that failed last run",
	"  /skills [force|name]    build task guides an AI loads while working here",
	"                          (/skills list to see them; /update keeps them current)",
	"  /impact <description>   predict which files, modules, docs, skills and tests",
	"                          a proposed change touches — before editing anything",
	"  /research [xN] <q>      deep web search: plan subquestions, search, read pages,",
	"                          loop on the gaps, write a cited report to .kaioken/research/",
	"  /serve [port]           browse the wiki in a browser  ·  /serve stop",
	"  /publish                render the wiki as a static site under .kaioken/site/",
	"  /onboard [force]        write ONBOARDING.md — the day-one guide from your knowledge",
	"  /draft [base]           draft a commit message + PR description for the current diff",
	"  /handoff                write a continuation briefing for the current session",
	"  /verify                 run the repo's build/test gate and report each verdict",
	"  /hook [install|remove]  refresh the wiki automatically after every commit",
	"  /scan /plan /cards      knowledge-card pipeline   ·   /status",
	"  /notes [add <t>|clear]  steering notes injected into card prompts",
	"",
	"  /init [force]           first-run setup: config + scan + AGENTS.md for this repo",
	"  /config /clear /help /explain /quit",
];

export function helpLines(): string[] {
	return [
		...HELP_TEXT,
		"",
		dim("/tutorial explains each of these with examples · /explain goes deeper."),
	];
}

// ---- /tutorial ----

const FIRST_RUN: ReadonlyArray<readonly [string, string]> = [
	["/key", "paste your API key (hidden). Get one at openrouter.ai/keys"],
	["/model", "pick a model from the live catalog"],
	["/wiki", "generate the documentation — this is the big one"],
	["/skills", "turn it into task guides an agent can follow"],
	["/serve", "read the result in a browser"],
];

export function tutorialLines(arg: string): string[] {
	const needle = arg.trim().toLowerCase();
	if (needle === "") return tutorialOverview();
	if (needle === "all" || needle === "everything" || needle === "full") {
		return [...tutorialOverview(), ...CHAPTERS.flatMap(tutorialChapter)];
	}
	const chapter = findChapter(needle);
	if (chapter) return tutorialChapter(chapter);
	const command = findCommand(needle.replace(/^\//, ""));
	if (command) return tutorialCommand(command);
	return notFound(`no tutorial section called ${needle}`, needle, "/tutorial for the overview and chapter list");
}

function tutorialOverview(): string[] {
	const out: string[] = [
		"",
		title("KAIOKEN — a guided tour"),
		rule(),
		"",
		"Kaioken is two tools in one binary:",
		"",
		`  ${commandStyle("a coding agent")} — chat that can read, edit and run things in your repo,`,
		"  with every change gated behind a diff you approve.",
		"",
		`  ${commandStyle("a knowledge engine")} — it reads the whole repository and writes`,
		"  documentation, then keeps it current from your git history.",
		"",
		chapterStyle("First run"),
		"",
	];
	FIRST_RUN.forEach(([cmd, what], i) => {
		out.push(`  ${i + 1}. ${exampleStyle(padTo(cmd, 10))}  ${dim(what)}`);
	});
	out.push(
		"",
		dim("  After code changes, /update refreshes only what the diff touched."),
		"",
		chapterStyle("Chapters"),
		"",
	);
	for (const chapter of CHAPTERS) {
		out.push(`  ${exampleStyle(padTo(`/tutorial ${chapter.name}`, 22))}${dim(chapter.title)}`);
	}
	out.push(
		"",
		dim("  /tutorial <command>   detail on one command, e.g. /tutorial wiki"),
		dim("  /tutorial all         the entire manual"),
		dim("  /explain <command>    full reference page with workflow tips"),
		"",
		dim("Tip: press / to open the command palette — type to filter, tab to"),
		dim("complete, enter to run."),
		"",
	);
	return out;
}

function tutorialChapter(chapter: Chapter): string[] {
	const out: string[] = ["", title(chapter.title), rule()];
	if (chapter.intro) out.push("", ...chapter.intro.split("\n"));
	for (const name of chapter.commands) {
		const command = findCommand(name);
		if (command) out.push(...tutorialCommand(command));
	}
	return out;
}

function tutorialCommand(command: Command): string[] {
	const out: string[] = ["", commandStyle(header(command))];
	if (command.aliases?.length) out.push(dim(`  also: /${command.aliases.join(", /")}`));
	out.push(`  ${command.summary}`);
	if (command.detail) {
		out.push("");
		for (const line of wrapText(command.detail, 74)) out.push(`  ${dim(line)}`);
	}
	out.push(...exampleBlock(command, "  "));
	return out;
}

// ---- /explain ----

export function explainLines(arg: string): string[] {
	const needle = arg.trim().toLowerCase();
	if (needle === "") return explainOverview();
	if (needle === "all" || needle === "everything" || needle === "full") {
		return [...explainOverview(), ...COMMANDS.flatMap(explainCommand)];
	}
	const command = findCommand(needle.replace(/^\//, ""));
	if (command) return explainCommand(command);
	return notFound(`no command called ${needle}`, needle, "/explain for the full command reference");
}

/** One command's full reference page: syntax, aliases, guidance, examples. */
function explainCommand(command: Command): string[] {
	const out: string[] = ["", title(header(command)), rule()];
	if (command.aliases?.length) {
		out.push(`${label("  Aliases:  ")}${dim(`/${command.aliases.join(", /")}`)}`);
	}
	out.push(`${label("  What:     ")}${command.summary}`);
	if (command.detail) {
		out.push("", label("  Detail"));
		for (const line of wrapText(command.detail, 72)) out.push(`    ${dim(line)}`);
	}
	if (command.guide) {
		out.push("", label("  When & why"));
		for (const line of wrapText(command.guide, 72)) out.push(`    ${dim(line)}`);
	}
	if (command.examples?.length) {
		out.push("", label("  Examples"));
		out.push(...exampleBlock(command, "    ").slice(1));
	}
	return out;
}

/** The landing page: every command grouped by chapter, with its summary. */
function explainOverview(): string[] {
	const out: string[] = [
		"",
		title("KAIOKEN — command reference"),
		rule(),
		"",
		"Every command with its syntax and a one-line summary.",
		dim("/explain <command> for the full page · /explain all for everything"),
		"",
	];
	for (const chapter of CHAPTERS) {
		out.push(chapterStyle(chapter.title));
		for (const name of chapter.commands) {
			const command = findCommand(name);
			if (!command) continue;
			out.push(`  ${commandStyle(padTo(header(command), 28))}${dim(command.summary)}`);
			if (command.aliases?.length) {
				out.push(`  ${dim(padTo("", 28) + `also: /${command.aliases.join(", /")}`)}`);
			}
		}
		out.push("");
	}
	out.push(
		dim("Tip: press / to open the command palette — type to filter, tab to"),
		dim("complete, enter to run."),
		"",
	);
	return out;
}

// ---- shared ----

/**
 * Not a known page: say so, and offer near misses.
 *
 * The near misses come from the same matcher the palette uses, so "did you
 * mean" and the completion list can never disagree about what is close.
 */
function notFound(message: string, needle: string, footer: string): string[] {
	const out = [fg("error", message)];
	const near = filterCommands(needle);
	if (near.length > 0) {
		out.push(dim(`did you mean: ${near.slice(0, 6).map((c) => `/${c.name}`).join("  ")}`));
	}
	out.push(dim(footer));
	return out;
}

function exampleBlock(command: Command, indent: string): string[] {
	if (!command.examples?.length) return [];
	let width = 0;
	for (const example of command.examples) width = Math.max(width, example.cmd.length);
	return [
		"",
		...command.examples.map(
			(example) => `${indent}${exampleStyle(padTo(example.cmd, width + 2))}${dim(example.what)}`,
		),
	];
}

function header(command: Command): string {
	return command.args ? `/${command.name} ${command.args}` : `/${command.name}`;
}

const title = (text: string): string => bold(fg("accent", text));
const chapterStyle = (text: string): string => bold(fg("warn", text));
const commandStyle = (text: string): string => bold(fg("user", text));
const exampleStyle = (text: string): string => fg("ok", text);
const label = (text: string): string => bold(fg("warn", text));
const rule = (): string => dim("─".repeat(RULE_WIDTH));

/** Right-pad for column alignment. Plain text only — no escapes reach this. */
export function padTo(text: string, width: number): string {
	return text.length >= width ? `${text} ` : text + " ".repeat(width - text.length);
}

/** Break a paragraph at word boundaries. */
export function wrapText(text: string, width: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];
	const lines: string[] = [];
	let line = words[0] as string;
	for (const word of words.slice(1)) {
		if (line.length + 1 + word.length > width) {
			lines.push(line);
			line = word;
		} else {
			line += ` ${word}`;
		}
	}
	lines.push(line);
	return lines;
}
