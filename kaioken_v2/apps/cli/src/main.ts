import { runCards } from "./commands/cards.js";
import { runChat } from "./commands/chat.js";
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

const USAGE = `kaioken — a repository knowledge engine

Usage: kaioken <command> [options]

Commands:
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

Options:
  --root <dir>   Repository root. Defaults to the working directory.
  --json         Emit machine-readable output instead of a summary.
  --force        Rebuild from scratch instead of reusing unchanged inputs.
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
  --module <id>  cards only: regenerate one module's card.
  --model <p/id> Provider and model, e.g. anthropic/claude-sonnet-4.5.
                 Defaults to $KAIOKEN_MODEL.
  -h, --help     Show this message.

The multiplier (x1..x10) is one dial for depth. Below x5 it buys breadth; above
it, it stops buying length and starts buying verification passes.
`;

export interface Flags {
	root: string;
	json: boolean;
	force: boolean;
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
	multiplier?: string;
	positional: string[];
}

export function parseArgs(argv: string[]): Flags | null {
	const flags: Flags = {
		root: process.cwd(),
		json: false,
		force: false,
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
		case "verify":
			return runVerify(flags);
		case "graph":
			return runGraph(flags);
		case "export":
			return runExport(flags);
		case "research":
			return runResearch(flags);
		default:
			process.stderr.write(`kaioken: unknown command "${command}"\n\n`);
			process.stdout.write(USAGE);
			return 1;
	}
}
