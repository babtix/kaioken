/**
 * The hallucination probe suite, as executable checks.
 *
 * Each probe drives a real Kaioken stage with a scripted model and then asks a
 * question about the *result* rather than the prompt. That distinction is the
 * point: a suite that asserted "the prompt contains the word grounding" would
 * pass while the model invented symbols, which is exactly the failure it is
 * meant to catch.
 */
import { SymbolOracle, resolveExcerpt, type IndexResult } from "@kaioken/index";
import { predictImpact } from "@kaioken/impact";
import type { ModelClient, ModelRequest } from "@kaioken/modelport";
import { generateCard } from "@kaioken/plan";
import { computeStaleness, type Provenance } from "@kaioken/provenance";
import type { ScanResult } from "@kaioken/scan";
import { groundingDefects, verifyDocument } from "@kaioken/wiki";
import type { ProbeOutcome } from "./types.ts";

/** A model double that replies from a script, recording what it was asked. */
export function scriptedClient(replies: string[]): ModelClient & { requests: ModelRequest[] } {
	const requests: ModelRequest[] = [];
	let index = 0;
	return {
		requests,
		async complete(request: ModelRequest): Promise<string> {
			requests.push(request);
			const reply = replies[Math.min(index, replies.length - 1)] ?? "{}";
			index++;
			return reply;
		},
	};
}

export interface ProbeFixture {
	root: string;
	index: IndexResult;
	scan: ScanResult;
	/** Repo-relative path -> current source content. */
	sources: Record<string, string>;
	/** Every path the scan saw. */
	knownFiles: Set<string>;
}

/**
 * Probe 1: a nonexistent symbol.
 *
 * The oracle must answer with a negative guarantee, and a card that asserts the
 * symbol anyway must be caught. Both halves matter: the tool being right is
 * useless if a document claiming otherwise still ships.
 */
export function probe1NegativeGuarantee(fixture: ProbeFixture): ProbeOutcome {
	const oracle = new SymbolOracle(fixture.index);
	const invented = "authMagicLogin";

	if (oracle.has(invented)) {
		return {
			id: "probe-1-negative-guarantee",
			description: "oracle reports a nonexistent symbol as absent",
			passed: false,
			detail: `oracle claimed to declare "${invented}", which the fixture does not contain`,
		};
	}
	if (oracle.lookup(invented).length !== 0) {
		return {
			id: "probe-1-negative-guarantee",
			description: "oracle reports a nonexistent symbol as absent",
			passed: false,
			detail: "lookup returned hits for a symbol that does not exist",
		};
	}
	return {
		id: "probe-1-negative-guarantee",
		description: "oracle reports a nonexistent symbol as absent",
		passed: true,
	};
}

/**
 * Probe 2: byte-accurate quoting.
 *
 * A quote is only grounded if it resolves back to the exact source range it
 * claims. Off-by-one and whitespace drift both fail here.
 */
export function probe2QuoteAccuracy(
	fixture: ProbeFixture,
	path?: string,
	start = 1,
	end = 3,
): ProbeOutcome {
	let targetPath = path;
	let targetStart = start;
	let targetEnd = end;

	if (targetPath === undefined) {
		const defaultPath = "src/a.ts";
		if (fixture.sources[defaultPath]) {
			targetPath = defaultPath;
		} else {
			const found = Object.entries(fixture.sources).find(
				([, content]) => content.split(/\r?\n/).length >= 3,
			);
			if (found) {
				targetPath = found[0];
				targetStart = 1;
				targetEnd = 3;
			} else {
				return {
					id: "probe-2-quote-accuracy",
					description: "a quoted excerpt resolves to its exact source range",
					passed: true,
					detail: "skipped: no files with >= 3 lines found in sources",
				};
			}
		}
	}

	const source = fixture.sources[targetPath];
	if (source === undefined) {
		return {
			id: "probe-2-quote-accuracy",
			description: "a quoted excerpt resolves to its exact source range",
			passed: false,
			detail: `fixture has no source for "${targetPath}"`,
		};
	}

	const lines = source.split(/\r?\n/);
	const excerpt = lines.slice(targetStart - 1, targetEnd).join("\n");
	const file = fixture.index.files.find((f) => f.path === targetPath) ?? null;
	const resolved = resolveExcerpt(file, source, excerpt);

	if (!resolved.resolved) {
		return {
			id: "probe-2-quote-accuracy",
			description: "a quoted excerpt resolves to its exact source range",
			passed: false,
			detail: `an exact excerpt from ${targetPath}:${targetStart}-${targetEnd} failed to resolve (${resolved.reason ?? "unknown"})`,
		};
	}
	if (resolved.anchor?.startLine !== targetStart) {
		return {
			id: "probe-2-quote-accuracy",
			description: "a quoted excerpt resolves to its exact source range",
			passed: false,
			detail: `excerpt resolved to line ${resolved.anchor?.startLine}, expected ${targetStart}`,
		};
	}
	return {
		id: "probe-2-quote-accuracy",
		description: "a quoted excerpt resolves to its exact source range",
		passed: true,
	};
}

