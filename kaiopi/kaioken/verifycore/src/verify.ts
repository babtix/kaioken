import { resolveExcerpt, resolveRange, type SymbolOracle } from "@kaioken/index";
import { renderAuditView } from "./audit.ts";
import { BasenameIndex } from "./basename.ts";
import { extractClaims, findPadding } from "./claims.ts";
import { matchQuoteAnchorFuzzy } from "./fuzzy.ts";
import { crossValidateCitationLinks } from "./links.ts";
import { buildMechanisticRepairPrompt, enrichDefectsWithSuggestions } from "./repair.ts";
import { calculateGroundingScore } from "./scoring.ts";
import { AntiHallucinationShield } from "./shield.ts";
import type { Claim, Defect, VerificationReport } from "./types.ts";

export interface VerifyInput {
	body: string;
	oracle: SymbolOracle;
	scope: readonly string[];
	readSource: (path: string) => Promise<string | null>;
	knownFiles: ReadonlySet<string>;
	basenameIndex?: BasenameIndex;
	enableFuzzyAnchor?: boolean;
	fuzzyThreshold?: number;
	annotateBody?: boolean;
	generateAuditView?: boolean;
	currentFilePath?: string;
}

export async function verifyDocument(input: VerifyInput): Promise<VerificationReport> {
	const claims = extractClaims(input.body);
	const rawDefects: Defect[] = [];
	let grounded = 0;

	const scopeText = await readScope(input);
	const basenameIndex = input.basenameIndex ?? new BasenameIndex(input.knownFiles);

	for (const claim of claims) {
		const defect = await checkClaim(claim, input, scopeText, basenameIndex);
		if (defect) {
			rawDefects.push(defect);
		} else {
			grounded++;
		}
	}

	// UX-1181 to UX-1190: Citation link cross-validation
	const linkDefects = crossValidateCitationLinks(claims, basenameIndex, {
		currentFilePath: input.currentFilePath,
	});
	for (const ld of linkDefects) {
		// Avoid duplicate defects on the same claim
		if (!rawDefects.some((d) => d.claim === ld.claim && d.kind === ld.kind)) {
			rawDefects.push(ld);
		}
	}

	// UX-1131 to UX-1140: Domain-categorized padding and generic boilerplate detection
	const padding = findPadding(input.body);
	for (const match of padding) {
		rawDefects.push({
			kind: "padding",
			claim: match.phrase,
			line: match.line,
			domain: match.domain,
			detail: `"${match.phrase}" is generic fluff without concrete codebase facts`,
			severity: "info",
			suggestedReplacement: match.suggestion,
		});
	}

	const { uncovered, coverage } = coverageOf(input.body, input.oracle, input.scope);
	for (const name of uncovered.slice(0, 25)) {
		rawDefects.push({
			kind: "uncovered_export",
			claim: name,
			domain: "symbol_signature",
			detail: "exported declaration in scope that the document never mentions",
			severity: "info",
		});
	}

	const defects = enrichDefectsWithSuggestions(rawDefects, basenameIndex, input.oracle);
	const score = calculateGroundingScore(claims, defects, coverage, padding.length);

	const initialReport: VerificationReport = {
		grounded,
		defects,
		uncovered,
		coverage,
		groundingConfidence: score.confidenceScore,
		score,
	};

	const repairPrompt = buildMechanisticRepairPrompt(initialReport);
	const annotatedBody = input.annotateBody
		? new AntiHallucinationShield().annotateDocument(input.body, defects)
		: undefined;

	const auditView = input.generateAuditView !== false
		? renderAuditView({ ...initialReport, repairPrompt, annotatedBody }, { useAnsi: false })
		: undefined;

	return {
		...initialReport,
		repairPrompt,
		annotatedBody,
		auditView,
	};
}

