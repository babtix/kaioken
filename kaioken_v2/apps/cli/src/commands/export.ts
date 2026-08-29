import { basename, join, relative, resolve } from "node:path";
import { loadSkills } from "@kaioken/agent";
import {
	buildGraph,
	graphStats,
	readWikiTree,
	renderGraphMarkdown,
	writeExportTree,
	type ExportManifest,
} from "@kaioken/graph";
import { readCards, safeFileName } from "@kaioken/plan";
import type { Flags } from "../main.js";

/**
 * Hand a repository's knowledge to something outside this machine.
 *
 * The consumer is the design constraint: another agent, a teammate, a pipeline
 * with nothing installed. So the bundle is plain files — cards as JSON, wiki
 * chapters as the Markdown a person reads, skills beside them, and the graph
 * (as JSON, and rendered as prose) tying the whole together. No kaioken, no
 * node_modules, no credentials on the receiving side.
 *
 * The graph is derived here rather than read from `.kaioken/graph.json`: an
 * export that refused to run until someone remembered `kaioken graph` would be
 * a checkpoint in the way, and one that trusted a stale cache would ship a
 * bundle that contradicts itself.
 */
export async function runExport(flags: Flags): Promise<number> {
	const root = resolve(flags.root);
	// The command name is not part of positional; the first argument, when
	// given, names the bundle directory.
	const target = flags.positional[0]
		? resolve(root, flags.positional[0])
		: join(root, ".kaioken", "export");

	const cards = await readCards(root);
	const wikiFiles = await readWikiTree(join(root, ".kaioken", "wiki"));

	// The canonical loader, not a second implementation of it. Reading the skills
	// directory here by hand is how the bundle came to carry only the flat
	// `topic.md` layout while the agent and the search index both understood
	// `topic/SKILL.md` too — an export that silently drops knowledge, and then
	// states a count, is exactly the confident wrong answer this engine exists to
	// avoid.
	const { skills: skillFiles, problems: skillProblems } = await loadSkills(root);
	for (const problem of skillProblems) {
		process.stderr.write(`kaioken export: skipped skill ${problem.path} — ${problem.reason}\n`);
	}

	if (cards.length === 0 && wikiFiles.length === 0 && skillFiles.length === 0) {
		process.stderr.write(
			"kaioken export: nothing to export — run `kaioken cards` or `kaioken wiki` first\n",
		);
		return 1;
	}

	// The graph is always derived here, never read from `.kaioken/graph.json`.
	// It used to prefer the cached file, and nothing checked whether that file
	// still described the repository — so a bundle could ship twelve chapters
	// beside a graph and a `knowledge.md` that described eight, with the
	// manifest asserting the larger number. Every input is already in hand by
	// this point, so deriving costs a pass over data that has just been read;
	// a cache that can only be wrong is not worth that.
	const records = await (await import("./status.js")).gatherProvenance(root);
	const claims: Record<string, string[]> = {};
	const titles: Record<string, string> = {};
	const paths: Record<string, string> = {};
	for (const file of wikiFiles) {
		const id = file.path.replace(/^wiki\//, "");
		claims[id] = extractCodeSpans(file.content);
		titles[id] = firstHeading(file.content) ?? id;
		paths[id] = id;
	}
	for (const card of cards) {
		claims[`card:${card.moduleId}`] = card.entryPoints.map((e) => e.file);
		titles[`card:${card.moduleId}`] = card.name;
	}

	const graph = buildGraph({
		provenance: records,
		claims,
		titles,
		paths,
		skills: skillFiles.map((s) => ({ name: s.name, path: s.path })),
		generatedAt: new Date().toISOString(),
	});

	const files: { path: string; content: string }[] = [
		// readWikiTree returns wiki-relative ids; inside the bundle they live
		// under wiki/ so the layout mirrors the repository's own.
		...wikiFiles.map((file) => ({ path: `wiki/${file.path}`, content: file.content })),
		...cards.map((card) => ({
			path: `cards/${safeFileName(card.moduleId)}.json`,
			content: `${JSON.stringify(card, null, 2)}\n`,
		})),
		// Named by the skill, not by the file it happened to live in: a
		// `migrate/SKILL.md` and a `migrate.md` are the same skill to everything
		// that reads one, and they must not land in the bundle under names that
		// disagree about that.
		...skillFiles.map((skill) => ({
			path: `skills/${skill.name.replace(/[^\w.-]+/g, "_")}.md`,
			content: skill.content,
		})),
		{ path: "graph.json", content: `${JSON.stringify(graph, null, 2)}\n` },
		{
			path: "knowledge.md",
			content: renderGraphMarkdown(graph, graphStats(graph)),
		},
	];

	const manifest: ExportManifest = {
		version: 1,
		generatedAt: new Date().toISOString(),
		repository: basename(root),
		counts: {
			cards: cards.length,
			wikiDocuments: wikiFiles.length,
			skills: skillFiles.length,
		},
	};

	let written: string[];
	try {
		written = await writeExportTree(target, files, manifest);
	} catch (error) {
		process.stderr.write(`kaioken export: ${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}

	if (flags.json) {
		process.stdout.write(`${JSON.stringify({ target: relative(root, target), files: written.length, manifest }, null, 2)}\n`);
	} else {
		process.stdout.write(
			`exported ${files.length} files to ${relative(root, target) || target}\n` +
				`  ${cards.length} cards, ${wikiFiles.length} wiki documents, ${skillFiles.length} skills\n` +
				"  the bundle is self-contained: no kaioken installation is needed to read it\n",
		);
	}
	return 0;
}

const CODE_SPAN = /`([^`\n]+)`/g;
const PATH_LIKE = /^[\w.\-/]+\.\w{1,10}$/;

function extractCodeSpans(body: string): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const match of body.matchAll(CODE_SPAN)) {
		const span = (match[1] ?? "").trim();
		if (!span || !PATH_LIKE.test(span) || seen.has(span)) continue;
		seen.add(span);
		out.push(span);
	}
	return out;
}

function firstHeading(body: string): string | null {
	for (const line of body.split(/\r?\n/)) {
		const heading = /^#\s+(.+)$/.exec(line);
		if (heading) return (heading[1] as string).trim();
	}
	return null;
}
