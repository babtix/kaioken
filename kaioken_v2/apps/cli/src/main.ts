import { runCards } from "./commands/cards.js";
import { runChat } from "./commands/chat.js";
export { runChat } from "./commands/chat.js";
export type { ChatHooks, ChatSessionCache } from "./commands/chat.js";
import { runAgentServe } from "./commands/agent-serve.js";
import { runVerify } from "./commands/verify.js";
import { runPlan } from "./commands/plan.js";
import { runScan } from "./commands/scan.js";
import { runStatus } from "./commands/status.js";
import { runUpdate } from "./commands/update.js";
import { runSearch } from "./commands/search.js";
import { runServe } from "./commands/serve.js";
import { runSymbols } from "./commands/symbols.js";
import { runWikiCommand } from "./commands/wiki.js";
import { runGraph } from "./commands/graph.js";
import { runExport } from "./commands/export.js";
import { runResearch } from "./commands/research.js";
import { runHook } from "./commands/hook.js";
import { runInit } from "./commands/init.js";
import { runOnboard } from "./commands/onboard.js";
import { runDraft } from "./commands/draft.js";
import { runHandoff } from "./commands/handoff.js";
import { runLearn } from "./commands/learn.js";
import { runSkills } from "./commands/skills.js";
import { runImpact } from "./commands/impact.js";
import { runFetcher } from "./commands/fetcher.js";
import { runPrism } from "./commands/prism.js";
import { runExt } from "./commands/ext.js";

