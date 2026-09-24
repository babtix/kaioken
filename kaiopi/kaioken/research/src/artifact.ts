import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import type { Provenance } from "@kaioken/provenance";
import type { ResearchDocument, ResearchSource } from "./types.ts";

export const RESEARCH_DIR = join(KAIOKEN_DIR, "research");

export function researchDir(root: string): string {
	return join(resolve(root), RESEARCH_DIR);
}

export function documentPath(root: string, doc: ResearchDocument): string {
	return join(researchDir(root), doc.path);
}

function describeRatio(ratio: number | null): string {
	if (ratio === null) return "no citations to verify";
	return `${Math.round(ratio * 100)}% of citations grounded`;
}

/**
 * Write a research document as Markdown a person can read.
 *
 * The body is the document; the sources appendix is the receipt. Writing the
 * two together (rather than body-only, provenance-in-JSON) is deliberate:
 * a research answer whose sources are not visible beside it invites the
 * reader to trust the prose alone, which is exactly the failure this tenant
 * exists to prevent.
 */
export function renderMarkdown(doc: ResearchDocument): string {
	const lines = [
		`# ${doc.title}`,
		"",
		`> Research answer to: ${doc.question}`,
		`> Generated ${doc.generatedAt}. Every claim citing [N] was checked against`,
		`> the page as fetched; defects are listed at the bottom.`,
		"",
		doc.body.trimEnd(),
		"",
		"## Sources",
		"",
	];

	for (const source of doc.sources) {
		const badge = source.credibility ? ` [${source.credibility.badge} · ${source.credibility.score}/100]` : "";
		if (!source.fetched) {
			lines.push(`${source.number}. ${source.url}${badge} — *fetch failed: ${source.error ?? "unknown"}*`);
			continue;
		}
		lines.push(`${source.number}. [${source.title || source.url}](${source.url})${badge} — fetched ${doc.generatedAt}`);
	}

	const v = doc.verification;
	lines.push(
		"",
		"---",
		"",
		`${v.grounded} citations verified, ${v.defects.length} defects, ${describeRatio(v.groundedRatio)}.`,
	);
	for (const defect of v.defects.slice(0, 10)) {
		lines.push(`- ${defect.kind}${defect.line ? ` (line ${defect.line})` : ""}: ${defect.detail}`);
	}

	return lines.join("\n");
}

export async function writeResearchDocument(root: string, doc: ResearchDocument): Promise<string> {
	const path = documentPath(root, doc);
	await mkdir(researchDir(root), { recursive: true });
	await writeFile(path, `${renderMarkdown(doc)}\n`, "utf8");
	return path;
}

/**
 * Research documents as provenance records.
 *
 * The source of a research document is a *page*, pinned to its content at
 * fetch time — the same shape as a wiki chapter pinned to files. Staleness
 * therefore works unchanged: a page whose hash moves is stale.
 */
export function asProvenance(doc: ResearchDocument): Provenance {
	return {
		document: doc.path,
		generatedAt: doc.generatedAt,
		sources: doc.sourcesAsProvenance,
	};
}

export async function readResearchDocuments(root: string): Promise<ResearchDocument[]> {
	const out: ResearchDocument[] = [];
	let entries: string[];
	try {
		entries = await readdir(researchDir(root));
	} catch {
		return out;
	}
	for (const name of entries.filter((n) => n.endsWith(".md"))) {
		try {
			out.push(parseArtifact(await readFile(join(researchDir(root), name), "utf8"), name));
		} catch {
			// A corrupt artifact is skipped: the rest of the knowledge stays usable.
		}
	}
	return out;
}

/**
 * Recover the machine-readable parts from a written Markdown artifact.
 *
 * The body is not round-tripped into a ResearchDocument — the Markdown is the
 * artifact of record, and re-parsing prose into structure would fork the
 * truth. What consumers need (provenance, staleness) is recovered from the
 * receipt lines, which the renderer wrote deterministically.
 */
export function parseArtifact(markdown: string, fileName: string): ResearchDocument {
	const questionMatch = /^> Research answer to: (.+)$/m.exec(markdown);
	const generatedMatch = /^> Generated (.+?)\./m.exec(markdown);
	const sources: ResearchSource[] = [];

	const sourcesIdx = markdown.indexOf("\n## Sources");
	if (sourcesIdx !== -1) {
		const receipt = markdown.slice(sourcesIdx);
		for (const match of receipt.matchAll(/^(\d+)\. (.+)$/gm)) {
			const number = Number.parseInt(match[1] as string, 10);
			const rest = match[2] as string;
			const failed = /fetch failed/.test(rest);
			const url = /https?:\/\/[^\s)\]]+/.exec(rest)?.[0]?.replace(/[).,]+$/, "") ?? "";
			const title = failed ? "" : (/\[([^\]]+)\]/.exec(rest)?.[1] ?? url);
			const credMatch = /\[([^\]·]+)·\s*(\d+)\/100\]/.exec(rest);
			sources.push({
				number,
				url,
				title,
				hash: "", // not recoverable from the receipt; staleness re-fetches
				fetched: !failed,
				...(credMatch
					? {
							credibility: {
								badge: credMatch[1]?.trim() ?? "",
								score: Number.parseInt(credMatch[2] ?? "0", 10),
								tier: Number.parseInt(credMatch[2] ?? "0", 10) >= 70 ? "high" : Number.parseInt(credMatch[2] ?? "0", 10) >= 40 ? "medium" : "low",
								domainAuthority: Number.parseInt(credMatch[2] ?? "0", 10),
								factors: [],
							},
						}
					: {}),
			});
		}
	}

	return {
		question: questionMatch?.[1]?.trim() ?? "",
		path: fileName,
		title: /^# (.+)$/m.exec(markdown)?.[1]?.trim() ?? fileName,
		body: markdown,
		sources,
		generatedAt: generatedMatch?.[1]?.trim() ?? "",
		verification: { grounded: 0, cited: 0, defects: [], groundedRatio: null },
		sourcesAsProvenance: sources.filter((s) => s.fetched).map((s) => ({ path: s.url, hash: s.hash })),
	};
}
