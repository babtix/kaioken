import type { IndexResult, SymbolOracle } from "@kaioken/index";
import { type Depth, depthFor, type ModelClient } from "@kaioken/model";
import type { FileRecord } from "@kaioken/scan";
import type {
	Chapter,
	Defect,
	Provenance,
	Section,
	VerificationReport,
	WikiDocument,
	WikiPlan,
} from "./types.js";
import { groundingDefects, verifyDocument } from "./verify.js";

/**
 * Pass three and beyond: write, then check, then repair.
 *
 * Generation is a claim. What ships is the claim plus the report of what could
 * not be confirmed — so a reader always knows which parts of a document the
 * repository actually backs.
 */

const CHAPTER_SYSTEM = `You write one chapter of a technical wiki for a repository.

You are given the chapter's goal and the declarations of every file it covers.
Write for an engineer who will work on this code tomorrow.

Rules:
- Explain what the code does and WHY it is shaped that way. A description that
  would read identically for any codebase is worthless.
- Name real declarations. Every symbol you write in backticks must appear in the
  evidence below.
- Every file path you write in backticks must appear in the evidence below.
- To quote code, open a fence whose info string is the file path, optionally
  with a line range: three backticks, then "ts path/to/file.ts:10-20". Quote it
  verbatim or do not quote it.
- Cover every exported declaration at least in passing.
- No filler, no restating the title, no "in conclusion".

Write GitHub-flavoured Markdown. Start with a single "# Title" heading.`;

const CORRECTION_SYSTEM = `You repair a wiki document against a defect report.

Each defect names something the document asserts that the repository does not
contain. Remove or correct exactly those claims. Where a declaration is listed
as uncovered, add a sentence about it using the evidence.

Change nothing else. Return the full corrected Markdown document.`;

const CRITIQUE_SYSTEM = `You revise a wiki document against a rubric.

Score it silently on: coverage of every exported declaration, accuracy against
the evidence, absence of padding, concreteness, and structural validity. Then
return a revised document that fixes the weakest of those.

Padding is a defect equal to error: cut any sentence that would read identically
for a different codebase. Return the full revised Markdown document.`;

export interface GenerateInput {
	plan: WikiPlan;
	chapter: Chapter;
	section?: Section;
	index: IndexResult | null;
	oracle: SymbolOracle;
	client: ModelClient;
	multiplier?: number;
	scanFiles: readonly FileRecord[];
	readSource: (path: string) => Promise<string | null>;
}

export async function generateDocument(input: GenerateInput): Promise<WikiDocument> {
	const depth = depthFor(input.multiplier ?? 1);
	const scope = input.section ? input.section.files : input.chapter.files;
	const knownFiles = new Set(input.scanFiles.filter((f) => !f.binary).map((f) => f.path));

	let body = await input.client.complete({
		purpose: input.section ? "wiki-section" : "wiki-chapter",
		system: CHAPTER_SYSTEM,
		prompt: buildPrompt(input, scope, depth),
		maxOutputTokens: depth.maxOutputTokens,
	});
	body = stripFences(body);

	const verify = () =>
		verifyDocument({ body, oracle: input.oracle, scope, readSource: input.readSource, knownFiles });

	let report = await verify();

	// Above the breadth threshold the dial buys scrutiny: first a critique pass
	// against the rubric, then correction against the verifier's own findings.
	for (let pass = 0; pass < depth.refinementPasses; pass++) {
		const grounding = groundingDefects(report.defects);
		const done = grounding.length === 0 && report.coverage >= 0.9 && !hasPadding(report.defects);
		if (done) break;

		const revised = await input.client.complete({
			purpose: pass === 0 && grounding.length === 0 ? "wiki-critique" : "wiki-correct",
			system: pass === 0 && grounding.length === 0 ? CRITIQUE_SYSTEM : CORRECTION_SYSTEM,
			prompt: buildRepairPrompt(input, scope, body, report, depth),
			maxOutputTokens: depth.maxOutputTokens,
		});

		const candidateBody = stripFences(revised);
		if (candidateBody.trim().length < 40) break;

		const previousBody = body;
		body = candidateBody;
		const candidateReport = await verify();

		// Only accept a revision that actually improved things. A model asked to
		// repair can make matters worse, and silently keeping the worse document
		// would defeat the point of measuring at all.
		if (score(candidateReport) <= score(report)) {
			body = previousBody;
			break;
		}
		report = candidateReport;
	}

	const provenance: Provenance = {
		document: documentPath(input.chapter, input.section),
		chapterId: input.chapter.id,
		...(input.section ? { sectionId: input.section.id } : {}),
		generatedAt: new Date().toISOString(),
		// Provenance records what the document was written FROM, keyed by content
		// hash. Phase 5 diffs these hashes to decide what a code change invalidates.
		sources: scope
			.map((path) => {
				const record = input.scanFiles.find((f) => f.path === path);
				return record ? { path, hash: record.hash } : null;
			})
			.filter((s): s is { path: string; hash: string } => s !== null),
	};

	return {
		path: provenance.document,
		chapterId: input.chapter.id,
		...(input.section ? { sectionId: input.section.id } : {}),
		title: titleOf(body, input.section?.title ?? input.chapter.title),
		body,
		provenance,
		verification: report,
	};
}