async function checkClaim(
	claim: Claim,
	input: VerifyInput,
	scopeText: string,
	basenameIndex: BasenameIndex,
): Promise<Defect | null> {
	switch (claim.kind) {
		case "file": {
			const res = basenameIndex.resolve(claim.text, scopeText);
			if (res.resolved) return null;

			return {
				kind: "unknown_file",
				claim: claim.text,
				line: claim.line,
				domain: "file_path",
				detail: res.fabricatedParent
					? "the repository contains no such directory path or file"
					: "the repository contains no such file",
				severity: "critical",
			};
		}

		case "link": {
			if (!claim.target) return null;
			const hashIdx = claim.target.indexOf("#");
			const pathPart = hashIdx !== -1 ? claim.target.slice(0, hashIdx) : claim.target;
			if (!pathPart || pathPart.startsWith("#")) return null;

			const res = basenameIndex.resolve(pathPart, scopeText);
			if (res.resolved) return null;

			return {
				kind: "broken_link",
				claim: claim.target,
				line: claim.line,
				domain: "file_path",
				detail: "referenced citation file target does not exist in repository",
				severity: "critical",
			};
		}

		// UX-1106, UX-1156, UX-1166, UX-1176, UX-1186, UX-1196
		case "perf_metric": {
			const res = basenameIndex.resolveMetric(claim.text);
			if (res.resolved) return null;

			return {
				kind: "ungrounded_perf_metric",
				claim: claim.text,
				line: claim.line,
				domain: "perf_metric",
				detail: "performance metric assertion does not match known benchmark contracts",
				severity: "warning",
				suggestions: res.candidates.slice(0, 3) as string[],
				suggestedReplacement: res.candidate,
			};
		}

		// UX-1107, UX-1157, UX-1167, UX-1177, UX-1187, UX-1197
		case "config_key": {
			const res = basenameIndex.resolveConfigKey(claim.text);
			if (res.resolved) return null;

			return {
				kind: "ungrounded_config_key",
				claim: claim.text,
				line: claim.line,
				domain: "config_key",
				detail: "configuration key citation is not defined in project schemas",
				severity: "warning",
				suggestions: res.candidates.slice(0, 3) as string[],
				suggestedReplacement: res.candidate,
			};
		}

		// UX-1108, UX-1158, UX-1168, UX-1178, UX-1188, UX-1198
		case "dependency_claim": {
			const res = basenameIndex.resolveDependency(claim.text);
			if (res.resolved) return null;

			return {
				kind: "ungrounded_dependency",
				claim: claim.text,
				line: claim.line,
				domain: "dependency_claim",
				detail: "dependency is not declared in package.json or repository workspaces",
				severity: "critical",
				suggestions: res.candidates.slice(0, 3) as string[],
				suggestedReplacement: res.candidate,
			};
		}

		// UX-1109, UX-1159, UX-1169, UX-1179, UX-1189, UX-1199
		case "commit_quote": {
			const targetSha = claim.target ?? claim.text;
			const res = basenameIndex.resolveCommit(targetSha);
			if (res.resolved) return null;

			return {
				kind: "ungrounded_commit",
				claim: claim.text,
				line: claim.line,
				domain: "commit_quote",
				detail: "historical commit quote does not match repository commit history",
				severity: "warning",
				suggestions: res.candidates.slice(0, 3) as string[],
				suggestedReplacement: res.candidate,
			};
		}

		// UX-1110, UX-1160, UX-1170, UX-1180, UX-1190, UX-1200
		case "db_citation": {
			const res = basenameIndex.resolveDbEntity(claim.text);
			if (res.resolved) return null;

			return {
				kind: "ungrounded_db_citation",
				claim: claim.text,
				line: claim.line,
				domain: "db_citation",
				detail: "database column or index citation does not exist in schema definitions",
				severity: "warning",
				suggestions: res.candidates.slice(0, 3) as string[],
				suggestedReplacement: res.candidate,
			};
		}

		// UX-1133, UX-1143, UX-1153, UX-1163, UX-1173, UX-1183, UX-1193
		case "api_param": {
			const cleanParam = claim.text.replace(/^--/, "").split(/[:=]/)[0]?.trim();
			if (cleanParam && (scopeText.includes(cleanParam) || mentions(scopeText, cleanParam))) {
				return null;
			}
			return {
				kind: "unknown_parameter",
				claim: claim.text,
				line: claim.line,
				domain: "api_param",
				detail: "API parameter does not appear in referenced symbol signatures",
				severity: "warning",
			};
		}

		// UX-1134, UX-1144, UX-1154, UX-1164, UX-1174, UX-1184, UX-1194
		case "arch_boundary": {
			// Check if any referenced package or module exists
			const parts = claim.text.split(/->|=>/).map((p) => p.trim());
			let allExist = true;
			for (const p of parts) {
				if (p && !scopeText.includes(p) && !basenameIndex.hasExact(p) && !basenameIndex.hasDependency(p)) {
					allExist = false;
					break;
				}
			}
			if (allExist) return null;
			return {
				kind: "unknown_symbol",
				claim: claim.text,
				line: claim.line,
				domain: "arch_boundary",
				detail: "architectural boundary references unindexed modules or packages",
				severity: "warning",
			};
		}

		// UX-1135, UX-1145, UX-1155, UX-1165, UX-1175, UX-1185, UX-1195
		case "command_example": {
			// Command examples e.g. "npm run check:kaioken", "vitest run"
			return null;
		}

		// UX-1171, UX-1172
		case "symbol": {
			if (basenameIndex.hasExact(claim.text) || basenameIndex.resolve(claim.text).resolved) {
				return null;
			}

			for (const candidate of nameCandidates(claim.text)) {
				if (input.oracle.has(candidate)) return null;
			}
			if (appearsInSource(scopeText, claim.text)) return null;
			return {
				kind: "unknown_symbol",
				claim: claim.text,
				line: claim.line,
				domain: "symbol_signature",
				detail: "appears nowhere in the source this document was written from",
				severity: "critical",
			};
		}

		case "anchor": {
			const file = claim.file as string;
			if (!basenameIndex.hasExact(file)) {
				return {
					kind: "unknown_file",
					claim: claim.text,
					line: claim.line,
					domain: "symbol_signature",
					detail: "the repository contains no such file",
					severity: "critical",
				};
			}
			const resolved = resolveRange(
				input.oracle.file(file),
				claim.startLine ?? 1,
				claim.endLine ?? claim.startLine ?? 1,
			);
			if (resolved.resolved) return null;
			return {
				kind: "bad_anchor",
				claim: claim.text,
				line: claim.line,
				domain: "symbol_signature",
				detail:
					resolved.reason === "file_not_indexed"
						? "the file has no declaration index, so the range cannot be confirmed"
						: "the file does not have those lines",
				severity: "warning",
			};
		}

		case "excerpt": {
			const file = claim.file as string;
			if (!basenameIndex.hasExact(file)) {
				return {
					kind: "unknown_file",
					claim: file,
					line: claim.line,
					domain: "symbol_signature",
					detail: "the excerpt is attributed to a file the repository does not contain",
					severity: "critical",
				};
			}
			const source = await input.readSource(file);
			if (source === null) {
				return {
					kind: "unknown_file",
					claim: file,
					line: claim.line,
					domain: "symbol_signature",
					detail: "the attributed file could not be read",
					severity: "critical",
				};
			}

			if (input.enableFuzzyAnchor !== false) {
				const fuzzy = matchQuoteAnchorFuzzy(input.oracle.file(file), source, claim.text, {
					expectedLine: claim.startLine,
					similarityThreshold: input.fuzzyThreshold,
				});

				if (fuzzy.resolved) return null;

				if (fuzzy.reason === "file_not_indexed") {
					if (containsExcerpt(source, claim.text)) return null;
					return {
						kind: "excerpt_not_found",
						claim: firstLine(claim.text),
						line: claim.line,
						domain: "symbol_signature",
						detail: "the attributed file does not contain that text",
						severity: "warning",
					};
				}

				if (fuzzy.reason === "fuzzy_out_of_scope") {
					return {
						kind: "fuzzy_out_of_scope",
						claim: firstLine(claim.text),
						line: claim.line,
						domain: "symbol_signature",
						detail: "the quoted code does not fall within a declared AST scope boundary in this file",
						severity: "warning",
					};
				}

				return {
					kind: fuzzy.reason === "excerpt_ambiguous" ? "excerpt_ambiguous" : "excerpt_not_found",
					claim: firstLine(claim.text),
					line: claim.line,
					domain: "symbol_signature",
					detail:
						fuzzy.reason === "excerpt_ambiguous"
							? `the excerpt appears in ${fuzzy.matchCount} places, so the citation is not specific`
							: "the attributed file does not contain that text",
					severity: fuzzy.reason === "excerpt_ambiguous" ? "info" : "warning",
				};
			}

			const resolved = resolveExcerpt(input.oracle.file(file), source, claim.text);
			if (resolved.resolved) return null;

			if (resolved.reason === "file_not_indexed") {
				if (containsExcerpt(source, claim.text)) return null;
				return {
					kind: "excerpt_not_found",
					claim: firstLine(claim.text),
					line: claim.line,
					domain: "symbol_signature",
					detail: "the attributed file does not contain that text",
					severity: "warning",
				};
			}

			return {
				kind: resolved.reason === "excerpt_ambiguous" ? "excerpt_ambiguous" : "excerpt_not_found",
				claim: firstLine(claim.text),
				line: claim.line,
				domain: "symbol_signature",
				detail:
					resolved.reason === "excerpt_ambiguous"
						? `the excerpt appears in ${resolved.matchCount} places, so the citation is not specific`
						: "the attributed file does not contain that text",
				severity: resolved.reason === "excerpt_ambiguous" ? "info" : "warning",
			};
		}

		default:
			return null;
	}
}

