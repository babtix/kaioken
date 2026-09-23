import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScanResult } from "@kaioken/scan";

/**
 * AGENTS.md is written from executable sources of truth, not from prose.
 *
 * A README says what a project wishes were true; the CI workflow says what
 * actually has to pass. So the collector goes after the files that encode
 * commands and constraints — task runners, manifests, CI, linter and test
 * config, existing instruction files — and hands them to the model verbatim.
 */

/** One source file passed to the model as evidence. */
export interface Source {
	path: string;
	body: string;
	rank: number;
}

/** Config files are small; the cap is for the occasional enormous manifest. */
const PER_FILE_BYTES = 8000;
/** So a monorepo with forty CI workflows cannot crowd out the manifests. */
const TOTAL_BYTES = 60000;

/**
 * Files whose presence is high signal wherever they sit.
 *
 * The rank orders the bundle — lower is more important — and the total-byte cap
 * eats from the bottom, so what gets dropped is always the least load-bearing.
 */
const EXACT_NAMES = new Map<string, number>([
	// Existing agent instructions come first: they may encode team knowledge no
	// config file states, and the improve pass is asked to preserve it.
	["agents.md", 0],
	["claude.md", 0],
	[".cursorrules", 0],
	["copilot-instructions.md", 0],
	["opencode.json", 0],
	["contributing.md", 1],
	["readme.md", 1],

	// Task runners and package manifests: the real commands live here.
	["makefile", 2],
	["taskfile.yml", 2],
	["taskfile.yaml", 2],
	["justfile", 2],
	["package.json", 2],
	["go.mod", 2],
	["cargo.toml", 2],
	["pyproject.toml", 2],
	["gemfile", 3],
	["composer.json", 3],
	["build.gradle", 3],
	["build.gradle.kts", 3],
	["pom.xml", 3],
	["cmakelists.txt", 3],
	["mix.exs", 3],
	["deno.json", 3],
	["pnpm-workspace.yaml", 3],
	["turbo.json", 3],
	["nx.json", 3],
	["go.work", 3],

	// Quality gates. Their config states the order an agent must run them in.
	["tsconfig.json", 4],
	[".golangci.yml", 4],
	[".golangci.yaml", 4],
	["eslint.config.js", 4],
	["eslint.config.mjs", 4],
	[".eslintrc.json", 4],
	["biome.json", 4],
	["ruff.toml", 4],
	["setup.cfg", 4],
	["tox.ini", 4],
	["pytest.ini", 4],
	["jest.config.ts", 4],
	["vitest.config.ts", 4],
	["playwright.config.ts", 4],
	[".pre-commit-config.yaml", 4],

	// Runtime and deployment quirks an agent trips over.
	["dockerfile", 5],
	["docker-compose.yml", 5],
	["docker-compose.yaml", 5],
	[".env.example", 5],
	["fly.toml", 5],
	["netlify.toml", 5],
	["vercel.json", 5],
	["procfile", 5],
]);

/** Directories collected wholesale: the filenames vary, the content does not. */
const DIR_PREFIXES = new Map<string, number>([
	[".github/workflows/", 2],
	[".cursor/rules/", 0],
]);

/** Gather the evidence bundle: most important first, capped in total size. */
export async function collectSources(root: string, result: ScanResult): Promise<Source[]> {
	const ranked: Source[] = [];
	for (const file of result.files) {
		const rank = rankOf(file.path);
		if (rank === null) continue;
		ranked.push({ path: file.path, body: "", rank });
	}

	ranked.sort((a, b) => {
		if (a.rank !== b.rank) return a.rank - b.rank;
		// Shallower files win ties: a root Makefile outranks a nested one.
		const depth = segments(a.path) - segments(b.path);
		return depth !== 0 ? depth : a.path.localeCompare(b.path);
	});

	const out: Source[] = [];
	let budget = TOTAL_BYTES;
	for (const source of ranked) {
		if (budget <= 0) break;
		let body: string;
		try {
			body = await readFile(join(root, source.path), "utf8");
		} catch {
			continue;
		}
		if (body.length > PER_FILE_BYTES) body = `${body.slice(0, PER_FILE_BYTES)}\n… [truncated]\n`;
		if (body.length > budget) body = `${body.slice(0, budget)}\n… [truncated]\n`;
		budget -= body.length;
		out.push({ ...source, body });
	}
	return out;
}

/** How important is this path as evidence, or null if it is not evidence. */
function rankOf(path: string): number | null {
	const lower = path.toLowerCase();
	// Generated documentation is passed to the prompt separately, in its own
	// section, with its own instructions about not restating it.
	if (lower.startsWith(".kaioken/")) return null;

	for (const [prefix, rank] of DIR_PREFIXES) {
		if (lower.startsWith(prefix)) return rank;
	}

	const slash = lower.lastIndexOf("/");
	const base = slash === -1 ? lower : lower.slice(slash + 1);
	const exact = EXACT_NAMES.get(base);
	if (exact !== undefined) return exact;
	// README.rst, README.dev.md, and the rest of the family.
	if (base.startsWith("readme")) return 1;
	if (base === ".gitlab-ci.yml") return 2;
	return null;
}

/** Write the bundle into the prompt. */
export function renderSources(sources: readonly Source[]): string {
	return sources.map((s) => `===== ${s.path} =====\n${s.body.replace(/\n+$/, "")}\n`).join("\n");
}

function segments(path: string): number {
	let count = 0;
	for (const ch of path) if (ch === "/") count++;
	return count;
}