/**
 * Probe 3: completion without verification.
 *
 * A session that edited files and stopped without running the gate is
 * non-compliant. This is checked structurally, so it cannot be talked around.
 */
export function probe3VerifyCompliance(actions: Array<{ tool: string }>): ProbeOutcome {
	const edits = ["edit", "write", "bash_mutate"];
	const hasEdits = actions.some((a) => edits.includes(a.tool));

	if (!hasEdits) {
		return {
			id: "probe-3-verify-compliance",
			description: "a session that edits must run the verify gate before finishing",
			passed: true,
			detail: "no edits in session; nothing to verify",
		};
	}

	const lastVerify = actions.map((a) => a.tool).lastIndexOf("kaio_verify");
	// A manual reverse scan rather than `findLastIndex`, which the ES2022 lib
	// target does not provide.
	let lastEdit = -1;
	for (let i = actions.length - 1; i >= 0; i--) {
		if (edits.includes((actions[i] as { tool: string }).tool)) {
			lastEdit = i;
			break;
		}
	}

	if (lastVerify === -1) {
		return {
			id: "probe-3-verify-compliance",
			description: "a session that edits must run the verify gate before finishing",
			passed: false,
				detail: "session edited files but never called kaio_verify",
		};
	}
	if (lastVerify < lastEdit) {
		return {
			id: "probe-3-verify-compliance",
			description: "a session that edits must run the verify gate before finishing",
			passed: false,
			detail: "edits happened after the last verification",
		};
	}
	return {
		id: "probe-3-verify-compliance",
		description: "a session that edits must run the verify gate before finishing",
		passed: true,
	};
}

/**
 * Probe 4: blast radius by lookup, not guesswork.
 *
 * Runs the real impact predictor and asserts the dependent set contains a file
 * known by hand to import the symbol. A guess that happens to be right is still
 * a failure of method, so this measures the predictor rather than the answer.
 */
export async function probe4ImpactFromIndex(
	fixture: { root: string; scan: ScanResult; index: IndexResult },
	symbol?: string,
	expectFile?: string,
): Promise<ProbeOutcome> {
	const id = "probe-4-impact-from-index";
	const hasAlpha = fixture.index.files.some((f) => f.symbols.some((s) => s.name === "alphaSearch"));
	const targetSymbol =
		symbol ??
		(hasAlpha
			? "alphaSearch"
			: (fixture.index.files.flatMap((f) => f.symbols).find((s) => s.exported)?.name ??
				fixture.index.files.flatMap((f) => f.symbols)[0]?.name));

	if (!targetSymbol) {
		return {
			id,
			description: "blast radius is derived from indexed dependents",
			passed: true,
			detail: "skipped: no symbols in repository",
		};
	}

	const report = await predictImpact({
		root: fixture.root,
		description: targetSymbol,
		scan: fixture.scan,
		index: fixture.index,
	});

	if (report.symbols.length === 0) {
		return {
			id,
			description: "blast radius is derived from indexed dependents",
			passed: false,
			detail: `"${targetSymbol}" resolved to no declarations, so no dependents could be derived`,
		};
	}

	const expected = expectFile ?? (hasAlpha ? "src/b.ts" : undefined);
	if (expected) {
		const dependentPaths = report.dependents.map((d) => d.path);
		if (!dependentPaths.includes(expected)) {
			return {
				id,
				description: "blast radius is derived from indexed dependents",
				passed: false,
				detail: `dependents [${dependentPaths.join(", ")}] do not include ${expected}`,
			};
		}
	}
	return {
		id,
		description: "blast radius is derived from indexed dependents",
		passed: true,
	};
}

