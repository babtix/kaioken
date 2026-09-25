import type { Claim, ClaimKind, DomainCategory } from "./types.ts";

const CODE_SPAN = /`([^`\n]+)`/g;
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
const PATH_LIKE = /^[A-Za-z0-9._\-/]+\.[A-Za-z0-9]{1,10}$/;
const ANCHOR = /^([A-Za-z0-9._\-/]+\.[A-Za-z0-9]{1,10}):(\d+)(?:-(\d+))?$/;
const SYMBOL_LIKE = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;

const NOT_SYMBOLS = new Set([
	"true", "false", "null", "nil", "none", "undefined",
	"string", "number", "boolean", "int", "bool", "void", "any", "object", "array", "error",
	"this", "self", "new", "return", "import", "export", "const", "let", "var",
	"if", "else", "for", "while", "async", "await", "json", "yaml", "http", "https", "npm", "git",
	"ok", "n", "x", "y",
]);

export function extractClaims(body: string): Claim[] {
	const claims: Claim[] = [];
	const lines = body.split(/\r?\n/);

	let inFence = false;
	let fenceInfo = "";
	let fenceStart = 0;
	let fenceBuffer: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		const lineNumber = i + 1;

		const fence = /^\s*(?:```|~~~)(.*)$/.exec(line);
		if (fence) {
			if (inFence) {
				const excerpt = fenceBuffer.join("\n");
				const attribution = parseFenceInfo(fenceInfo);
				if (attribution && excerpt.trim()) {
					claims.push({
						kind: "excerpt",
						text: excerpt,
						line: fenceStart,
						file: attribution.file,
						domain: "symbol_signature",
						category: "symbol_signature",
						...(attribution.startLine !== undefined ? { startLine: attribution.startLine } : {}),
						...(attribution.endLine !== undefined ? { endLine: attribution.endLine } : {}),
					});
				}
				inFence = false;
				fenceBuffer = [];
			} else {
				inFence = true;
				fenceInfo = (fence[1] ?? "").trim();
				fenceStart = lineNumber;
			}
			continue;
		}

		if (inFence) {
			fenceBuffer.push(line);
			continue;
		}

		// Extract Markdown Links: [label](target)
		for (const link of markdownLinks(line)) {
			claims.push({
				kind: "link",
				text: link.label,
				target: link.target,
				line: lineNumber,
				domain: "file_path",
				category: "file_path",
			});
		}

		// Extract Code Spans: `...`
		for (const span of codeSpans(line)) {
			const claim = classify(span, lineNumber);
			if (claim) claims.push(claim);
		}
	}

	return dedupe(claims);
}

function markdownLinks(line: string): Array<{ label: string; target: string }> {
	const out: Array<{ label: string; target: string }> = [];
	MARKDOWN_LINK.lastIndex = 0;
	for (let m = MARKDOWN_LINK.exec(line); m; m = MARKDOWN_LINK.exec(line)) {
		const label = (m[1] ?? "").trim();
		const target = (m[2] ?? "").trim();
		if (target && !target.startsWith("http://") && !target.startsWith("https://") && !target.startsWith("mailto:")) {
			out.push({ label, target });
		}
	}
	return out;
}

function codeSpans(line: string): string[] {
	const out: string[] = [];
	CODE_SPAN.lastIndex = 0;
	for (let m = CODE_SPAN.exec(line); m; m = CODE_SPAN.exec(line)) {
		const inner = (m[1] ?? "").trim();
		if (inner) out.push(inner);
	}
	return out;
}

