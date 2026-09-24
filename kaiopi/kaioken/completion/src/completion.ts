/**
 * Shell auto-completion for the Kaioken root CLI (Bash, Zsh, Fish).
 *
 * This module is the single source of truth: `kaioken completion
 * --shell <bash|zsh|fish>` prints the script, and the checked-in files under
 * `kaioken/completion/` are generated from it. The test suite asserts the
 * generated scripts name every subcommand, so a new command without
 * completion fails loudly rather than silently degrading the terminal.
 *
 * Fully offline (Invariant 10): pure string building, no IO, no network.
 */

export interface KaiokenCommandSpec {
	name: string;
	description: string;
	/** Long flags (with leading `--`) accepted by the subcommand. */
	flags: string[];
}

/** Global flags accepted before or alongside any subcommand. */
export const GLOBAL_FLAGS: string[] = ["--root", "--json", "--help"];

/**
 * Every subcommand the root CLI exposes, kept in sync with `kaioken/bin.ts`.
 * `export`, `update`, `delegate`, and `merge` are thin parity aliases over
 * the graph/status/gitops implementations so each Pi slash command has a
 * headless counterpart (Step 14.1).
 */
export const KAIKEN_COMMANDS: KaiokenCommandSpec[] = [
	{ name: "scan", description: "Deterministic repo inventory and risk flags", flags: ["--progress", "--table", "--entropy", "--quarantine"] },
	{ name: "symbols", description: "Lookup symbol declaration in AST oracle", flags: [] },
	{ name: "status", description: "0-token staleness and drift report", flags: [] },
	{ name: "search", description: "BM25 lexical and structural search", flags: ["--limit", "--preview", "--explain", "--boost"] },
	{ name: "impact", description: "Predict blast radius and impact for a symbol", flags: [] },
	{ name: "verify", description: "Run native build and test verification gate", flags: [] },
	{ name: "plan", description: "Propose module decomposition plan", flags: ["--multiplier", "--budget", "--tree", "--coverage", "--lint", "--cardsort", "--split", "--merge", "--move"] },
	{ name: "cards", description: "Read and inspect knowledge cards", flags: ["--3d", "--flip", "--badge", "--dedupe", "--export"] },
	{ name: "wiki", description: "Inspect wiki chapters and verification", flags: ["--heatmap", "--validate-links", "--budget"] },
	{ name: "serve", description: "Start offline documentation preview server", flags: ["--port", "--host"] },
	{ name: "research", description: "Read grounded research documents", flags: [] },
	{ name: "skills", description: "Load and inspect procedures", flags: [] },
	{ name: "skillgen", description: "Discover repo commands", flags: [] },
	{ name: "graph", description: "Build and render knowledge dependency graph", flags: ["--format", "--write"] },
	{ name: "gitops", description: "Git hooks, diffs, and worktree operations", flags: ["--action"] },
	{ name: "evals", description: "Run groundedness evaluation suite", flags: ["--repo", "--multiplier", "--scorecard", "--ndjson"] },
	{ name: "spend", description: "Spend transparency and budget tracking", flags: ["--multiplier", "--budget", "--model", "--matrix", "--audit", "--dial", "--offline"] },
	{ name: "export", description: "Export static standalone documentation bundle", flags: [] },
	{ name: "update", description: "Report stale documents from provenance diff", flags: ["--dry"] },
	{ name: "delegate", description: "Isolate a task in a git worktree", flags: [] },
	{ name: "merge", description: "Verify a worktree then fast-forward merge", flags: [] },
	{ name: "completion", description: "Print shell auto-completion script", flags: ["--shell"] },
];

export type CompletionShell = "bash" | "zsh" | "fish";

export function commandNames(): string[] {
	return KAIKEN_COMMANDS.map((c) => c.name);
}

function flagsFor(command: string): string[] {
	const spec = KAIKEN_COMMANDS.find((c) => c.name === command);
	return [...GLOBAL_FLAGS, ...(spec?.flags ?? [])];
}

/** All flags across every command, for shells that complete flags globally. */
export function allFlags(): string[] {
	return [...new Set([...GLOBAL_FLAGS, ...KAIKEN_COMMANDS.flatMap((c) => c.flags)])];
}

export function generateBashCompletion(): string {
	const names = commandNames().join(" ");
	const cases = KAIKEN_COMMANDS.map((c) => `            ${c.name}) COMPREPLY=($(compgen -W "${flagsFor(c.name).join(" ")}" -- "$cur")) ;;`).join("\n");
	return `# Kaioken CLI completion (Bash). Generated from kaioken/completion/src/completion.ts — do not hand-edit.
# Install: kaioken completion --shell bash >> ~/.bashrc
_kaioken() {
    local cur prev cmd
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    cmd="\${COMP_WORDS[1]}"
    if [[ $COMP_CWORD -eq 1 ]]; then
        COMPREPLY=($(compgen -W "${names}" -- "$cur"))
        return 0
    fi
    case "$cmd" in
${cases}
            *) COMPREPLY=($(compgen -W "${GLOBAL_FLAGS.join(" ")}" -- "$cur")) ;;
    esac
}
complete -F _kaioken kaioken
`;
}

export function generateZshCompletion(): string {
	const cases = KAIKEN_COMMANDS.map(
		(c) => `        '${c.name}:${c.description}'`,
	).join("\n");
	const flagArgs = KAIKEN_COMMANDS.map(
		(c) => `            ${c.name}) _arguments ${flagsFor(c.name).map((f) => `'${f}[kaioken ${c.name} option]'`).join(" ")} ;;`,
	).join("\n");
	return `#compdef kaioken
# Kaioken CLI completion (Zsh). Generated from kaioken/completion/src/completion.ts — do not hand-edit.
# Install: kaioken completion --shell zsh > ~/.zsh/completions/_kaioken
_kaioken() {
    local -a commands
    commands=(
${cases}
    )
    if (( CURRENT == 2 )); then
        _describe 'kaioken command' commands
        return
    fi
    case "$words[2]" in
${flagArgs}
    esac
}
_kaioken
`;
}

export function generateFishCompletion(): string {
	const cmds = KAIKEN_COMMANDS.map(
		(c) => `complete -c kaioken -n __fish_use_subcommand -f -a ${c.name} -d '${c.description}'`,
	).join("\n");
	const flags = KAIKEN_COMMANDS.flatMap((c) =>
		flagsFor(c.name).map((f) => {
			const bare = f.replace(/^--/, "");
			return `complete -c kaioken -n '__fish_seen_subcommand_from ${c.name}' -l ${bare}`;
		}),
	).join("\n");
	return `# Kaioken CLI completion (Fish). Generated from kaioken/completion/src/completion.ts — do not hand-edit.
# Install: kaioken completion --shell fish > ~/.config/fish/completions/kaioken.fish
${cmds}
${flags}
`;
}

/** Fail-soft on unknown shells: name the valid choices instead of throwing a stack. */
export function generateCompletion(shell: string): string {
	const normalized = shell.trim().toLowerCase();
	if (normalized === "bash") return generateBashCompletion();
	if (normalized === "zsh") return generateZshCompletion();
	if (normalized === "fish") return generateFishCompletion();
	throw new Error(`Unknown shell "${shell}". Expected one of: bash, zsh, fish.`);
}