const USAGE = `kaioken — a repository knowledge engine

Usage: kaioken <command> [options]

Commands:
  init [force]       First-run setup: record the model, scan, index, and write
                     the AGENTS.md an agent reads before editing. Stops before
                     the expensive stages. --force rewrites an existing
                     AGENTS.md instead of refreshing its generated section.
  scan               Walk the repository, flag risky files, and build the
                     declaration inventory. Writes .kaioken/scan.json and
                     .kaioken/index.json. No network, no credentials.
  symbols <target>   Look up declarations. <target> is a file path (lists what
                     the file declares) or a symbol name (says where it is
                     declared, or that it is not).
  search <query>     Rank everything indexed against a query. Lexical ranking
                     always runs; semantic ranking joins it when an embedding
                     provider is configured.
  serve              Browse the indexed knowledge in a browser, rendered
                     locally. Nothing leaves this machine.
  plan [xN]          Propose a module tree and write .kaioken/module-plan.yaml.
                     That file is a checkpoint you edit; --check validates your
                     edits against the scan and needs no model.
  cards [xN]         Write one knowledge card per module in the plan, then
                     check every claim against the structural index.
  wiki [xN]          Outline chapters, write them and their subsections, then
                     verify every claim each one makes. --plan stops after the
                     outline; --check validates it without calling a model.
  status             Say how far the repository has moved past its
                     documentation. No model, no network. --check is the CI
                     drift gate: 0 fresh, 1 stale.
  update [xN]        Regenerate only the documents a change invalidated.
                     --dry-run reports the set without calling a model.
  chat [question]    Ask an agent that can query this engine — declarations,
                     wiki, impact and skills — instead of guessing. With no
                     question, opens a conversation. --write lets it change
                     files, one confirmation at a time.
  agent-serve        Run \`chat\` as a long-lived process speaking newline-
                     delimited JSON over stdio, for an embedder with no JS
                     boundary into this process (e.g. an editor extension).
                     Not meant to be typed by hand.
  verify             Run this repository's own build and test commands and
                     report the verdict. No model, no credentials. --dry-run
                     shows which commands were discovered without running them.
  graph              Derive the knowledge graph — which documents share ground,
                     what references what — and write .kaioken/graph.json. No
                     model, no credentials.
  export [dir]       Bundle the knowledge for use outside this machine: cards,
                     wiki documents, skills, the graph and a readable summary,
                     all plain files. Defaults to .kaioken/export.
  research <q> [xN]  Research a question against the web. Pages are fetched,
                     sanitised and numbered before the model writes; every [N]
                     citation is then verified against the page it names.
                     Needs a search provider (TAVILY_API_KEY, else DuckDuckGo).
  onboard            Assemble ONBOARDING.md at the repository root from the
                     wiki, cards, skills and scan. No model — it can only
                     restate what has already been generated.
  draft [base]       Draft the commit message and PR description for the
                     current change, in the repository's own commit style.
                     Advisory: nothing is staged or committed.
  skills [xN|list]   Propose this repository's recurring tasks and write one
                     guide per task under .kaioken/skills/. An existing skill is
                     never overwritten without --force; "list" shows what is
                     there. Paths a guide cites are checked against the scan.
  impact <change>    Predict what a described change would touch: the
                     declarations it resolves to, the files that mention them,
                     and the cards, wiki documents and skills that would go
                     stale. Every name is checked against the index first.
  prism <sub|question>
                     Retrieval over documents you import, scoped to a module:
                     new, use, drop, import, docs, or a question to ask the
                     active module. Every answer says whether a graded source
                     backs it and whether the relevance gate ran.
  ext <subcommand>   Community extensions: list, install, remove, update,
                     enable, disable, trust, search, tools, skills, run.
                     Declarative extensions contribute documents and run
                     nothing; mcp and wasm extensions install INERT and stay
                     that way until the exact installed version is trusted.
  fetcher [mode]     Choose what reads the pages research finds: auto (an API
                     reader when FIRECRAWL_API_KEY is set, else plain HTTP),
                     api, or http. Bare, it reports what the current setting
                     resolves to and whether it can run.
  handoff [session]  Distill a saved conversation into a continuation briefing —
                     goal, decisions, state, open threads — with the collapsed
                     transcript appended. Written to .kaioken/handoffs/.
  learn [session]    Turn what a session found out into a skill under
                     .kaioken/skills/. A local gate decides whether the session
                     taught anything before any model is called; --force skips
                     the gate.
  hook [install|remove|status]
                     Install a git post-commit hook that refreshes stale
                     documents in the background after every commit. The block
                     is delimited, so an existing hook script is preserved.

Options:
  --root <dir>   Repository root. Defaults to the working directory.
  --json         Emit machine-readable output instead of a summary.
  --force        Rebuild from scratch instead of reusing unchanged inputs.
  --retry        wiki only: regenerate only the documents that failed in the last run.
  --concurrency <n> wiki only: worker limit (default 4, clamped to 2 on free models).
  --exported     symbols only: list exported declarations only.
  --kind <k>     search only: restrict to wiki, card, skill or symbol
                 (comma-separated).
  --limit <n>    search only: how many results to return. Default 10.
  --port <n>     serve only: port to listen on. Default 7777.
  --check        plan/wiki only: validate the existing outline; no model calls.
  --plan         wiki only: stop after writing the outline.
  --dry-run      update/verify only: report what would run; call no model.
  --verbose      status/verify only: show more than the failures.
  --write        chat only: let the agent change files. Every change is
                 confirmed unless --yes.
  --yes          chat only: approve file changes without asking. Required for
                 --write outside a terminal.
  --verify       chat only: run the gate even when nothing was changed.
  --no-verify    chat only: skip the gate after a session that changed files.
  --module <id>  cards and skills only: regenerate one module's card, or
                   rewrite only the skill(s) whose name matches (comma-separated)
  --thinking <lvl> chat only: set reasoning depth (off, low, medium, high).
  --note <text>  Steering note for a generating command. Repeatable.
  --session <id> handoff/learn only: which saved session to read. Defaults to
                 the most recently updated one.
  --model <p/id> Provider and model, e.g. anthropic/claude-sonnet-4.5.
                 Default: .kaioken/model.json, then $KAIOKEN_MODEL. No model
                 is assumed — a generating command without one stops and says
                 so.
  -h, --help     Show this message.

The multiplier (x1..x10) is one dial for depth. At x1..x4 it buys breadth with
1 repair pass; at x5 and above it buys critique passes and additional repair passes
against grounding defects.
`;

export interface Flags {
	root: string;
	json: boolean;
	force: boolean;
	retry: boolean;
	concurrency?: number;
	exported: boolean;
	kind?: string;
	limit?: number;
	port?: number;
	check: boolean;
	planOnly: boolean;
	dryRun: boolean;
	verbose: boolean;
	write: boolean;
	yes: boolean;
	verify: boolean;
	noVerify: boolean;
	module?: string;
	model?: string;
	thinking?: string;
	multiplier?: string;
	/**
	 * Steering notes, repeatable.
	 *
	 * The TUI's `/notes` are session state, and every generating command that
	 * can honour them takes them this way rather than reading a file — the
	 * shell is the thing that knows what the user has said this session.
	 */
	note?: string[];
	/**
	 * A saved session id, for the commands that read one.
	 *
	 * The shell passes the conversation it just saved; on the command line it
	 * defaults to the most recently updated session in the repository.
	 */
	session?: string;
	positional: string[];
}

