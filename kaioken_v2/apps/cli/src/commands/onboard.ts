import { writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { loadSkills } from "@kaioken/agent";
import { readCards } from "@kaioken/plan";
import { readScanArtifact, scan } from "@kaioken/scan";
import { documentPath, readWikiPlan, WIKI_DIR } from "@kaioken/wiki";
import type { Flags } from "../main.js";

/**
 * `kaioken onboard` — the document you hand someone on their first day.
 *
 * Every line of it is assembled from artifacts already on disk: the wiki plan,
 * the knowledge cards, the skills, the scan. No model is called, which is the
 * point — an onboarding document that invented a build command would be worse
 * than no onboarding document, because a newcomer has no way to tell.
 *
 * A half-generated knowledge base still produces a useful guide: each section
 * that has no inputs says which command would fill it in, rather than being
 * silently omitted.
 */
export async function runOnboard(flags: Flags): Promise<number> {
	const root = resolve(flags.root);
	const body = await buildOnboarding(root);
	const path = join(root, "ONBOARDING.md");
	await writeFile(path, body, "utf8");

	if (flags.json) {
		process.stdout.write(`${JSON.stringify({ path, bytes: body.length }, null, 2)}\n`);
		return 0;
	}
	process.stdout.write(`wrote ${path}\n`);
	return 0;
}

export async function buildOnboarding(root: string): Promise<string> {
	const out: string[] = [];
	out.push(`# Onboarding — ${basename(resolve(root))}`, "");
	out.push(
		"Assembled by Kaioken from this repository's own knowledge base — no model wrote any of it.",
		"If something below looks stale, run `kaioken update` and regenerate.",
		"",
	);

	out.push(...(await readFirstSection(root)));
	out.push(...(await moduleMapSection(root)));
	out.push(...(await stackSection(root)));
	out.push(...(await taskGuideSection(root)));

	out.push(
		"## Getting help",
		"",
		"- `kaioken serve` — browse the full wiki in a browser, rendered locally",
		"- `kaioken status` — which documents still describe the code, and which have drifted",
		"- `kaioken chat` — ask an agent that queries this knowledge base instead of guessing",
		"",
	);

	return out.join("\n");
}

/**
 * The chapters to read first.
 *
 * The wiki plan is the source rather than a directory walk: the plan holds the
 * chapters in the order the outliner chose, and that order is already an
 * argument about what to read first.
 */
async function readFirstSection(root: string): Promise<string[]> {
	const out = ["## Read these first", ""];
	const plan = await readWikiPlan(root);
	const chapters = plan?.chapters ?? [];

	if (chapters.length === 0) {
		out.push("_No wiki yet — run `kaioken wiki` to generate one._", "");
		return out;
	}

	for (const chapter of chapters.slice(0, 6)) {
		const rel = `${WIKI_DIR}/${documentPath(chapter)}`.replace(/\\/g, "/");
		out.push(`- [${chapter.title}](${rel}) — ${chapter.goal}`);
	}
	out.push("");
	return out;
}

/** One line per module, from the card's own summary. */
async function moduleMapSection(root: string): Promise<string[]> {
	const out = ["## Module map", ""];
	const cards = await readCards(root);

	if (cards.length === 0) {
		out.push("_No knowledge cards yet — run `kaioken plan` then `kaioken cards`._", "");
		return out;
	}

	for (const card of [...cards].sort((a, b) => a.moduleId.localeCompare(b.moduleId))) {
		out.push(`- **${card.name}** (\`${card.moduleId}\`) — ${firstSentence(card.summary)}`);
	}
	out.push("");
	return out;
}

/**
 * What the scanner saw.
 *
 * The cached artifact is used when there is one. A fresh scan of a large
 * repository is the slowest thing this command could do, and onboarding is a
 * summary of the recorded state, not a drift check — `kaioken status` is the
 * command that exists to answer whether the record is current.
 */
async function stackSection(root: string): Promise<string[]> {
	const out = ["## Stack", ""];
	const result = (await readScanArtifact(root)) ?? (await scan(root));

	const byLanguage = new Map<string, number>();
	for (const file of result.files) {
		const language = file.language;
		byLanguage.set(language, (byLanguage.get(language) ?? 0) + 1);
	}
	const top = [...byLanguage.entries()]
		.filter(([language]) => language !== "unknown")
		.sort((a, b) => b[1] - a[1])
		.slice(0, 8);

	out.push(`${result.fileCount} files, ${formatBytes(result.totalBytes)}.`, "");
	if (top.length > 0) {
		out.push(...top.map(([language, count]) => `- ${language} — ${count} file${count === 1 ? "" : "s"}`), "");
	}

	const manifests = result.files
		.map((file) => file.path)
		.filter((path) => MANIFESTS.has(basename(path)))
		.sort();
	if (manifests.length > 0) {
		out.push(`Manifests: ${manifests.slice(0, 12).map((m) => `\`${m}\``).join(", ")}`, "");
	}
	return out;
}

/** The skills a newcomer — or an agent — can follow. */
async function taskGuideSection(root: string): Promise<string[]> {
	const { skills } = await loadSkills(root);
	if (skills.length === 0) return [];

	return [
		"## Task guides",
		"",
		...skills.map((skill) => `- \`${skill.name}\` — ${skill.description || "(no description)"}`),
		"",
	];
}

const MANIFESTS = new Set([
	"package.json",
	"go.mod",
	"Cargo.toml",
	"pyproject.toml",
	"requirements.txt",
	"pom.xml",
	"build.gradle",
	"Gemfile",
	"composer.json",
	"CMakeLists.txt",
	"Makefile",
]);

function firstSentence(text: string): string {
	const line = text.trim().split(/\r?\n/)[0] ?? "";
	const stop = /[.!?](\s|$)/.exec(line);
	if (stop) return line.slice(0, stop.index + 1);
	return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