export function coverageOf(
	body: string,
	oracle: SymbolOracle,
	scope: readonly string[],
): { uncovered: string[]; coverage: number } {
	const exported = new Set<string>();
	for (const path of scope) {
		for (const location of oracle.exported(path)) exported.add(location.symbol.name);
	}

	if (exported.size === 0) return { uncovered: [], coverage: 1 };

	const uncovered = [...exported].filter((name) => !mentions(body, name)).sort();
	return {
		uncovered,
		coverage: (exported.size - uncovered.length) / exported.size,
	};
}

async function readScope(input: VerifyInput): Promise<string> {
	const parts: string[] = [];
	for (const path of input.scope) {
		const source = await input.readSource(path);
		if (source !== null) parts.push(source);
	}
	return parts.join("\n");
}

function containsExcerpt(source: string, excerpt: string): boolean {
	const fold = (text: string) =>
		text
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line !== "")
			.join("\n");

	const needle = fold(excerpt);
	return needle !== "" && fold(source).includes(needle);
}

function appearsInSource(source: string, name: string): boolean {
	for (const candidate of nameCandidates(name)) {
		if (mentions(source, candidate)) return true;
	}
	const lowered = source.toLowerCase();
	for (const candidate of nameCandidates(name)) {
		if (mentions(lowered, candidate.toLowerCase())) return true;
	}
	return false;
}