export function classify(span: string, line: number): Claim | null {
	// 1. Line Anchor: foo.ts:10-20
	const anchor = ANCHOR.exec(span);
	if (anchor) {
		const start = Number.parseInt(anchor[2] as string, 10);
		const end = anchor[3] ? Number.parseInt(anchor[3], 10) : start;
		return {
			kind: "anchor",
			text: span,
			line,
			file: anchor[1] as string,
			startLine: start,
			endLine: end,
			domain: "symbol_signature",
			category: "symbol_signature",
		};
	}

	// 2. Command Examples: npm run build, vitest, cargo test, git status
	if (/^(?:npm|npx|pnpm|yarn|bun|cargo|go|git|vitest|make|bash|sh|tsc)\s+[A-Za-z0-9_\-./\s:]+$/.test(span)) {
		return {
			kind: "command_example",
			text: span,
			line,
			domain: "command_example",
			category: "command_example",
		};
	}

	// 3. Performance Metrics: < 50ms, 50ms, O(1), sub-millisecond, 0 allocations, p99 < 50ms
	if (
		/^(?:<|>|<=|>=|~)?\s*\d+\s*(?:ms|s|ns|μs|us|kb|mb|gb|bytes|%)\b/i.test(span) ||
		/\b(?:o\(1\)|sub-millisecond|zero-token|0-allocation|zero-allocation|p99|0 allocations)\b/i.test(span)
	) {
		return {
			kind: "perf_metric",
			text: span,
			line,
			domain: "perf_metric",
			category: "perf_metric",
		};
	}

	// 4. Historical Commit Attribution: commit 54f5f2c3, [a2da6b98]
	const commitMatch = /^(?:commit\s+)?([0-9a-f]{7,40}|head~?\d*)$/i.exec(span);
	if (commitMatch && (span.toLowerCase().startsWith("commit ") || /^[0-9a-f]{7,12}$/i.test(span))) {
		return {
			kind: "commit_quote",
			text: span,
			target: commitMatch[1],
			line,
			domain: "commit_quote",
			category: "commit_quote",
		};
	}

	// 5. Database Column / Index Citations: idx_sessions, users.id, checkpoints.session_id
	if (
		/^(?:idx_|fk_|pk_)[a-z0-9_]+$/i.test(span) ||
		/^(?:checkpoints|sessions|messages|users|tokens|runs)\.[a-z0-9_]+$/i.test(span) ||
		/^table\s+[a-z0-9_]+$/i.test(span)
	) {
		return {
			kind: "db_citation",
			text: span,
			line,
			domain: "db_citation",
			category: "db_citation",
		};
	}

	// 6. Third-Party Dependencies: @mario/pi, @earendil-works/pi-tui, vitest, tree-sitter
	if (
		/^@[a-z0-9_\-.]+\/[a-z0-9_\-.]+$/i.test(span) ||
		/^(?:tree-sitter|vitest|typescript|@biomejs\/biome|husky|esbuild|tsx|shx)$/i.test(span)
	) {
		return {
			kind: "dependency_claim",
			text: span,
			line,
			domain: "dependency_claim",
			category: "dependency_claim",
		};
	}

	// 7. Architectural Boundary: subsystem A -> subsystem B, layer boundary
	if (span.includes(" -> ") || span.includes(" => ") || span.includes("boundary:")) {
		return {
			kind: "arch_boundary",
			text: span,
			line,
			domain: "arch_boundary",
			category: "arch_boundary",
		};
	}

	// 8. API Parameter: --flag, options.fuzzyThreshold, paramName?: string
	if (
		/^--[a-z0-9_\-]+(?:=[A-Za-z0-9_]+)?$/i.test(span) ||
		/^[a-z_$][a-z0-9_$]*\?:\s*[a-z0-9_$[\]<>,|&]+$/i.test(span) ||
		/^(?:options|opts|config|input)\.[a-z0-9_$]+$/i.test(span)
	) {
		return {
			kind: "api_param",
			text: span,
			line,
			domain: "api_param",
			category: "api_param",
		};
	}

	// 9. Config Keys: compilerOptions.moduleResolution, verify.json, enforcement: strict
	if (
		/^\.[a-z0-9_\-/]+\.(?:json|yaml|yml|mjs|js|ts)$/i.test(span) ||
		/^(?:compilerOptions|moduleResolution|enforcement|minConfidence|enableFuzzyAnchor|fuzzyThreshold|workspaces|scripts)\.[a-z0-9_]+$/i.test(span) ||
		/^(?:enforcement|minConfidence|enableFuzzyAnchor|fuzzyThreshold|annotateBody):\s*[A-Za-z0-9_]+$/i.test(span)
	) {
		return {
			kind: "config_key",
			text: span,
			line,
			domain: "config_key",
			category: "config_key",
		};
	}

	// 10. File Path: src/walk.ts, kaioken/verifycore/src/types.ts
	if (PATH_LIKE.test(span) && (span.includes("/") || span.endsWith(".json") || span.endsWith(".md"))) {
		return {
			kind: "file",
			text: span,
			line,
			domain: "file_path",
			category: "file_path",
		};
	}

	// 11. Symbol: walkTree(), BasenameIndex, SymbolOracle
	const call = /^([A-Za-z_$][A-Za-z0-9_$.]*)\(\s*\)?$/.exec(span);
	const candidate = call ? (call[1] as string) : span;

	if (
		SYMBOL_LIKE.test(candidate) &&
		!NOT_SYMBOLS.has(candidate.toLowerCase()) &&
		candidate.length > 2 &&
		/[A-Z_.]/.test(candidate)
	) {
		return {
			kind: "symbol",
			text: candidate,
			line,
			domain: "symbol_signature",
			category: "symbol_signature",
		};
	}

	return null;
}

