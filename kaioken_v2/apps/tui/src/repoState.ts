import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

/**
 * What this repository already has.
 *
 * The header answers "where am I and what am I pointed at"; it did not answer
 * the question Kaioken actually exists for — *is there any knowledge here
 * yet, and is it still true?* That is the first thing you want on opening the
 * tool and the last thing you should have to run a command to discover.
 *
 * Everything here **reads existing artifacts and nothing else**. It never
 * scans, never generates and never touches the network, because it runs on
 * every startup: a header that cost a repository walk would be a header that
 * made the tool feel slow to open.
 */
export interface RepoState {
	/** Current git branch, or a short SHA when detached. */
	branch?: string;
	/** Files in the last scan artifact. */
	files?: number;
	/** Modules in the module plan. */
	modules?: number;
	/** Symbols in the last index artifact. */
	symbols?: number;
	documents?: number;
	cards?: number;
	research?: number;
	/** Fraction of documents still matching their sources, 0..1. */
	freshness?: number;
	stale?: number;
}

/** True when nothing has been generated for this repository yet. */
export function isEmpty(state: RepoState): boolean {
	return !state.documents && !state.cards && !state.research;
}

/**
 * Read whatever is already on disk.
 *
 * Every source is optional and every failure is silent: a missing artifact is
 * the normal state of a fresh repository, not an error worth a row in the
 * header. The whole thing is one `Promise.all` — freshness included — so a
 * slow disk costs one round trip, and every artifact is read exactly once:
 * the counts and the staleness computation both work off the same reads.
 */
export async function readRepoState(root: string): Promise<RepoState> {
	// The staleness module is warmed alongside the reads it consumes, so the
	// derivation below never has to await a second round trip.
	const [stalenessModule, branch, scan, wiki, cards, index, plan, research] = await Promise.all([
		safelyOrNull(async () => import("@kaioken/provenance")),
		readBranch(root),
		safely(async () => {
			const { readScanArtifact } = await import("@kaioken/scan");
			return (await readScanArtifact(root)) ?? undefined;
		}),
		safely(async () => {
			const { readProvenance } = await import("@kaioken/wiki");
			return (await readProvenance(root)) ?? undefined;
		}),
		safely(async () => {
			const { readCards } = await import("@kaioken/plan");
			return (await readCards(root)) ?? undefined;
		}),
		safely(async () => {
			const { readIndexArtifact } = await import("@kaioken/index");
			return (await readIndexArtifact(root))?.symbolCount;
		}),
		safely(async () => {
			const { readModulePlan } = await import("@kaioken/plan");
			return (await readModulePlan(root))?.modules.length;
		}),
		safely(async () => {
			const { readResearchDocuments } = await import("@kaioken/research");
			return (await readResearchDocuments(root)).length;
		}),
	]);

	const state: RepoState = {};
	if (branch) state.branch = branch;
	if (scan !== undefined) state.files = scan.files.length;
	if (index !== undefined) state.symbols = index;
	if (plan !== undefined) state.modules = plan;
	if (wiki !== undefined) state.documents = wiki.documents.length;
	if (cards !== undefined) state.cards = cards.length;
	if (research !== undefined) state.research = research;

	const staleness = stalenessModule ? computeStalenessFrom(scan, wiki, cards, stalenessModule) : null;
	if (staleness) {
		state.freshness = staleness.freshness;
		state.stale = staleness.stale;
	}
	return state;
}

/**
 * Freshness, derived from the artifacts the caller has already read.
 *
 * `/status` re-scans on purpose — asking "has anything moved?" against a
 * cached answer would be circular. The header cannot afford that, so it
 * compares provenance against the *last* scan and is honest about being a
 * snapshot: it is a prompt to run `/status`, not a replacement for it.
 */
function computeStalenessFrom(
	scan: Awaited<ReturnType<typeof import("@kaioken/scan").readScanArtifact>> | undefined,
	wiki: Awaited<ReturnType<typeof import("@kaioken/wiki").readProvenance>> | undefined,
	cards: Awaited<ReturnType<typeof import("@kaioken/plan").readCards>> | undefined,
	module: typeof import("@kaioken/provenance"),
): { freshness: number; stale: number } | null {
	if (!scan) return null;
	const records = [];
	if (wiki) records.push(...wiki.documents);
	for (const card of cards ?? []) {
		records.push({ document: `card:${card.moduleId}`, generatedAt: card.generatedAt, sources: card.sources });
	}
	if (records.length === 0) return null;
	const result = module.computeStaleness(records, scan);
	return { freshness: result.freshness, stale: result.stale.length };
}

/**
 * The current branch, read from `.git/HEAD`.
 *
 * A file read rather than `git rev-parse`: spawning a process on every startup
 * to learn one word is a cost the header does not need to pay, and a missing
 * git is simply "no branch row" rather than an error.
 *
 * It walks up the way git itself does, because running the tool from a package
 * inside a monorepo is the normal case, and a branch row that vanishes when
 * you `cd apps/tui` is worse than no branch row at all.
 */
export async function readBranch(root: string): Promise<string | undefined> {
	// Absolute first: dirname(".") is ".", so a relative root would end the
	// walk on its first step and never look at the parent at all.
	let dir = resolve(root);
	for (let depth = 0; depth < 32; depth++) {
		const head = await readHead(join(dir, ".git"));
		if (head !== null) return parseHead(head);
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
	return undefined;
}

/**
 * `HEAD` from a `.git` that may be a directory or a file.
 *
 * A worktree and a submodule both store `.git` as a file holding `gitdir: …`,
 * pointing at the real directory elsewhere.
 */
async function readHead(gitPath: string): Promise<string | null> {
	const direct = await safelyOrNull(async () => readFile(join(gitPath, "HEAD"), "utf8"));
	if (direct) return direct;

	const pointer = await safelyOrNull(async () => readFile(gitPath, "utf8"));
	const gitdir = pointer && /^gitdir:\s*(.+)$/m.exec(pointer.trim())?.[1];
	if (!gitdir) return null;
	const resolved = isAbsolute(gitdir) ? gitdir : join(dirname(gitPath), gitdir);
	return safelyOrNull(async () => readFile(join(resolved, "HEAD"), "utf8"));
}

function parseHead(head: string): string | undefined {
	const text = head.trim();
	const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(text);
	if (ref) return ref[1];
	// Detached: the SHA itself, shortened to the length people quote.
	return /^[0-9a-f]{40}$/i.test(text) ? text.slice(0, 7) : undefined;
}

async function safely<T>(read: () => Promise<T | undefined>): Promise<T | undefined> {
	try {
		return await read();
	} catch {
		return undefined;
	}
}

async function safelyOrNull<T>(read: () => Promise<T | null>): Promise<T | null> {
	try {
		return await read();
	} catch {
		return null;
	}
}