/** Higher is better: grounding failures dominate, then coverage, then padding. */
function score(report: VerificationReport): number {
	const grounding = groundingDefects(report.defects).length;
	const padding = report.defects.filter((d) => d.kind === "padding").length;
	return -grounding * 10 - padding * 2 + report.coverage * 5;
}

function hasPadding(defects: readonly Defect[]): boolean {
	return defects.some((d) => d.kind === "padding");
}

export function documentPath(chapter: Chapter, section?: Section): string {
	return section ? `${chapter.id}/${section.id}.md` : `${chapter.id}/index.md`;
}

function buildPrompt(input: GenerateInput, scope: readonly string[], depth: Depth): string {
	const byPath = new Map((input.index?.files ?? []).map((f) => [f.path, f]));

	const lines: string[] = [
		`Chapter: ${input.chapter.title}`,
		`Chapter goal: ${input.chapter.goal}`,
	];

	if (input.section) {
		lines.push(`Subsection: ${input.section.title}`, `Covers: ${input.section.summary}`);
	}

	lines.push(
		"",
		"Other chapters in this wiki (do not duplicate them):",
		...input.plan.chapters
			.filter((c) => c.id !== input.chapter.id)
			.map((c) => `- ${c.title}: ${c.goal}`),
		"",
		"Evidence — the only files and declarations you may name:",
		"",
	);

	for (const path of scope) {
		const file = byPath.get(path);
		lines.push(`--- ${path}`);
		if (!file || file.symbols.length === 0) {
			lines.push("  (no declarations indexed)");
			lines.push("");
			continue;
		}
		lines.push(`  (${file.language}, ${file.lineCount} lines)`);
		for (const symbol of file.symbols.slice(0, depth.declarationsPerFile)) {
			const owner = symbol.parent ? `${symbol.parent}.` : "";
			lines.push(
				`  ${symbol.exported ? "+" : "-"} ${owner}${symbol.name} [${symbol.startLine}-${symbol.endLine}] — ${symbol.signature}`,
			);
			if (symbol.doc) lines.push(`      ${firstLine(symbol.doc)}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

function buildRepairPrompt(
	input: GenerateInput,
	scope: readonly string[],
	body: string,
	report: VerificationReport,
	depth: Depth,
): string {
	const grounding = groundingDefects(report.defects);
	const padding = report.defects.filter((d) => d.kind === "padding");

	const lines: string[] = ["Defect report:", ""];

	for (const defect of grounding.slice(0, 30)) {
		lines.push(`- [${defect.kind}] "${defect.claim}" — ${defect.detail}`);
	}
	for (const defect of padding.slice(0, 10)) {
		lines.push(`- [padding] line ${defect.line}: ${defect.detail}`);
	}
	if (report.uncovered.length > 0) {
		lines.push(
			`- [coverage] ${Math.round(report.coverage * 100)}% of exports covered. Never mentioned: ${report.uncovered.slice(0, 30).join(", ")}`,
		);
	}

	lines.push("", buildPrompt(input, scope, depth), "", "The document to repair:", "", body);
	return lines.join("\n");
}

/** Models wrap whole documents in a fence when asked for Markdown. */
function stripFences(reply: string): string {
	const trimmed = reply.trim();
	const fenced = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
	return (fenced ? (fenced[1] as string) : trimmed).trim();
}

function titleOf(body: string, fallback: string): string {
	for (const line of body.split(/\r?\n/)) {
		const heading = /^#\s+(.*)$/.exec(line);
		if (heading) {
			const title = (heading[1] as string).trim();
			if (title) return title;
		}
	}
	return fallback;
}

function firstLine(text: string): string {
	const newline = text.indexOf("\n");
	const line = newline === -1 ? text : text.slice(0, newline);
	return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}