function parseFenceInfo(info: string): { file: string; startLine?: number; endLine?: number } | null {
	for (const token of info.split(/\s+/).filter(Boolean)) {
		const anchor = ANCHOR.exec(token);
		if (anchor) {
			const start = Number.parseInt(anchor[2] as string, 10);
			return {
				file: anchor[1] as string,
				startLine: start,
				endLine: anchor[3] ? Number.parseInt(anchor[3], 10) : start,
			};
		}
		if (PATH_LIKE.test(token)) return { file: token };
	}
	return null;
}

function dedupe(claims: Claim[]): Claim[] {
	const seen = new Set<string>();
	const out: Claim[] = [];
	for (const claim of claims) {
		const key = `${claim.kind}:${claim.file ?? ""}:${claim.target ?? ""}:${claim.text}:${claim.line}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(claim);
	}
	return out;
}

export interface DomainPaddingRule {
	phrase: string;
	domain: DomainCategory;
	suggestion?: string;
}

export const DOMAIN_PADDING_RULES: readonly DomainPaddingRule[] = [
	// UX-1131: code file path references in wiki chapters
	{ phrase: "this file contains necessary logic", domain: "file_path", suggestion: "cite specific file path and exported symbol" },
	{ phrase: "located somewhere in the codebase", domain: "file_path", suggestion: "provide exact repository relative path" },
	{ phrase: "file path points to the implementation", domain: "file_path", suggestion: "reference verified directory path" },
	{ phrase: "this file contains", domain: "file_path", suggestion: "list concrete functions or classes exported" },
	{ phrase: "this module provides", domain: "file_path", suggestion: "cite specific module exports and types" },
	{ phrase: "provides functionality for", domain: "file_path", suggestion: "cite specific exported functions or services" },
	{ phrase: "is responsible for handling", domain: "file_path", suggestion: "specify concrete handlers and contracts" },

	// UX-1132: symbol signature quotes in knowledge cards
	{ phrase: "this function does what it says", domain: "symbol_signature", suggestion: "quote verified signature parameters" },
	{ phrase: "signature is self-explanatory", domain: "symbol_signature", suggestion: "document input/output contract" },
	{ phrase: "standard method definition", domain: "symbol_signature", suggestion: "cite exact function signature and return type" },
	{ phrase: "this function is responsible for", domain: "symbol_signature", suggestion: "specify algorithmic action and effects" },
	{ phrase: "this class is responsible for", domain: "symbol_signature", suggestion: "detail state variables and public methods" },

	// UX-1133: API parameter documentation claims
	{ phrase: "comprehensive parameters", domain: "api_param", suggestion: "list required and optional argument names" },
	{ phrase: "accepts various parameters", domain: "api_param", suggestion: "detail parameter types and default values" },
	{ phrase: "flexible options object", domain: "api_param", suggestion: "document concrete options interface fields" },
	{ phrase: "optional configuration parameters", domain: "api_param", suggestion: "name specific option keys and types" },
	{ phrase: "appropriate arguments", domain: "api_param", suggestion: "document typed signature arguments" },

	// UX-1134: architectural boundary descriptions
	{ phrase: "clean separation of concerns", domain: "arch_boundary", suggestion: "specify subsystem dependency edges" },
	{ phrase: "architectural boundary is respected", domain: "arch_boundary", suggestion: "state permitted import directions" },
	{ phrase: "modular and extensible architecture", domain: "arch_boundary", suggestion: "name participating packages" },
	{ phrase: "follows best practices", domain: "arch_boundary", suggestion: "cite architectural invariant rules" },
	{ phrase: "robust and scalable", domain: "arch_boundary", suggestion: "describe failure boundary semantics" },
	{ phrase: "plays a crucial role", domain: "arch_boundary", suggestion: "explain dependency interaction" },
	{ phrase: "plays a vital role", domain: "arch_boundary", suggestion: "explain specific subsystem responsibilities" },
	{ phrase: "the heart of the", domain: "arch_boundary", suggestion: "name central orchestrator module" },
	{ phrase: "at its core", domain: "arch_boundary", suggestion: "cite core engine entry point" },

	// UX-1135: procedural command examples in skills
	{ phrase: "run the appropriate command", domain: "command_example", suggestion: "provide exact CLI invocation" },
	{ phrase: "execute command as needed", domain: "command_example", suggestion: "give executable terminal command" },
	{ phrase: "standard command invocation", domain: "command_example", suggestion: "specify exact script name" },
	{ phrase: "typical execution procedure", domain: "command_example", suggestion: "list ordered command steps" },
	{ phrase: "simply run the command", domain: "command_example", suggestion: "provide concrete npm/sh command" },

	// UX-1136: performance metric assertions
	{ phrase: "blazing fast performance", domain: "perf_metric", suggestion: "quote measured latency benchmark (e.g. < 50ms)" },
	{ phrase: "ultra high performance", domain: "perf_metric", suggestion: "assert verified complexity bound (e.g. O(1))" },
	{ phrase: "lightning fast speed", domain: "perf_metric", suggestion: "provide exact benchmark timing" },
	{ phrase: "optimized for maximum efficiency", domain: "perf_metric", suggestion: "assert zero-allocation or memory bound" },
	{ phrase: "super fast", domain: "perf_metric", suggestion: "state concrete throughput or response time" },
	{ phrase: "instantaneous execution", domain: "perf_metric", suggestion: "cite sub-millisecond timer record" },

	// UX-1137: configuration key citations
	{ phrase: "standard configuration options", domain: "config_key", suggestion: "cite exact config JSON key" },
	{ phrase: "various settings available", domain: "config_key", suggestion: "list supported schema settings" },
	{ phrase: "configured via standard keys", domain: "config_key", suggestion: "specify property path in verify.json" },
	{ phrase: "default configuration applies", domain: "config_key", suggestion: "document concrete default values" },
	{ phrase: "flexible configuration", domain: "config_key", suggestion: "cite specific configuration interface" },

	// UX-1138: third-party dependency claims
	{ phrase: "depends on standard libraries", domain: "dependency_claim", suggestion: "name declared package in package.json" },
	{ phrase: "various third-party packages", domain: "dependency_claim", suggestion: "list specific external dependencies" },
	{ phrase: "relies on external tooling", domain: "dependency_claim", suggestion: "name exact devDependencies" },
	{ phrase: "seamless third-party integration", domain: "dependency_claim", suggestion: "cite specific integration adapter" },
	{ phrase: "industry standard dependencies", domain: "dependency_claim", suggestion: "specify package names and semver" },

	// UX-1139: historical commit attribution quotes
	{ phrase: "historical commits were made", domain: "commit_quote", suggestion: "cite verified 7-character commit SHA" },
	{ phrase: "authored in earlier commits", domain: "commit_quote", suggestion: "provide commit hash and author reference" },
	{ phrase: "changed in previous revision", domain: "commit_quote", suggestion: "reference git revision ID" },
	{ phrase: "recent commit history shows", domain: "commit_quote", suggestion: "quote exact commit message title" },
	{ phrase: "commit history speaks for itself", domain: "commit_quote", suggestion: "cite specific commit diff" },

	// UX-1140: database column and index citations
	{ phrase: "standard database schema", domain: "db_citation", suggestion: "specify exact table and column names" },
	{ phrase: "various columns and tables", domain: "db_citation", suggestion: "name database relations and foreign keys" },
	{ phrase: "database indexes are configured", domain: "db_citation", suggestion: "cite index identifier (e.g. idx_sessions)" },
	{ phrase: "typical relational tables", domain: "db_citation", suggestion: "document table schema columns" },
	{ phrase: "standard data model", domain: "db_citation", suggestion: "cite SQLite table definitions" },

	// General filler
	{ phrase: "it is important to note", domain: "arch_boundary", suggestion: "state actionable constraint directly" },
	{ phrase: "it is worth noting", domain: "arch_boundary", suggestion: "state technical fact directly" },
	{ phrase: "it should be noted", domain: "arch_boundary", suggestion: "omit preamble" },
	{ phrase: "in conclusion", domain: "arch_boundary", suggestion: "omit summary fluff" },
	{ phrase: "in summary", domain: "arch_boundary", suggestion: "omit summary fluff" },
	{ phrase: "as we can see", domain: "arch_boundary", suggestion: "omit rhetorical filler" },
	{ phrase: "as mentioned above", domain: "arch_boundary", suggestion: "link directly to section anchor" },
	{ phrase: "as mentioned earlier", domain: "arch_boundary", suggestion: "link directly to section anchor" },
	{ phrase: "a wide range of", domain: "arch_boundary", suggestion: "list concrete items" },
	{ phrase: "various features", domain: "arch_boundary", suggestion: "enumerate specific feature IDs" },
	{ phrase: "and much more", domain: "arch_boundary", suggestion: "name remaining capabilities explicitly" },
	{ phrase: "etc.", domain: "arch_boundary", suggestion: "complete the enumeration" },
	{ phrase: "seamlessly integrates", domain: "arch_boundary", suggestion: "describe integration interface" },
	{ phrase: "powerful and flexible", domain: "arch_boundary", suggestion: "describe supported configuration options" },
	{ phrase: "various different", domain: "arch_boundary", suggestion: "list distinct options" },
	{ phrase: "leverages the power of", domain: "arch_boundary", suggestion: "state dependency usage directly" },
	{ phrase: "under the hood, this", domain: "arch_boundary", suggestion: "explain internal mechanism directly" },
	{ phrase: "at its core, this module is", domain: "arch_boundary", suggestion: "cite main entrypoint function" },
	{ phrase: "this section will discuss", domain: "arch_boundary", suggestion: "present documentation directly" },
	{ phrase: "as mentioned previously", domain: "arch_boundary", suggestion: "reference specific chapter" },
];

export interface PaddingMatch {
	phrase: string;
	line: number;
	domain: DomainCategory;
	suggestion?: string;
}

export function findPadding(body: string): PaddingMatch[] {
	const out: PaddingMatch[] = [];
	const lines = body.split(/\r?\n/);
	let inFence = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;

		if (/^\s*(?:```|~~~)/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;

		const lowered = line.toLowerCase();
		for (const rule of DOMAIN_PADDING_RULES) {
			if (lowered.includes(rule.phrase)) {
				out.push({
					phrase: rule.phrase,
					line: i + 1,
					domain: rule.domain,
					suggestion: rule.suggestion,
				});
			}
		}
	}

	return out;
}