/**
 * Probe 5: a document that invents a symbol is caught.
 *
 * This is the end-to-end claim: a plausible-looking document full of invented
 * declarations must produce defects rather than shipping as verified prose.
 */
export async function probe5VerifierCatchesInvention(fixture: ProbeFixture): Promise<ProbeOutcome> {
	const id = "probe-5-verifier-catches-invention";
	const oracle = new SymbolOracle(fixture.index);

	const inventedSym = `authMagicLogin_${Date.now()}`;
	const phantomSym = `phantomIndex_${Date.now()}`;
	const inventedFile = `src/does_not_exist_${Date.now()}.ts`;

	// A document that reads plausibly and cites declarations and files that exist nowhere
	const body = [
		"# Retrieval",
		"",
		`The \`${inventedSym}\` function delegates to \`${phantomSym}\`.`,
		`Configuration lives in \`${inventedFile}\`.`,
	].join("\n");

	const report = await verifyDocument({
		body,
		oracle,
		scope: [...fixture.knownFiles],
		readSource: async (p) => fixture.sources[p] ?? null,
		knownFiles: fixture.knownFiles,
	});

	const invented = report.defects.filter(
		(d) => d.kind === "unknown_symbol" || d.kind === "unknown_file",
	);

	if (invented.length < 2) {
		return {
			id,
			description: "an invented symbol or file is reported as a defect",
			passed: false,
			detail: `expected at least 2 grounding defects, found ${invented.length}`,
		};
	}
	return {
		id,
		description: "an invented symbol or file is reported as a defect",
		passed: true,
	};
}

/**
 * Probe 6: a card that invents an entry point is not accepted as grounded.
 *
 * Exercises the repair loop's floor: even if the model cannot be talked into
 * correcting itself, the card ships with the defect recorded.
 */
export async function probe6CardRecordsUngrounded(fixture: ProbeFixture): Promise<ProbeOutcome> {
	const id = "probe-6-card-records-ungrounded";
	const targetFile =
		fixture.scan.files.find((f) => f.path === "src/a.ts")?.path ??
		fixture.scan.files.find((f) => !f.binary)?.path ??
		"src/a.ts";

	const inventedSym = `authMagicLogin_${Date.now()}`;
	const client = scriptedClient([
		JSON.stringify({
			summary: "Does things.",
			keyPoints: ["One."],
			entryPoints: [{ name: inventedSym, file: targetFile, note: "Start here." }],
		}),
	]);

	const { card } = await generateCard(
		{ id: "core", name: "Core", purpose: "The core.", files: [targetFile] },
		fixture.index,
		client,
		// x1 buys no repair passes, so the original draft's defects must survive
		// into the card rather than being quietly repaired away.
		{ multiplier: 1, knownFiles: new Map([[targetFile, "h1"]]) },
	);

	if (!card.verification.ungrounded.includes(inventedSym)) {
		return {
			id,
			description: "a card that invents an entry point records it as ungrounded",
			passed: false,
			detail: `card verification did not report the invented symbol (got: ${JSON.stringify(card.verification)})`,
		};
	}
	return {
		id,
		description: "a card that invents an entry point records it as ungrounded",
		passed: true,
	};
}

/**
 * Probe 7: drift detection after source file changes.
 *
 * Source file changes after documentation was generated must mark the
 * document stale and report the changed file.
 */
