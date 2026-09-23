import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import { parse, stringify } from "yaml";
import type { Card, Module, ModulePlan } from "./types.js";

export const MODULE_PLAN_ARTIFACT = join(KAIOKEN_DIR, "module-plan.yaml");
export const CARDS_DIR = join(KAIOKEN_DIR, "cards");

export function modulePlanPath(root: string): string {
	return join(resolve(root), MODULE_PLAN_ARTIFACT);
}

export function cardsDir(root: string): string {
	return join(resolve(root), CARDS_DIR);
}

const HEADER = `# Kaioken module plan — edit this file.
#
# This is a checkpoint, not an output. A machine's decomposition of an
# unfamiliar codebase is a hypothesis; correcting it here costs nothing, and
# correcting it after generation costs everything.
#
# Every later stage reads this file back rather than re-deriving its own view,
# so an edit here changes what gets generated. Run "kaioken plan --check" to
# validate your edits against the scan.
`;

/**
 * YAML rather than JSON because a human is expected to open it. Comments
 * survive, block scalars keep prose readable, and a diff of two plans is
 * something a reviewer can actually read.
 */
export async function writeModulePlan(root: string, plan: ModulePlan): Promise<string> {
	const path = modulePlanPath(root);
	await mkdir(dirname(path), { recursive: true });
	const body = stringify(plan, { lineWidth: 92, defaultStringType: "QUOTE_DOUBLE" });
	await writeFile(path, `${HEADER}\n${body}`, "utf8");
	return path;
}

export async function readModulePlan(root: string): Promise<ModulePlan | null> {
	let text: string;
	try {
		text = await readFile(modulePlanPath(root), "utf8");
	} catch {
		return null;
	}
	return normalisePlan(parse(text));
}

/**
 * Coerce a hand-edited document into the plan shape.
 *
 * A user editing YAML will omit fields, use a bare string where a list was
 * expected, and mistype an id. Being liberal here and strict in `validatePlan`
 * puts the complaint where it belongs: on the content, in a report the user can
 * act on, rather than on a parse error that says nothing useful.
 */
export function normalisePlan(raw: unknown): ModulePlan | null {
	if (!raw || typeof raw !== "object") return null;
	const source = raw as Record<string, unknown>;

	const modules = Array.isArray(source["modules"])
		? (source["modules"] as unknown[]).map(normaliseModule).filter((m): m is Module => m !== null)
		: [];

	return {
		version: 1,
		generatedAt: typeof source["generatedAt"] === "string" ? source["generatedAt"] : "",
		multiplier: typeof source["multiplier"] === "number" ? source["multiplier"] : 1,
		modules,
	};
}

function normaliseModule(raw: unknown): Module | null {
	if (!raw || typeof raw !== "object") return null;
	const source = raw as Record<string, unknown>;

	const id = typeof source["id"] === "string" ? source["id"].trim() : "";
	if (!id) return null;

	const files = Array.isArray(source["files"])
		? (source["files"] as unknown[])
				.filter((f): f is string => typeof f === "string")
				.map((f) => f.trim().split("\\").join("/"))
				.filter(Boolean)
		: [];

	const children = Array.isArray(source["children"])
		? (source["children"] as unknown[]).map(normaliseModule).filter((m): m is Module => m !== null)
		: [];

	return {
		id,
		name: typeof source["name"] === "string" && source["name"].trim() ? source["name"] : id,
		purpose: typeof source["purpose"] === "string" ? source["purpose"].trim() : "",
		files,
		...(children.length > 0 ? { children } : {}),
	};
}

export async function writeCard(root: string, card: Card): Promise<string> {
	const dir = cardsDir(root);
	await mkdir(dir, { recursive: true });
	const path = join(dir, `${safeFileName(card.moduleId)}.json`);
	await writeFile(path, `${JSON.stringify(card, null, 2)}\n`, "utf8");
	return path;
}

export async function readCards(root: string): Promise<Card[]> {
	let entries: string[];
	try {
		entries = await readdir(cardsDir(root));
	} catch {
		return [];
	}

	const out: Card[] = [];
	for (const name of entries.sort()) {
		if (!name.endsWith(".json")) continue;
		try {
			out.push(JSON.parse(await readFile(join(cardsDir(root), name), "utf8")) as Card);
		} catch {
			// A corrupt card is skipped rather than aborting the read: the rest
			// of the knowledge is still usable, and `cards` will rewrite it.
		}
	}
	return out;
}

/** Module ids come from a model and from users; neither may pick a path. */
/**
 * The one rule for turning a module id into a filename.
 *
 * Exported because `export` must produce the same name the card store already
 * uses: two spellings of the same card is a bundle whose own references miss.
 */
export function safeFileName(id: string): string {
	return id.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "module";
}
