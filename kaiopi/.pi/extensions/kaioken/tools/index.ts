import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readExcerpt } from "../../../../kaioken/index/src/anchors.ts";
import { readIndexArtifact } from "../../../../kaioken/index/src/artifact.ts";
import { buildIndex } from "../../../../kaioken/index/src/build.ts";
import { SymbolOracle } from "../../../../kaioken/index/src/oracle.ts";
import { scan } from "../../../../kaioken/scan/src/scan.ts";
import { bm25Search } from "../../../../kaioken/search/src/search.ts";
import { predictImpactForSymbol } from "../../../../kaioken/impact/src/predict.ts";
import { loadSkill } from "../../../../kaioken/skills/src/load.ts";
import { checkDrift } from "../../../../kaioken/provenance/src/status.ts";
import { runVerify } from "../../../../kaioken/verify/src/gate.ts";

const T = (text: string) => ({ content: [{ type: "text" as const, text }], details: {} });

function resolveRoot(rootFn?: () => string, ctx?: ExtensionContext): string {
	if (ctx?.cwd) return ctx.cwd;
	if (rootFn) return rootFn();
	return process.cwd();
}

export async function getSymbolOracle(root: string): Promise<SymbolOracle> {
	const cached = await readIndexArtifact(root);
	if (cached) return new SymbolOracle(cached);
	try {
		const scanResult = await scan(root);
		const outcome = await buildIndex(scanResult);
		return new SymbolOracle(outcome.index);
	} catch {
		return new SymbolOracle({
			root,
			builtAt: "",
			fileCount: 0,
			symbolCount: 0,
			unparsedLanguages: {},
			files: [],
		});
	}
}

export interface RegisterToolsOptions {
	onVerify?: (pass: boolean) => void;
}

export function registerTools(
	pi: ExtensionAPI,
	root?: () => string,
	options?: RegisterToolsOptions,
) {
	pi.registerTool({
		name: "kaio_symbol_lookup",
		label: "Symbol Oracle",
		description:
			"DEFINITIVE AST oracle. Exact file/line/signature or 'DOES NOT EXIST'. Call BEFORE asserting any symbol, import, or file.",
		parameters: Type.Object({ query: Type.String() }),
		async execute(_id, p, _signal, _onUpdate, ctx) {
			const r = resolveRoot(root, ctx);
			const oracle = await getSymbolOracle(r);
			const hits = oracle.lookup(p.query);
			return T(
				hits.length
					? JSON.stringify(hits, null, 2)
					: `NEGATIVE GUARANTEE: no symbol matching "${p.query}" is declared. Do not invent it.`,
			);
		},
	});

	pi.registerTool({
		name: "kaio_read_file",
		label: "Grounded Read",
		description: "Read exact line ranges with verified anchors. Prefer over raw read for code quoting.",
		parameters: Type.Object({
			path: Type.String(),
			start: Type.Number(),
			end: Type.Number(),
		}),
		async execute(_id, p, _signal, _onUpdate, ctx) {
			const r = resolveRoot(root, ctx);
			return T(await readExcerpt(r, p.path, p.start, p.end));
		},
	});

	pi.registerTool({
		name: "kaio_wiki_search",
		label: "Wiki/Card Search",
		description: "BM25+RRF over wiki, cards, skills. Skeletons first, detail on demand.",
		parameters: Type.Object({
			query: Type.String(),
			limit: Type.Optional(Type.Number()),
		}),
		async execute(_id, p, _signal, _onUpdate, ctx) {
			const r = resolveRoot(root, ctx);
			return T(await bm25Search(r, p.query, p.limit ?? 8));
		},
	});

	pi.registerTool({
		name: "kaio_impact",
		label: "Blast Radius",
		description: "Predict files/modules broken by changing a symbol. Call BEFORE editing.",
		parameters: Type.Object({ symbol: Type.String() }),
		async execute(_id, p, _signal, _onUpdate, ctx) {
			const r = resolveRoot(root, ctx);
			const report = await predictImpactForSymbol(r, p.symbol);
			return T(JSON.stringify(report, null, 2));
		},
	});

	pi.registerTool({
		name: "kaio_skill_load",
		label: "Load Procedure",
		description: "Load distilled task procedure from .kaioken/skills when a task matches.",
		parameters: Type.Object({ name: Type.String() }),
		async execute(_id, p, _signal, _onUpdate, ctx) {
			const r = resolveRoot(root, ctx);
			return T(await loadSkill(r, p.name));
		},
	});

	pi.registerTool({
		name: "kaio_status",
		label: "Drift Check",
		description: "0-token staleness diff docs vs code. Call before documenting.",
		parameters: Type.Object({}),
		async execute(_id, _p, _signal, _onUpdate, ctx) {
			const r = resolveRoot(root, ctx);
			return T(JSON.stringify(await checkDrift(r), null, 2));
		},
	});

	pi.registerTool({
		name: "kaio_verify",
		label: "Hard Test Gate",
		description: "Run native build+test. Task NOT complete until PASS. Failures returned verbatim for repair.",
		parameters: Type.Object({}),
		async execute(_id, _p, _signal, _onUpdate, ctx) {
			const r = resolveRoot(root, ctx);
			const outcome = await runVerify(r);
			options?.onVerify?.(outcome.pass);
			return T(
				outcome.pass
					? "VERIFY: PASS (0 errors)"
					: `VERIFY: FAIL\n${outcome.summary}\nEnter repair loop: fix, re-run kaio_verify.`,
			);
		},
	});
}