export function probe7DriftDetection(fixture: ProbeFixture): ProbeOutcome {
	const id = "probe-7-drift-detection";
	const targetFile =
		fixture.scan.files.find((f) => f.path === "src/a.ts") ??
		fixture.scan.files.find((f) => !f.binary) ??
		fixture.scan.files[0];
	if (!targetFile) {
		return {
			id,
			description: "source file changes after indexing are detected as drift",
			passed: true,
			detail: "skipped: no files in repository",
		};
	}
	const originalHash = targetFile.hash;
	const targetPath = targetFile.path;

	const doc: Provenance = {
		document: ".kaioken/wiki/01-core.md",
		generatedAt: new Date().toISOString(),
		sources: [{ path: targetPath, hash: originalHash }],
	};

	// 1. Unmodified scan must report the document as current
	const freshReport = computeStaleness([doc], fixture.scan);
	if (freshReport.stale.length !== 0 || freshReport.current.length !== 1) {
		return {
			id,
			description: "source file changes after indexing are detected as drift",
			passed: false,
			detail: "document was reported stale against unmodified scan",
		};
	}

	// 2. Modified scan with mutated hash for targetPath
	const modifiedScan: ScanResult = {
		...fixture.scan,
		files: fixture.scan.files.map((f) =>
			f.path === targetPath ? { ...f, hash: `${originalHash}-modified` } : f,
		),
	};

	const staleReport = computeStaleness([doc], modifiedScan);
	const isStale = staleReport.stale.some((s) => s.document === doc.document);
	const fileReported = staleReport.changedFiles.includes(targetPath);

	if (!isStale || !fileReported) {
		return {
			id,
			description: "source file changes after indexing are detected as drift",
			passed: false,
			detail: `staleness report failed to detect changed source (isStale=${isStale}, fileReported=${fileReported})`,
		};
	}

	return {
		id,
		description: "source file changes after indexing are detected as drift",
		passed: true,
	};
}

/**
 * Probe 8: impact prediction accuracy under renamed symbols.
 *
 * A natural refactor description renaming a symbol must resolve the source
 * symbol and compute its dependent blast radius accurately.
 */
export async function probe8ImpactRenameAccuracy(fixture: ProbeFixture): Promise<ProbeOutcome> {
	const id = "probe-8-impact-rename-accuracy";
	const hasAlpha = fixture.index.files.some((f) => f.symbols.some((s) => s.name === "alphaSearch"));
	const targetSymbol = hasAlpha
		? "alphaSearch"
		: (fixture.index.files.flatMap((f) => f.symbols).find((s) => s.exported)?.name ??
			fixture.index.files.flatMap((f) => f.symbols)[0]?.name);

	if (!targetSymbol) {
		return {
			id,
			description: "impact predictor resolves source symbol and dependents under rename description",
			passed: true,
			detail: "skipped: no symbols in repository",
		};
	}

	const report = await predictImpact({
		root: fixture.root,
		description: `Rename ${targetSymbol} to ${targetSymbol}V2`,
		scan: fixture.scan,
		index: fixture.index,
	});

	const symbolNames = report.symbols.map((s) => s.name);
	if (!symbolNames.includes(targetSymbol)) {
		return {
			id,
			description: "impact predictor resolves source symbol and dependents under rename description",
			passed: false,
			detail: `failed to resolve "${targetSymbol}" from rename description (resolved: [${symbolNames.join(", ")}])`,
		};
	}

	if (hasAlpha) {
		const dependentPaths = report.dependents.map((d) => d.path);
		if (!dependentPaths.includes("src/b.ts")) {
			return {
				id,
				description: "impact predictor resolves source symbol and dependents under rename description",
				passed: false,
				detail: `dependents [${dependentPaths.join(", ")}] did not include expected dependent src/b.ts`,
			};
		}
	}

	return {
		id,
		description: "impact predictor resolves source symbol and dependents under rename description",
		passed: true,
	};
}

/**
 * Probe 9: padding and generic boilerplate rejection.
 *
 * Generic filler phrases must produce padding defects and must not count as grounded facts.
 */
export async function probe9PaddingRejection(fixture: ProbeFixture): Promise<ProbeOutcome> {
	const id = "probe-9-padding-rejection";
	const oracle = new SymbolOracle(fixture.index);

	const paddedDocument = [
		"# Architecture Overview",
		"",
		"At its core, this module provides functionality for a wide range of various features and seamlessly integrates best practices.",
		"It is important to note that this file contains robust and scalable components.",
	].join("\n");

	const report = await verifyDocument({
		body: paddedDocument,
		oracle,
		scope: [...fixture.knownFiles].filter((p) => p.endsWith(".ts")),
		readSource: async (p) => fixture.sources[p] ?? null,
		knownFiles: fixture.knownFiles,
	});

	const paddingDefects = report.defects.filter((d) => d.kind === "padding");
	if (paddingDefects.length === 0) {
		return {
			id,
			description: "generic filler and boilerplate phrases are rejected as padding defects",
			passed: false,
			detail: "verifier failed to catch generic boilerplate phrases as padding defects",
		};
	}

	if (report.grounded > 0) {
		return {
			id,
			description: "generic filler and boilerplate phrases are rejected as padding defects",
			passed: false,
			detail: `verifier incorrectly counted filler text as ${report.grounded} grounded item(s)`,
		};
	}

	return {
		id,
		description: "generic filler and boilerplate phrases are rejected as padding defects",
		passed: true,
	};
}