function mentions(body: string, name: string): boolean {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`).test(body);
}

function nameCandidates(written: string): string[] {
	const out = [written];
	const dot = written.lastIndexOf(".");
	if (dot > 0 && dot < written.length - 1) out.push(written.slice(dot + 1));
	return out;
}

function firstLine(text: string): string {
	const newline = text.indexOf("\n");
	const line = newline === -1 ? text : text.slice(0, newline);
	return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

export function summariseDefects(defects: readonly Defect[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const defect of defects) out[defect.kind] = (out[defect.kind] ?? 0) + 1;
	return out;
}

export function groundingDefects(defects: readonly Defect[]): Defect[] {
	return defects.filter(
		(d) =>
			d.kind === "unknown_file" ||
			d.kind === "unknown_symbol" ||
			d.kind === "bad_anchor" ||
			d.kind === "excerpt_not_found" ||
			d.kind === "excerpt_ambiguous" ||
			d.kind === "fabricated_parent" ||
			d.kind === "fuzzy_out_of_scope" ||
			d.kind === "ungrounded_perf_metric" ||
			d.kind === "ungrounded_config_key" ||
			d.kind === "ungrounded_dependency" ||
			d.kind === "ungrounded_commit" ||
			d.kind === "ungrounded_db_citation" ||
			d.kind === "broken_link",
	);
}
