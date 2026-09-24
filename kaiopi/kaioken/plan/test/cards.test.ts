import { describe, expect, it } from "vitest";
import { SymbolOracle, type IndexResult } from "@kaioken/index";
import type { ModelClient, ModelRequest } from "@kaioken/modelport";
import {
	buildCardPrompt,
	formatCardBadge,
	formatCitationDensityGauge,
	generateCard,
	generateCards,
	isCardSymbolStale,
	renderCard3D,
	renderCardPair,
	updateCardsIncrementally,
	verifyCard,
} from "../src/cards.ts";
import type { Module, ModulePlan } from "../src/types.ts";
import type { ModuleEvidence } from "../src/evidence.ts";

function scriptedClient(replies: string[]): ModelClient & { requests: ModelRequest[] } {
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

function indexOf(
	files: Array<{ path: string; symbols?: Array<{ name: string; exported?: boolean; parent?: string }> }>,
): IndexResult {
	return {
		root: "/repo",
		builtAt: "",
		fileCount: files.length,
		symbolCount: files.reduce((n, f) => n + (f.symbols?.length ?? 0), 0),
		unparsedLanguages: {},
		files: files.map((f) => ({
			path: f.path,
			language: "typescript",
			lineCount: 10,
			hash: `hash-${f.path}`,
			symbols: (f.symbols ?? []).map((s) => ({
				name: s.name,
				kind: "function",
				exported: s.exported ?? true,
				parent: s.parent,
				signature: `${s.name}(): void`,
				startLine: 1,
				endLine: 2,
			})),
			imports: [],
		})),
	} as unknown as IndexResult;
}

const module: Module = { id: "core", name: "Core", purpose: "The core.", files: ["src/a.ts"] };

const evidence: ModuleEvidence = {
	files: [{ path: "src/a.ts", language: "typescript", lineCount: 10, declarations: ["+ alpha — alpha(): void"] }],
	missing: [],
	totalSymbols: 1,
	exportedSymbols: ["alpha"],
};

function draft(summary: string, entryPoints: Array<{ name: string; file: string }>) {
	return JSON.stringify({ summary, keyPoints: ["k"], entryPoints: entryPoints.map((e) => ({ ...e, note: "n" })) });
}

describe("cards: verification", () => {
	const oracle = new SymbolOracle(indexOf([{ path: "src/a.ts", symbols: [{ name: "alpha" }] }]));

	it("grounds an entry point that this module really declares", () => {
		const result = verifyCard(
			{ summary: "s", keyPoints: [], entryPoints: [{ name: "alpha", file: "src/a.ts", note: "" }] },
			module,
			evidence,
			oracle,
		);
		expect(result.grounded).toBe(1);
		expect(result.ungrounded).toEqual([]);
	});

	it("flags an entry point the repository does not declare", () => {
		const result = verifyCard(
			{ summary: "s", keyPoints: [], entryPoints: [{ name: "authMagicLogin", file: "src/a.ts", note: "" }] },
			module,
			evidence,
			oracle,
		);
		expect(result.ungrounded).toContain("authMagicLogin");
	});

	it("accepts a dotted method reference by its last segment", () => {
		const withMethod = new SymbolOracle(
			indexOf([{ path: "src/a.ts", symbols: [{ name: "run", parent: "Engine" }] }]),
		);
		const result = verifyCard(
			{ summary: "s", keyPoints: [], entryPoints: [{ name: "Engine.run", file: "src/a.ts", note: "" }] },
			module,
			{ ...evidence, exportedSymbols: ["run"] },
			withMethod,
		);
		expect(result.grounded).toBe(1);
	});

	it("flags a file outside the module's scope", () => {
		const result = verifyCard(
			{ summary: "s", keyPoints: [], entryPoints: [{ name: "alpha", file: "src/elsewhere.ts", note: "" }] },
			module,
			evidence,
			oracle,
		);
		expect(result.unknownFiles).toContain("src/elsewhere.ts");
	});

	it("reports exported declarations the card never mentions", () => {
		const result = verifyCard(
			{ summary: "s", keyPoints: [], entryPoints: [{ name: "beta", file: "src/a.ts", note: "" }] },
			module,
			evidence,
			oracle,
		);
		expect(result.uncovered).toContain("alpha");
	});

	it("reports files the plan invented as unknown", () => {
		const result = verifyCard(
			{ summary: "s", keyPoints: [], entryPoints: [] },
			module,
			{ ...evidence, missing: ["ghost.ts"] },
			oracle,
		);
		expect(result.unknownFiles).toContain("ghost.ts");
	});

	it("does not credit a symbol that exists only outside this module", () => {
		const elsewhere = new SymbolOracle(indexOf([{ path: "src/other.ts", symbols: [{ name: "alpha" }] }]));
		const result = verifyCard(
			{ summary: "s", keyPoints: [], entryPoints: [{ name: "alpha", file: "src/a.ts", note: "" }] },
			module,
			evidence,
			elsewhere,
		);
		expect(result.ungrounded).toContain("alpha");
	});
});

describe("cards: generation", () => {
	const index = indexOf([{ path: "src/a.ts", symbols: [{ name: "alpha" }] }]);

	it("produces a card with grounded provenance hashes", async () => {
		const client = scriptedClient([draft("Does alpha.", [{ name: "alpha", file: "src/a.ts" }])]);
		const { card } = await generateCard(module, index, client, {
			knownFiles: new Map([["src/a.ts", "abc123"]]),
		});

		expect(card.moduleId).toBe("core");
		expect(card.summary).toBe("Does alpha.");
		expect(card.sources).toEqual([{ path: "src/a.ts", hash: "abc123" }]);
		expect(card.verification.grounded).toBe(1);
	});

	it("records provenance for the files bundled, not the files the model mentioned", async () => {
		const client = scriptedClient([draft("s", [])]);
		const { card } = await generateCard(module, index, client, {
			knownFiles: new Map([["src/a.ts", "h1"]]),
		});
		expect(card.sources.map((s) => s.path)).toEqual(["src/a.ts"]);
	});

	it("does not run a repair pass when the first draft is already grounded", async () => {
		const client = scriptedClient([draft("s", [{ name: "alpha", file: "src/a.ts" }])]);
		await generateCard(module, index, client, { multiplier: 10 });
		expect(client.requests).toHaveLength(1);
	});

	it("repairs an ungrounded draft at a high multiplier", async () => {
		const client = scriptedClient([
			draft("s", [{ name: "ghost", file: "src/a.ts" }]),
			draft("s", [{ name: "alpha", file: "src/a.ts" }]),
		]);
		const { card } = await generateCard(module, index, client, { multiplier: 10 });

		expect(client.requests.length).toBeGreaterThan(1);
		expect(card.verification.ungrounded).toEqual([]);
	});

	it("rejects a revision that made grounding worse", async () => {
		const client = scriptedClient([
			draft("s", [{ name: "alpha", file: "src/a.ts" }]),
			// Worse: two invented names. Must not be accepted.
			draft("s", [
				{ name: "ghost1", file: "src/a.ts" },
				{ name: "ghost2", file: "src/a.ts" },
			]),
		]);
		const { card } = await generateCard(module, index, client, { multiplier: 10 });
		expect(card.verification.ungrounded).toEqual([]);
	});

	it("keeps the better draft when a repair pass fails to parse", async () => {
		const client = scriptedClient([draft("s", [{ name: "ghost", file: "src/a.ts" }]), "not json at all"]);
		const { card } = await generateCard(module, index, client, { multiplier: 10 });
		expect(card.verification.ungrounded).toContain("ghost");
	});

	it("sends declarations, not source bodies", async () => {
		const client = scriptedClient([draft("s", [])]);
		await generateCard(module, index, client);
		expect(client.requests[0]?.prompt).toContain("alpha(): void");
	});

	it("includes the stated purpose in the prompt", async () => {
		const client = scriptedClient([draft("s", [])]);
		await generateCard(module, index, client);
		expect(client.requests[0]?.prompt).toContain("The core.");
	});

	it("triggers a correction pass when initial reply is malformed JSON", async () => {
		const client = scriptedClient([
			"this is not json at all {",
			draft("Recovered from repair pass.", [{ name: "alpha", file: "src/a.ts" }]),
		]);
		const { card } = await generateCard(module, index, client);
		expect(client.requests).toHaveLength(2);
		expect(client.requests[1]?.purpose).toBe("card-repair-json");
		expect(card.summary).toBe("Recovered from repair pass.");
		expect(card.verification.grounded).toBe(1);
	});

	it("tolerates trailing commas in draft reply without failure", async () => {
		const replyWithTrailingCommas = `{
			"summary": "Trailing comma summary.",
			"keyPoints": ["point 1",],
			"entryPoints": [{"name": "alpha", "file": "src/a.ts", "note": "note",},],
		}`;
		const client = scriptedClient([replyWithTrailingCommas]);
		const { card } = await generateCard(module, index, client);
		expect(client.requests).toHaveLength(1);
		expect(card.summary).toBe("Trailing comma summary.");
		expect(card.verification.grounded).toBe(1);
	});
});

describe("cards: batch generation", () => {
	const index = indexOf([{ path: "src/a.ts", symbols: [{ name: "alpha" }] }]);
	const plan: ModulePlan = {
		version: 1,
		generatedAt: "",
		multiplier: 1,
		modules: [
			{ id: "core", name: "Core", purpose: "p", files: ["src/a.ts"] },
			{ id: "ghost", name: "Ghost", purpose: "p", files: [] },
		],
	};

	it("generates a card per module that owns files", async () => {
		const client = scriptedClient([draft("s", [])]);
		const results = await generateCards(plan, index, client);
		expect(results.map((r) => r.card.moduleId)).toEqual(["core"]);
	});

	it("honours an explicit module filter", async () => {
		const client = scriptedClient([draft("s", [])]);
		const results = await generateCards(plan, index, client, { only: ["nonexistent"] });
		expect(results).toHaveLength(0);
	});

	it("reports progress", async () => {
		const client = scriptedClient([draft("s", [])]);
		const seen: string[] = [];
		await generateCards(plan, index, client, { onProgress: (id) => seen.push(id) });
		expect(seen).toEqual(["core"]);
	});

	it("signals task starts alongside progress", async () => {
		const client = scriptedClient([draft("s", [])]);
		const started: Array<{ id: string; index: number; total: number }> = [];
		await generateCards(plan, index, client, {
			onTaskStart: (id, index, total) => started.push({ id, index, total }),
		});
		expect(started).toEqual([{ id: "core", index: 0, total: 1 }]);
	});

	it("reuses fresh existing card in incremental mode", async () => {
		const client = scriptedClient([draft("new core summary", [])]);
		const existingCard = {
			moduleId: "core",
			name: "Core",
			generatedAt: "2026-01-01T00:00:00.000Z",
			summary: "Cached existing summary",
			keyPoints: ["kp1"],
			entryPoints: [],
			sources: [{ path: "src/a.ts", hash: "hash-src/a.ts" }],
			verification: { grounded: 0, ungrounded: [], unknownFiles: [], uncovered: [] },
		};

		const results = await generateCards(plan, index, client, {
			incremental: true,
			existingCards: [existingCard],
			knownFiles: new Map([["src/a.ts", "hash-src/a.ts"]]),
		});

		expect(results).toHaveLength(1);
		expect(results[0]?.card.summary).toBe("Cached existing summary");
		expect(client.requests).toHaveLength(0); // Model client was not invoked!
	});

	it("regenerates card in incremental mode when a source hash changes", async () => {
		const client = scriptedClient([draft("Updated after change", [])]);
		const existingCard = {
			moduleId: "core",
			name: "Core",
			generatedAt: "2026-01-01T00:00:00.000Z",
			summary: "Cached existing summary",
			keyPoints: ["kp1"],
			entryPoints: [],
			sources: [{ path: "src/a.ts", hash: "old-hash" }],
			verification: { grounded: 0, ungrounded: [], unknownFiles: [], uncovered: [] },
		};

		const results = await generateCards(plan, index, client, {
			incremental: true,
			existingCards: [existingCard],
			knownFiles: new Map([["src/a.ts", "new-hash"]]),
		});

		expect(results).toHaveLength(1);
		expect(results[0]?.card.summary).toBe("Updated after change");
		expect(client.requests).toHaveLength(1); // Model client was invoked!
	});
});

describe("cards: prompt shape", () => {
	it("tells the model how many key points to write", () => {
		const prompt = buildCardPrompt(module, evidence, { multiplier: 1, keyPoints: 4 } as never);
		expect(prompt).toContain("Write 4 key points");
	});

	it("marks a file with no declarations explicitly", () => {
		const prompt = buildCardPrompt(
			module,
			{ ...evidence, files: [{ path: "README.md", language: "", lineCount: 0, declarations: [] }] },
			{ multiplier: 1, keyPoints: 3 } as never,
		);
		expect(prompt).toContain("(no declarations indexed)");
	});
});

describe("cards: visual presentation and 3D terminal viewer", () => {
	const sampleCard = {
		moduleId: "crypto",
		name: "Cryptographic Security",
		generatedAt: "2026-09-24T00:00:00.000Z",
		summary: "Provides AES encryption and secure key exchange.",
		keyPoints: ["Zero key leaks in heap", "Hardware accelerated AES-GCM"],
		entryPoints: [
			{ name: "encrypt", file: "src/crypto.ts", note: "Primary encryption helper", line: 12, kind: "function", exported: true },
			{ name: "decrypt", file: "src/crypto.ts", note: "Primary decryption helper", line: 45, kind: "function", exported: true },
		],
		sources: [{ path: "src/crypto.ts", hash: "hash-crypto" }],
		verification: { grounded: 2, ungrounded: [], unknownFiles: [], uncovered: [], score: 100, status: "grounded" as const },
	};

	it("formats status badge correctly for grounded and defective cards", () => {
		expect(formatCardBadge(sampleCard.verification)).toContain("GROUNDED 100%");
		expect(formatCardBadge({ grounded: 1, ungrounded: ["fake"], unknownFiles: [], uncovered: [], status: "partial" })).toContain("PARTIAL");
		expect(formatCardBadge({ grounded: 0, ungrounded: ["ghost"], unknownFiles: ["missing.ts"], uncovered: [], status: "defects" })).toContain("DEFECTS");
	});

	it("formats citation density gauge with percentage and ratio", () => {
		const gauge = formatCitationDensityGauge(sampleCard, { width: 10 });
		expect(gauge).toContain("100%");
		expect(gauge).toContain("2/2 verified");
	});

	it("renders 3D-styled card front and back views", () => {
		const front = renderCard3D(sampleCard, { side: "front" });
		expect(front).toContain("[FRONT] 📇 MODULE: CRYPTO — Cryptographic Security");
		expect(front).toContain("SUMMARY:");
		expect(front).toContain("Zero key leaks in heap");

		const back = renderCard3D(sampleCard, { side: "back" });
		expect(back).toContain("[BACK] 🔍 CITATIONS & DECLARATIONS: crypto");
		expect(back).toContain("encrypt -> src/crypto.ts:12 [function] [VERIFIED]");
		expect(back).toContain("PROVENANCE SOURCES (1):");
	});

	it("renders a 3D flip pair with rotation divider", () => {
		const pair = renderCardPair(sampleCard);
		expect(pair).toContain("[FRONT]");
		expect(pair).toContain("[ 3D CARD ROTATION FLIP ]");
		expect(pair).toContain("[BACK]");
	});
});

describe("cards: symbol-level incremental freshness", () => {
	const card = {
		moduleId: "api",
		name: "API",
		generatedAt: "2026-01-01T00:00:00.000Z",
		summary: "API routes.",
		keyPoints: ["Routes"],
		entryPoints: [{ name: "handleRequest", file: "src/api.ts", note: "" }],
		sources: [{ path: "src/api.ts", hash: "hash-api" }],
		verification: { grounded: 1, ungrounded: [], unknownFiles: [], uncovered: [] },
	};

	it("detects symbol staleness when a cited symbol was modified", () => {
		expect(isCardSymbolStale(card, new Set(["handleRequest"]))).toBe(true);
		expect(isCardSymbolStale(card, new Set(["unrelatedFunction"]))).toBe(false);
	});

	it("selectively updates only invalidated cards with updateCardsIncrementally", async () => {
		const plan: ModulePlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			modules: [
				{ id: "api", name: "API", purpose: "API layer", files: ["src/api.ts"] },
				{ id: "util", name: "Util", purpose: "Util layer", files: ["src/util.ts"] },
			],
		};
		const existingUtil = {
			moduleId: "util",
			name: "Util",
			generatedAt: "2026-01-01T00:00:00.000Z",
			summary: "Util helpers.",
			keyPoints: ["Helpers"],
			entryPoints: [{ name: "clamp", file: "src/util.ts", note: "" }],
			sources: [{ path: "src/util.ts", hash: "h-util" }],
			verification: { grounded: 1, ungrounded: [], unknownFiles: [], uncovered: [] },
		};

		const client = scriptedClient([draft("Regenerated API", [{ name: "handleRequest", file: "src/api.ts" }])]);
		const oracleIndex = indexOf([
			{ path: "src/api.ts", symbols: [{ name: "handleRequest" }] },
			{ path: "src/util.ts", symbols: [{ name: "clamp" }] },
		]);

		const res = await updateCardsIncrementally(
			plan,
			[card, existingUtil],
			oracleIndex,
			client,
			{
				modifiedSymbols: new Set(["handleRequest"]),
				knownFiles: new Map([["src/api.ts", "new-hash"], ["src/util.ts", "h-util"]]),
			},
		);

		expect(res.regenerated).toContain("api");
		expect(res.reused).toContain("util");
		expect(res.cards).toHaveLength(2);
	});
});