export function parseArgs(argv: string[]): Flags | null {
	const flags: Flags = {
		root: process.cwd(),
		json: false,
		force: false,
		retry: false,
		exported: false,
		check: false,
		planOnly: false,
		dryRun: false,
		verbose: false,
		write: false,
		yes: false,
		verify: false,
		noVerify: false,
		positional: [],
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] as string;
		switch (arg) {
			case "--root":
			case "-C": {
				const next = argv[++i];
				if (!next) return null;
				flags.root = next;
				break;
			}
			case "--kind": {
				const next = argv[++i];
				if (!next) return null;
				flags.kind = next;
				break;
			}
			case "--limit": {
				const next = Number.parseInt(argv[++i] ?? "", 10);
				if (!Number.isFinite(next) || next < 1) return null;
				flags.limit = next;
				break;
			}
			case "--port": {
				const next = Number.parseInt(argv[++i] ?? "", 10);
				if (!Number.isFinite(next) || next < 0 || next > 65535) return null;
				flags.port = next;
				break;
			}
			case "--module": {
				const next = argv[++i];
				if (!next) return null;
				flags.module = next;
				break;
			}
			case "--model": {
				const next = argv[++i];
				if (!next) return null;
				flags.model = next;
				break;
			}
			case "--thinking": {
				const next = argv[++i];
				if (!next) return null;
				flags.thinking = next;
				break;
			}
			case "--note": {
				const next = argv[++i];
				if (!next) return null;
				(flags.note ??= []).push(next);
				break;
			}
			case "--session": {
				const next = argv[++i];
				if (!next) return null;
				flags.session = next;
				break;
			}
			case "--check":
				flags.check = true;
				break;
			case "--plan":
				flags.planOnly = true;
				break;
			case "--dry-run":
				flags.dryRun = true;
				break;
			case "--verbose":
				flags.verbose = true;
				break;
			case "--write":
				flags.write = true;
				break;
			case "--yes":
			case "-y":
				flags.yes = true;
				break;
			case "--verify":
				flags.verify = true;
				break;
			case "--no-verify":
				flags.noVerify = true;
				break;
			case "--json":
				flags.json = true;
				break;
			case "--force":
				flags.force = true;
				break;
			case "--retry":
				flags.retry = true;
				break;
			case "--concurrency": {
				const next = Number.parseInt(argv[++i] ?? "", 10);
				if (!Number.isFinite(next) || next < 1) return null;
				flags.concurrency = next;
				break;
			}
			case "--exported":
				flags.exported = true;
				break;
			case "-h":
			case "--help":
				return null;
			default:
				if (arg.startsWith("-")) return null;
				flags.positional.push(arg);
		}
	}

	return flags;
}

export async function main(argv: string[]): Promise<number> {
	const command = argv[0];

	if (!command || command === "help" || command === "-h" || command === "--help") {
		process.stdout.write(USAGE);
		return command ? 0 : 1;
	}

	const flags = parseArgs(argv.slice(1));
	if (!flags) {
		process.stdout.write(USAGE);
		return 1;
	}

	switch (command) {
		case "scan":
			return runScan(flags);
		case "symbols":
			return runSymbols(flags);
		case "search":
			return runSearch(flags);
		case "serve":
			return runServe(flags);
		case "plan":
			return runPlan(flags);
		case "cards":
			return runCards(flags);
		case "wiki":
			return runWikiCommand(flags);
		case "status":
			return runStatus(flags);
		case "update":
			return runUpdate(flags);
		case "chat":
			return runChat(flags);
		case "agent-serve":
			return runAgentServe(flags);
		case "verify":
			return runVerify(flags);
		case "graph":
			return runGraph(flags);
		case "export":
			return runExport(flags);
		case "research":
			return runResearch(flags);
		case "init":
			return runInit(flags);
		case "hook":
			return runHook(flags);
		case "onboard":
			return runOnboard(flags);
		case "draft":
			return runDraft(flags);
		case "handoff":
			return runHandoff(flags);
		case "learn":
			return runLearn(flags);
		case "skills":
			return runSkills(flags);
		case "impact":
			return runImpact(flags);
		case "fetcher":
			return runFetcher(flags);
		case "prism":
			return runPrism(flags);
		case "ext":
			return runExt(flags);
		default:
			process.stderr.write(`kaioken: unknown command "${command}"\n\n`);
			process.stdout.write(USAGE);
			return 1;
	}
}