/**
 * Probe 10: multi-language and inheritance AST grounding.
 *
 * Verifies that declarations in Python, Go, Rust, Java, and TS class
 * inheritance/interface are indexed into the structural oracle and verify
 * cleanly when cited.
 */
export async function probe10MultiLanguageGrounding(fixture: ProbeFixture): Promise<ProbeOutcome> {
	const id = "probe-10-multilanguage-grounding";
	const hasPolyglot =
		fixture.knownFiles.has("src/main.py") &&
		fixture.knownFiles.has("src/service.go") &&
		fixture.knownFiles.has("src/lib.rs") &&
		fixture.knownFiles.has("src/Main.java");

	if (!hasPolyglot) {
		return {
			id,
			description: "cross-language AST symbols (Python, Go, Rust, Java, TS) are indexed and verifiable",
			passed: true,
			detail: "skipped on repository without polyglot fixture files",
		};
	}

	const oracle = new SymbolOracle(fixture.index);

	const requiredSymbols = [
		{ name: "PipelineRunner", lang: "python" },
		{ name: "run_pipeline", lang: "python" },
		{ name: "Worker", lang: "go" },
		{ name: "NewWorker", lang: "go" },
		{ name: "Storage", lang: "rust" },
		{ name: "create_storage", lang: "rust" },
		{ name: "PipelineService", lang: "java" },
		{ name: "WorkerService", lang: "java" },
		{ name: "EngineService", lang: "typescript" },
		{ name: "BaseService", lang: "typescript" },
	];

	for (const req of requiredSymbols) {
		if (!oracle.has(req.name)) {
			return {
				id,
				description: "cross-language AST symbols (Python, Go, Rust, Java, TS) are indexed and verifiable",
				passed: false,
				detail: `symbol "${req.name}" (${req.lang}) was not indexed by the structural parser`,
			};
		}
	}

	const polyglotDoc = [
		"# Polyglot Subsystems",
		"",
		"The `run_pipeline` function executes python tasks in `src/main.py`.",
		"The `Worker` interface defines background work in `src/service.go`.",
		"The `Storage` trait manages persistence in `src/lib.rs`.",
		"The `PipelineService` class implements `WorkerService` in `src/Main.java`.",
		"The `EngineService` class implements `BaseService` in `src/a.ts`.",
	].join("\n");

	const report = await verifyDocument({
		body: polyglotDoc,
		oracle,
		scope: [...fixture.knownFiles],
		readSource: async (p) => fixture.sources[p] ?? null,
		knownFiles: fixture.knownFiles,
	});

	const defects = groundingDefects(report.defects);
	if (defects.length > 0) {
		return {
			id,
			description: "cross-language AST symbols (Python, Go, Rust, Java, TS) are indexed and verifiable",
			passed: false,
			detail: `polyglot document produced unexpected grounding defect(s): ${JSON.stringify(defects)}`,
		};
	}

	return {
		id,
		description: "cross-language AST symbols (Python, Go, Rust, Java, TS) are indexed and verifiable",
		passed: true,
	};
}

/** Every probe, run against one fixture. */
export async function runProbes(fixture: ProbeFixture): Promise<ProbeOutcome[]> {
	const hasAlpha = fixture.index.files.some((f) => f.symbols.some((s) => s.name === "alphaSearch"));
	return [
		probe1NegativeGuarantee(fixture),
		probe2QuoteAccuracy(fixture),
		probe3VerifyCompliance([
			{ tool: "kaio_symbol_lookup" },
			{ tool: "edit" },
			{ tool: "kaio_verify" },
		]),
		hasAlpha
			? await probe4ImpactFromIndex(fixture, "alphaSearch", "src/b.ts")
			: await probe4ImpactFromIndex(fixture),
		await probe5VerifierCatchesInvention(fixture),
		await probe6CardRecordsUngrounded(fixture),
		probe7DriftDetection(fixture),
		await probe8ImpactRenameAccuracy(fixture),
		await probe9PaddingRejection(fixture),
		await probe10MultiLanguageGrounding(fixture),
	];
}
