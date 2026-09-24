import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Models, ThinkingLevel } from "@earendil-works/pi-ai";
import { Box, Text } from "@earendil-works/pi-tui";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildGraph } from "../../../../kaioken/graph/src/build.ts";
import { graphStats } from "../../../../kaioken/graph/src/render.ts";
import { readWikiTree, writeExportTree, writeGraph, type ExportManifest } from "../../../../kaioken/graph/src/artifact.ts";
import { createWorktree, ffMerge, slug, worktreePath } from "../../../../kaioken/gitops/src/worktree.ts";
import { buildIndex, readIndexArtifact, SymbolOracle, writeIndexArtifact } from "../../../../kaioken/index/src/index.ts";
import { checkDrift, gatherProvenance } from "../../../../kaioken/provenance/src/status.ts";
import { scan, writeScanArtifact } from "../../../../kaioken/scan/src/index.ts";
import { bm25Search } from "../../../../kaioken/search/src/search.ts";
import { serve, type RunningServer } from "../../../../kaioken/serve/src/server.ts";
import { loadSkills } from "../../../../kaioken/skills/src/index.ts";
import { runVerify } from "../../../../kaioken/verify/src/gate.ts";
import { PiAiClient } from "../../../../kaioken/modelport/src/piai.ts";
import type { ModelClient } from "../../../../kaioken/modelport/src/port.ts";
import {
	contextTokensFor,
	describeSpend,
	estimateSpend,
	estimateTokens,
	type SpendEstimate as TokenSpendEstimate,
} from "../../../../kaioken/modelport/src/spend.ts";
import { renderProgressCard, type ProgressState, renderProgressBar } from "./progress.ts";
import { renderDiffBlock, parseUnifiedDiff, type ParsedDiff } from "./diff.ts";
import { renderCodeSnippet, osc52Copy, copySnippetAction } from "./clipboard.ts";
import { AutoScrollController, type ScrollState } from "./autoscroll.ts";
import { renderBreadcrumbs, MilestoneTrail, type Milestone } from "./breadcrumbs.ts";

export * from "./progress.ts";
export * from "./diff.ts";
export * from "./clipboard.ts";
export * from "./autoscroll.ts";
export * from "./breadcrumbs.ts";

import { proposeModulePlan, validatePlan, writeModulePlan, type ModulePlan } from "../../../../kaioken/plan/src/index.ts";
import { generateCards, readCards, readModulePlan, writeCard } from "../../../../kaioken/plan/src/index.ts";
import {
	groundingDefects,
	planWiki,
	readBrief,
	readWikiPlan,
	runWiki,
	writeProvenance,
	writeVerification,
	writeWikiDocument,
	writeWikiIndex,
	writeWikiPlan,
} from "../../../../kaioken/wiki/src/index.ts";
import {
	depthFor,
	gatherSources,
	generateResearch,
	type WebFetchPort,
	type WebSearchPort,
	writeResearchDocument,
} from "../../../../kaioken/research/src/index.ts";
import { proposeSkills, writeSkill } from "../../../../kaioken/skillgen/src/index.ts";

export interface SpendEstimate {
	action: string;
	multiplier: number;
	estimatedInputTokens: number;
	estimatedOutputTokens: number;
	estimatedCostUsd: number;
}

export interface SpendGate {
	estimate(action: string, multiplier: number, contextSize?: number): SpendEstimate;
	confirm(ctx: ExtensionContext, action: string, multiplier: number): Promise<boolean>;
}

export function parseMult(args?: string): number {
	if (!args) return 3;
	const m = args.match(/(?:×|x)?(\d+)/i);
	if (!m) return 3;
	const n = parseInt(m[1], 10);
	return Math.max(1, Math.min(10, n));
}

/**
 * Spend gate backed by the active model's own cost registry.
 *
 * Prices are read from `ctx.model.cost` rather than hardcoded, so a price
 * change is a config change and the estimate cannot silently drift (Invariant 9).
 * When no model is resolvable the gate still estimates tokens but reports cost
 * as unknown rather than inventing a figure.
 */
export class DefaultSpendGate implements SpendGate {
	estimate(action: string, multiplier: number, contextSize?: number): SpendEstimate {
		const tokens = estimateTokens(multiplier, contextSize ?? contextTokensFor(action));
		// Cost is filled in by `confirm`, which is the only place a model is reachable.
		return {
			action,
			multiplier,
			estimatedInputTokens: tokens.input,
			estimatedOutputTokens: tokens.output,
			estimatedCostUsd: 0,
		};
	}

	async confirm(ctx: ExtensionContext, action: string, multiplier: number): Promise<boolean> {
		const tokens = estimateTokens(multiplier, contextTokensFor(action));
		const model = ctx.model;
		const spend: TokenSpendEstimate = estimateSpend(model?.cost, tokens);
		const label = model ? `${model.provider}/${model.id}` : "no active model";
		const promptText = describeSpend(action, multiplier, spend, label);

		if (ctx.hasUI && ctx.ui?.confirm) {
			const ok = await ctx.ui.confirm("Spend Confirmation", promptText);
			if (!ok) {
				ctx.ui.notify?.("Cancelled spend.", "info");
				return false;
			}
			return true;
		}
		return true;
	}
}

function resolveRoot(rootFn?: () => string, ctx?: ExtensionContext): string {
	if (ctx?.cwd) return ctx.cwd;
	if (rootFn) return rootFn();
	return process.cwd();
}

/**
 * The UI surface a live log needs. All methods are optional so a missing TUI
 * (print/rpc mode, tests) degrades to silence rather than a throw.
 */
export interface LiveLogUI {
	notify?: (message: string, type?: "info" | "warning" | "error") => void;
	setStatus?: (key: string, text: string | undefined) => void;
	setWidget?: (key: string, content: string[] | undefined) => void;
	setWorkingMessage?: (message?: string) => void;
}

/**
 * Data payload stored in Pi session for durable TUI transcript rendering.
 * Does not participate in LLM context (Invariant 1: clean session).
 */
export interface KaiokenProgressData {
	scope: string;
	kind: "start" | "progress" | "task" | "done" | "error" | "card" | "diff" | "snippet" | "breadcrumbs";
	message?: string;
	detail?: string;
	timestamp?: number;
	progressState?: ProgressState;
	diffText?: string;
	diffCollapsed?: boolean;
	code?: string;
	language?: string;
	milestones?: Milestone[];
}

/**
 * Register custom transcript entry renderers with Pi so live logs, progress cards,
 * diff blocks, code snippets, and milestone trails appear directly in the main chat/text output container.
 */
export function registerProgressRenderer(pi: ExtensionAPI): void {
	if (typeof (pi as any)?.registerEntryRenderer !== "function") return;

	// 1. kaioken-progress: Primary stream renderer for logs and progress cards
	pi.registerEntryRenderer<KaiokenProgressData>("kaioken-progress", (entry, options, theme) => {
		const data = entry.data;
		if (!data) return undefined;

		// Interactive Progress Card (UX-0101 - UX-0110)
		if (data.progressState) {
			return renderProgressCard(data.progressState, options, theme);
		}

		// Embedded Diff Block (UX-0111 - UX-0120)
		if (data.diffText) {
			return renderDiffBlock(data.diffText, { ...options, collapsed: data.diffCollapsed }, theme);
		}

		// Embedded Code Snippet (UX-0121 - UX-0130)
		if (data.code) {
			return renderCodeSnippet(data.code, data.language, { showLineNumbers: options.expanded }, theme);
		}

		// Milestone Breadcrumbs (UX-0141 - UX-0150)
		if (data.milestones) {
			return renderBreadcrumbs(data.milestones, { compact: !options.expanded }, theme);
		}

		if (!data.message) return undefined;

		const fg = (color: string, text: string) =>
			theme?.fg ? (theme.fg as any)(color, text) : text;

		let symbol = "•";
		let color = "accent";
		switch (data.kind) {
			case "start":
				symbol = "◆";
				color = "accent";
				break;
			case "task":
				symbol = "→";
				color = "accent";
				break;
			case "progress":
				symbol = "…";
				color = "dim";
				break;
			case "done":
				symbol = "✓";
				color = "success";
				break;
			case "error":
				symbol = "✗";
				color = "error";
				break;
		}

		const badge = fg("accent", `[${data.scope}]`);
		const styledSymbol = fg(color, symbol);

		const lines = data.message.split("\n");
		const firstLine = `${styledSymbol} ${badge} ${lines[0]}`;
		const allLines =
			lines.length > 1
				? [firstLine, ...lines.slice(1).map((l) => `    ${l}`)].join("\n")
				: firstLine;

		const box = new Box(1, 0);
		box.addChild(new Text(allLines, 0, 0));
		if (data.detail && options.expanded) {
			box.addChild(new Text(fg("dim", `    ${data.detail}`), 0, 0));
		}
		return box;
	});

	// 2. kaioken-diff: Syntax-highlighted unified diffs with folding (UX-0111 - UX-0120)
	pi.registerEntryRenderer<{ diffText: string; collapsed?: boolean }>("kaioken-diff", (entry, options, theme) => {
		if (!entry.data?.diffText) return undefined;
		return renderDiffBlock(entry.data.diffText, { ...options, collapsed: entry.data.collapsed }, theme);
	});

	// 3. kaioken-snippet: One-click copy code snippet with OSC 52 (UX-0121 - UX-0130)
	pi.registerEntryRenderer<{ code: string; language?: string }>("kaioken-snippet", (entry, options, theme) => {
		if (!entry.data?.code) return undefined;
		return renderCodeSnippet(entry.data.code, entry.data.language, { showLineNumbers: options.expanded }, theme);
	});

	// 4. kaioken-breadcrumbs: Interactive milestone pipeline breadcrumbs (UX-0141 - UX-0150)
	pi.registerEntryRenderer<{ milestones: Milestone[] }>("kaioken-breadcrumbs", (entry, options, theme) => {
		if (!entry.data?.milestones) return undefined;
		return renderBreadcrumbs(entry.data.milestones, { compact: !options.expanded }, theme);
	});
}

/**
 * Live progress log for long-running `kaio-*` commands.
 *
 * Mirrors every step into both channels:
 *
 * - **Chat Transcript** (`appendEntry` + `kaioken-progress` renderer):
 *   Appends durable, cleanly styled milestone lines directly in the text output area.
 * - **Widget** (`setWidget`): persistent `✓`/`✗` history plus in-flight item.
 * - **Footer + spinner** (`setStatus`, `setWorkingMessage`): bottom status bar tracking.
 */
export class LiveLog {
	private ui: LiveLogUI | undefined;
	private scope: string;
	private append?: (customType: string, data?: unknown) => void;
	private completed: string[] = [];
	private current: string | undefined;

	constructor(
		ui: LiveLogUI | undefined,
		scope: string,
		appendOrPi?: ExtensionAPI | ((customType: string, data?: unknown) => void),
	) {
		this.ui = ui;
		this.scope = scope;
		if (typeof appendOrPi === "function") {
			this.append = appendOrPi;
		} else if (appendOrPi && typeof (appendOrPi as any).appendEntry === "function") {
			this.append = (type, data) => (appendOrPi as ExtensionAPI).appendEntry(type, data);
		}
	}

	/** Run start: immediate transcript line so the screen is never empty. */
	start(message: string, detail?: string): void {
		this.emitStatus(message);
		this.emitTranscript("start", message, detail);
	}

	/** Single updating progress line in transcript, footer, and spinner. */
	progress(statusText: string, detail?: string): void {
		this.emitStatus(statusText);
		this.emitTranscript("progress", statusText, detail);
	}

	/** In-place live-updating progress card (UX-0101 - UX-0110). */
	progressCard(state: ProgressState): void {
		this.emitStatus(`${state.title} (${state.phase})`);
		if (this.append) {
			try {
				this.append("kaioken-progress", {
					scope: this.scope,
					kind: "card",
					message: state.title,
					detail: state.subphase,
					timestamp: Date.now(),
					progressState: state,
				});
			} catch {
				// Best effort
			}
		}
	}

	/** Syntax-highlighted unified diff block with collapsible fold (UX-0111 - UX-0120). */
	diff(diffText: string, options?: { collapsed?: boolean }): void {
		if (this.append) {
			try {
				this.append("kaioken-diff", {
					diffText,
					collapsed: options?.collapsed ?? true,
				});
			} catch {
				// Best effort
			}
		}
	}

	/** One-click copy code snippet with OSC 52 action (UX-0121 - UX-0130). */
	snippet(code: string, language = "text"): void {
		if (this.append) {
			try {
				this.append("kaioken-snippet", {
					code,
					language,
				});
			} catch {
				// Best effort
			}
		}
	}

	/** Interactive milestone breadcrumb trail (UX-0141 - UX-0150). */
	breadcrumbs(trail: Milestone[] | MilestoneTrail): void {
		const milestones = trail instanceof MilestoneTrail ? [...trail.getMilestones()] : trail;
		if (this.append) {
			try {
				this.append("kaioken-breadcrumbs", {
					milestones,
				});
			} catch {
				// Best effort
			}
		}
	}

	/** A unit of work started: names it in transcript, spinner and widget. */
	taskStarted(label: string, statusText: string, detail?: string): void {
		this.current = label;
		this.emitStatus(statusText);
		this.refreshWidget();
		this.emitTranscript("task", statusText, detail);
	}

	/** A unit of work finished: appends it to persistent history and transcript. */
	docDone(label: string, statusText: string, detail?: string): void {
		if (this.current === label) this.current = undefined;
		this.completed.push(`✓ ${label}`);
		this.emitStatus(statusText);
		this.refreshWidget();
		this.emitTranscript("done", statusText, detail);
	}

	/** A unit of work failed: error line in transcript plus history. */
	failure(message: string, detail?: string): void {
		this.completed.push(`✗ ${message}`);
		this.ui?.setWorkingMessage?.(undefined);
		// Only fall back to notify when no transcript renderer is wired up;
		// the kaioken-progress entry renderer handles display in the chat otherwise.
		if (!this.append) this.ui?.notify?.(message, "error");
		this.refreshWidget();
		this.emitTranscript("error", message, detail);
	}

	/** Run end: clears the spinner, sets the final status, emits done entry. */
	done(summary: string, statusText?: string, detail?: string): void {
		this.ui?.setWorkingMessage?.(undefined);
		if (statusText !== undefined) this.ui?.setStatus?.("kaioken", statusText);
		// Only fall back to notify when no transcript renderer is wired up.
		if (!this.append) this.ui?.notify?.(summary, "info");
		this.emitTranscript("done", summary, detail);
	}

	private emitStatus(text: string): void {
		this.ui?.setStatus?.("kaioken", text);
		// Only fall back to notify when no transcript renderer is wired up;
		// the kaioken-progress entry renderer handles display in the chat otherwise.
		if (!this.append) this.ui?.notify?.(text, "info");
		this.ui?.setWorkingMessage?.(text);
	}

	private emitTranscript(kind: KaiokenProgressData["kind"], message?: string, detail?: string): void {
		if (!this.append) return;
		try {
			this.append("kaioken-progress", {
				scope: this.scope,
				kind,
				message: message ?? "",
				detail,
				timestamp: Date.now(),
			});
		} catch {
			// Best-effort transcript emission; never fail the command
		}
	}

	private refreshWidget(): void {
		const lines = [`${this.scope}:`, ...this.completed.slice(-8)];
		if (this.current !== undefined) lines.push(`… ${this.current}`);
		this.ui?.setWidget?.("kaioken", lines.slice(0, 10));
	}
}


let activeServer: RunningServer | null = null;

/**
 * Build the model client for the active session.
 *
 * Returns null when no model is bound, so every generative stage can fall back
 * to a deterministic path instead of failing: an offline user still gets a
 * usable plan, just a mechanical one.
 */
export function clientFor(ctx: ExtensionContext): ModelClient | null {
	const model = ctx.model;
	if (!model) return null;

	const reg = (ctx as any).modelRegistry;
	const runtime = reg?.runtime;
	const rawModels = (ctx as any).models;

	let models: Models | null = null;
	if (rawModels) {
		models = rawModels;
	} else if (reg || runtime) {
		models = {
			getModel: (p: string, m: string) => reg?.find?.(p, m) ?? runtime?.getModel?.(p, m),
			getModels: (p?: string) => {
				if (runtime?.getModels) return runtime.getModels(p);
				const all = reg?.getAll?.() ?? [];
				return p ? all.filter((m: any) => m.provider === p) : all;
			},
			complete: (m: any, c: any, o: any) => reg?.complete?.(m, c, o) ?? runtime?.complete?.(m, c, o),
			stream: (m: any, c: any, o: any) => reg?.stream?.(m, c, o) ?? runtime?.stream?.(m, c, o),
		} as unknown as Models;
	}

	if (!models) return null;

	// `ctx.thinkingLevel` is typed by the agent package, which spells the level
	// union slightly differently from pi-ai ("off" is a model-level concept).
	// They are the same values at runtime, so this narrows rather than casts.
	const reasoning = ctx.thinkingLevel && ctx.thinkingLevel !== "off" ? ctx.thinkingLevel : undefined;
	return new PiAiClient(models, {
		provider: String(model.provider),
		model: model.id,
		...(reasoning ? { reasoning: reasoning as ThinkingLevel } : {}),
	});
}

/** The deterministic plan, used when no model is reachable. */
async function mechanicalPlan(root: string, multiplier: number): Promise<ModulePlan> {
	const scanResult = await scan(root);

	const groups = new Map<string, string[]>();
	for (const file of scanResult.files) {
		const parts = file.path.split(/[\\/]/);
		const top = parts.length > 1 ? parts[0] : "root";
		const list = groups.get(top as string);
		if (list) list.push(file.path);
		else groups.set(top as string, [file.path]);
	}

	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		multiplier,
		modules: [...groups.entries()].map(([id, files]) => ({
			id: id as string,
			name: `${(id as string).toUpperCase()} Module`,
			purpose: "Grouped by top-level directory (no model available).",
			files: (files as string[]).sort(),
		})),
	};
}

export interface PlanRun {
	moduleTree: string[];
	/** Path the checkpoint was written to. */
	planPath: string;
	/** True when the model proposed the plan, false for the mechanical fallback. */
	generated: boolean;
	defects: string[];
}

/**
 * Propose a module plan and stop at the checkpoint.
 *
 * The stop is the point: `plan` is the cheap moment to correct a decomposition,
 * so it writes an editable YAML file and returns without generating anything
 * downstream. Every later stage reads that file back.
 */
export async function runPlan(
	root: string,
	multiplier: number,
	client?: ModelClient | null,
	options?: {
		scan?: any;
		index?: any;
		onProgress?: (message: string) => void;
	},
): Promise<PlanRun> {
	options?.onProgress?.("Scanning workspace files…");
	const scanResult = options?.scan ?? (await scan(root));
	options?.onProgress?.("Reading symbol index…");
	const index = options?.index !== undefined ? options.index : await readIndexArtifact(root).catch(() => null);

	let plan: ModulePlan;
	let generated = false;
	const defects: string[] = [];

	if (client) {
		options?.onProgress?.("Proposing module plan with model…");
		const result = await proposeModulePlan(scanResult, index, client, { multiplier });
		plan = result.plan;
		generated = true;
		for (const defect of result.validation.defects) {
			defects.push(`[${defect.severity}] ${defect.message}`);
		}
	} else {
		options?.onProgress?.("Computing mechanical decomposition…");
		plan = await mechanicalPlan(root, multiplier);
		const validation = validatePlan(plan, scanResult);
		for (const defect of validation.defects) {
			defects.push(`[${defect.severity}] ${defect.message}`);
		}
	}

	const planPath = await writeModulePlan(root, plan);

	const outline = [
		`module plan (${generated ? "model" : "mechanical"}) — ${plan.modules.length} module(s):`,
		...plan.modules.map((m) => `  - ${m.id} (${m.files.length} file${m.files.length === 1 ? "" : "s"})`),
		"",
		`Checkpoint written: ${planPath}`,
		"Edit it, then run /kaio-cards to continue.",
	];

	return { moduleTree: outline, planPath, generated, defects };
}

/**
 * Web access, as two ports the bridge owns.
 *
 * The research core never opens a socket; it is handed these. That keeps the
 * pipeline offline-testable and means an unconfigured environment fails with a
 * sentence rather than a stack trace.
 */
export interface WebPorts {
	search: WebSearchPort;
	fetch: WebFetchPort;
}

export const NO_WEB_PORTS: WebPorts = {
	search: {
		async search() {
			throw new Error("no web search provider configured");
		},
	},
	fetch: {
		async fetch() {
			throw new Error("no web fetch provider configured");
		},
	},
};

export function registerCommands(
	pi: ExtensionAPI,
	root?: () => string,
	spendGate: SpendGate = new DefaultSpendGate(),
	web: WebPorts = NO_WEB_PORTS,
) {
	registerProgressRenderer(pi);

	// 1. /kaio-scan
	pi.registerCommand("kaio-scan", {
		description: "Deterministic repo inventory + risk flags",
		handler: async (_a, ctx) => {
			const r = resolveRoot(root, ctx);
			const log = new LiveLog(ctx.ui, "scan", pi);
			log.start("Scanning repository files and indexing symbols…");
			try {
				const scanResult = await scan(r);
				await writeScanArtifact(r, scanResult);
				log.progress(`Scanned ${scanResult.fileCount} files (${Math.round(scanResult.totalBytes / 1024)} KB). Building AST symbol index…`);
				const risky = scanResult.files.filter((f) => f.risk.length > 0);
				const byClass = new Map<string, number>();
				for (const file of risky) {
					for (const risk of file.risk) byClass.set(risk, (byClass.get(risk) ?? 0) + 1);
				}
				const breakdown = [...byClass.entries()]
					.sort((a, b) => b[1] - a[1])
					.map(([risk, n]) => `${n} ${risk}`)
					.join(", ");
				const indexResult = await buildIndex(scanResult);
				await writeIndexArtifact(r, indexResult.index);
				log.done(
					`Scan complete: ${scanResult.fileCount} files (${Math.round(scanResult.totalBytes / 1024)} KB), ${indexResult.index.symbolCount} symbols indexed.${breakdown ? ` Risk flags: ${breakdown}.` : " No risk flags."}`,
				);
			} catch (err: any) {
				log.failure(`Scan failed: ${err.message}`);
			}
		},
	});

	// 2. /kaio-symbols
	pi.registerCommand("kaio-symbols", {
		description: "Lookup symbol declaration in AST oracle",
		handler: async (args, ctx) => {
			const r = resolveRoot(root, ctx);
			const log = new LiveLog(ctx.ui, "symbols", pi);
			if (!args.trim()) {
				log.failure("Usage: /kaio-symbols <symbolName>");
				return;
			}
			log.start(`Looking up symbol "${args.trim()}"…`);
			try {
				const index = await readIndexArtifact(r);
				const oracle = new SymbolOracle(index ?? { root: r, builtAt: "", fileCount: 0, symbolCount: 0, unparsedLanguages: {}, files: [] });
				const hits = oracle.lookup(args.trim());
				log.done(
					hits.length
						? JSON.stringify(hits, null, 2)
						: `NEGATIVE GUARANTEE: no symbol matching "${args.trim()}" is declared.`,
				);
			} catch (err: any) {
				log.failure(`Symbol lookup failed: ${err.message}`);
			}
		},
	});

	// 3. /kaio-search
	pi.registerCommand("kaio-search", {
		description: "BM25+RRF lexical and structural search",
		handler: async (args, ctx) => {
			const r = resolveRoot(root, ctx);
			const log = new LiveLog(ctx.ui, "search", pi);
			if (!args.trim()) {
				log.failure("Usage: /kaio-search <query>");
				return;
			}
			log.start(`Searching for "${args.trim()}"…`);
			try {
				const hits = await bm25Search(r, args.trim(), 8);
				log.done(hits);
			} catch (err: any) {
				log.failure(`Search failed: ${err.message}`);
			}
		},
	});

	// 4. /kaio-status
	pi.registerCommand("kaio-status", {
		description: "0-token staleness drift report",
		handler: async (_args, ctx) => {
			const r = resolveRoot(root, ctx);
			const log = new LiveLog(ctx.ui, "status", pi);
			log.start("Checking staleness and provenance drift…");
			try {
				const report = await checkDrift(r);
				const summary = `DRIFT REPORT: freshness ${Math.round(report.freshness * 100)}%, ${report.stale.length} stale doc(s), ${report.undocumentedFiles.length} undocumented file(s)`;
				log.done(summary);
				if (report.stale.length > 0) {
					ctx.ui?.setStatus?.("kaioken", `${report.stale.length} stale docs`);
					ctx.ui?.setWidget?.("kaioken", [
						"Kaioken Drift:",
						...report.stale.slice(0, 10).map((d) => `  - ${d.document} (${d.changed.length} changed)`),
					]);
				}
			} catch (err: any) {
				log.failure(`Status check failed: ${err.message}`);
			}
		},
	});

	// 5. /kaio-verify
	pi.registerCommand("kaio-verify", {
		description: "Run native build+test gate",
		handler: async (_args, ctx) => {
			const r = resolveRoot(root, ctx);
			const log = new LiveLog(ctx.ui, "verify", pi);
			log.start("Running native verification gate (build + tests)…");
			try {
				const outcome = await runVerify(r);
				if (outcome.pass) {
					ctx.ui?.setStatus?.("kaioken", "verified ✓");
					log.done("VERIFY: PASS (0 errors)");
				} else {
					ctx.ui?.setStatus?.("kaioken", "UNVERIFIED CHANGES");
					log.failure(`VERIFY: FAIL\n${outcome.summary}`);
					ctx.ui?.setWidget?.("kaioken", [
						"Verify Failure:",
						...outcome.summary.split("\n").slice(-10),
					]);
				}
			} catch (err: any) {
				log.failure(`Verify failed: ${err.message}`);
			}
		},
	});

	// 6. /kaio-graph
	pi.registerCommand("kaio-graph", {
		description: "Build and inspect knowledge dependency graph",
		handler: async (_a, ctx) => {
			const r = resolveRoot(root, ctx);
			const log = new LiveLog(ctx.ui, "graph", pi);
			log.start("Building knowledge dependency graph…");
			try {
				const records = await gatherProvenance(r);
				const graph = buildGraph({ provenance: records });
				await writeGraph(r, graph);
				const stats = graphStats(graph);
				log.done(`Knowledge Graph: ${stats.nodes} nodes, ${stats.edges} edges, ${stats.coveredFiles} covered files. Saved to .kaioken/graph.json.`);
			} catch (err: any) {
				log.failure(`Graph build failed: ${err.message}`);
			}
		},
	});

	// 7. /kaio-serve
	pi.registerCommand("kaio-serve", {
		description: "Start offline documentation preview server",
		handler: async (_args, ctx) => {
			const r = resolveRoot(root, ctx);
			const log = new LiveLog(ctx.ui, "serve", pi);
			if (activeServer) {
				log.done(`Offline server already active at http://localhost:${activeServer.port}`);
				return;
			}
			log.start("Starting offline documentation preview server…");
			try {
				activeServer = await serve({ root: r, port: 4173 });
				log.done(`Offline preview server active at http://localhost:${activeServer.port}`);
			} catch (e: any) {
				log.failure(`Failed to start preview server: ${e.message}`);
			}
		},
	});

	// 8. /kaio-export
	pi.registerCommand("kaio-export", {
		description: "Export static standalone documentation bundle",
		handler: async (_a, ctx) => {
			const r = resolveRoot(root, ctx);
			const log = new LiveLog(ctx.ui, "export", pi);
			log.start("Exporting static standalone documentation bundle…");
			try {
				const wikiFiles = await readWikiTree(join(r, ".kaioken", "wiki")).catch(() => []);
				const cards = await readCards(r).catch(() => []);
				const skills = await loadSkills(r).catch(() => ({ skills: [], problems: [] }));
				const manifest: ExportManifest = {
					version: 1,
					generatedAt: new Date().toISOString(),
					repository: r,
					counts: {
						cards: cards.length,
						wikiDocuments: wikiFiles.length,
						skills: skills.skills.length,
					},
				};
				const bundleDir = join(r, ".kaioken", "export");
				const written = await writeExportTree(bundleDir, wikiFiles, manifest);
				log.done(`Exported ${written.length} asset(s) to .kaioken/export/ (${manifest.counts.wikiDocuments} wiki document(s), ${manifest.counts.cards} card(s), ${manifest.counts.skills} skill(s)).`);
			} catch (err: any) {
				log.failure(`Export failed: ${err.message}`);
			}
		},
	});

	// 9. /kaio-delegate
	pi.registerCommand("kaio-delegate", {
		description: "Isolate task in a git worktree",
		handler: async (args, ctx) => {
			const r = resolveRoot(root, ctx);
			const taskSlug = slug(args || "task");
			const log = new LiveLog(ctx.ui, "delegate", pi);
			log.start(`Creating isolated worktree for "${taskSlug}"…`);
			try {
				const wt = await createWorktree(r, taskSlug);
				const model = ctx.model ? `--model ${ctx.model.provider}/${ctx.model.id}` : "";
				log.done(
					`worktree: ${wt}\nrun: cd ${wt} && pi ${model}\nmerge: /kaio-merge ${taskSlug}`.replace(/ +$/m, ""),
				);
			} catch (e: any) {
				log.failure(`Failed to delegate worktree: ${e.message}`);
			}
		},
	});

	// 10. /kaio-merge
	pi.registerCommand("kaio-merge", {
		description: "Verify worktree then ff-merge",
		handler: async (args, ctx) => {
			const r = resolveRoot(root, ctx);
			const taskSlug = slug(args || "task");
			const wt = worktreePath(r, taskSlug);
			const log = new LiveLog(ctx.ui, "merge", pi);
			log.start(`Verifying and merging worktree "${taskSlug}"…`);
			try {
				const verification = await runVerify(wt);
				if (!verification.pass) {
					log.failure(`VERIFY FAIL in ${wt} — not merging\n${verification.summary}`);
					return;
				}
				const res = await ffMerge(r, taskSlug);
				if (!res.success) {
					log.failure(`Merge failed: ${res.message}`);
					return;
				}
				log.done(`merged ${taskSlug} ✓`);
			} catch (e: any) {
				log.failure(`Merge failed: ${e.message}`);
			}
		},
	});

	// 11. /kaio-plan <×N>
	pi.registerCommand("kaio-plan", {
		description: "Propose modules.yaml (checkpoint, then stop)",
		handler: async (args, ctx) => {
			const r = resolveRoot(root, ctx);
			const m = parseMult(args);
			const log = new LiveLog(ctx.ui, "plan", pi);
			log.start(`Starting module planning (multiplier ×${m})…`);

			if (!(await spendGate.confirm(ctx, "plan", m))) {
				log.failure("Module planning cancelled at spend confirmation.");
				return;
			}
			try {
				const client = clientFor(ctx);
				const out = await runPlan(r, m, client, {
					onProgress: (step) => log.progress(step),
				});
				const note = out.generated
					? "modules.yaml written by the model"
					: "modules.yaml written mechanically (no model bound)";
				log.done(`${note} — REVIEW, then /kaio-cards ${args || `×${m}`}\n\n${out.moduleTree.join("\n")}`);
				ctx.ui?.setWidget?.("kaioken", out.moduleTree.slice(0, 12));
			} catch (err: any) {
				log.failure(`Plan failed: ${err.message}`);
			} finally {
				ctx.ui?.setWorkingMessage?.(undefined);
			}
		},
	});

	// 12. /kaio-cards <×N>
	pi.registerCommand("kaio-cards", {
		description: "Generate knowledge cards from modules.yaml",
		handler: async (args, ctx) => {
			const r = resolveRoot(root, ctx);
			const m = parseMult(args);
			const log = new LiveLog(ctx.ui, "cards", pi);
			log.start(`Starting knowledge cards generation (multiplier ×${m})…`);

			if (!(await spendGate.confirm(ctx, "cards", m))) {
				log.failure("Cards generation cancelled at spend confirmation.");
				return;
			}
			try {
				log.progress("Reading module plan from .kaioken/module-plan.yaml…");
				const plan = await readModulePlan(r);
				if (!plan) {
					log.failure("No module plan found. Run /kaio-plan first.");
					return;
				}

				const client = clientFor(ctx);
				if (!client) {
					log.failure("No model bound; cards need one. Configure a model, then retry.");
					return;
				}

				log.progress(`Loaded module plan with ${plan.modules.length} module(s).`);
				log.progress("Scanning workspace files and loading symbol index…");
				const scanResult = await scan(r);
				const index = await readIndexArtifact(r).catch(() => null);
				const knownFiles = new Map(scanResult.files.map((f) => [f.path, f.hash]));
				log.progress(`Scanned ${scanResult.fileCount} files, ${index?.symbolCount ?? 0} symbols indexed.`);

				const results = await generateCards(plan, index, client, {
					multiplier: m,
					knownFiles,
					onTaskStart: (id, done, total) =>
						log.taskStarted(id, `cards ${done + 1}/${total}: ${id}…`),
					onProgress: (id, done, total) =>
						log.docDone(id, `cards ${done + 1}/${total}: ${id}`),
				});

				for (const result of results) await writeCard(r, result.card);

				const ungrounded = results.reduce((n, x) => n + x.card.verification.ungrounded.length, 0);
				log.done(
					`Wrote ${results.length} card(s) to .kaioken/cards. ${ungrounded} ungrounded claim(s) reported in each card's verification.`,
					"grounded",
				);
				ctx.ui?.setWidget?.(
					"kaioken",
					results.slice(0, 12).map((x) => `card ${x.card.moduleId}: ${x.card.verification.grounded} grounded`),
				);
			} catch (err: any) {
				log.failure(`Cards generation failed: ${err.message}`);
			} finally {
				ctx.ui?.setWorkingMessage?.(undefined);
			}
		},
	});

	// 13. /kaio-wiki [--plan] <×N>
	pi.registerCommand("kaio-wiki", {
		description: "Cascade wiki chapters generation",
		handler: async (args, ctx) => {
			const r = resolveRoot(root, ctx);
			const m = parseMult(args);
			const isPlan = /--plan/.test(args);
			const log = new LiveLog(ctx.ui, "wiki", pi);
			log.start(
				isPlan
					? `Starting wiki structure planning (multiplier ×${m})…`
					: `Starting wiki generation cascade (multiplier ×${m})…`,
			);

			if (!(await spendGate.confirm(ctx, "wiki", m))) {
				log.failure("Wiki cascade cancelled at spend confirmation.");
				return;
			}

			const client = clientFor(ctx);
			if (!client) {
				log.failure("No model bound; the wiki cascade needs one.");
				return;
			}

			try {
				log.progress("Scanning workspace files and reading symbol index…");
				const scanResult = await scan(r);
				const index = await readIndexArtifact(r).catch(() => null);
				log.progress(`Scanned ${scanResult.fileCount} files, ${index?.symbolCount ?? 0} symbols indexed.`);

				// `--plan` is the checkpoint: outline only, then stop.
				if (isPlan) {
					log.taskStarted("planning", "Proposing chapter outline with model…");
					const { plan } = await planWiki({ scan: scanResult, index, client, multiplier: m });
					const path = await writeWikiPlan(r, plan);
					log.done(`Wrote ${plan.chapters.length} chapter(s) to ${path} — edit, then rerun without --plan.`);
					ctx.ui?.setWidget?.("kaioken", plan.chapters.slice(0, 12).map((c) => `chapter ${c.id}: ${c.title}`));
					return;
				}

				log.progress("Reading wiki plan from .kaioken/wiki-plan.yaml…");
				const plan = await readWikiPlan(r);
				if (!plan) {
					log.failure("No wiki plan found. Run /kaio-wiki --plan first.");
					return;
				}

				const brief = (await readBrief(r)) ?? undefined;
				log.progress(`Loaded wiki plan with ${plan.chapters.length} chapter(s). Starting generation…`);

				const out = await runWiki({
					root: r,
					plan,
					scan: scanResult,
					index,
					client,
					multiplier: m,
					...(brief ? { brief } : {}),
					onDocument: async (doc) => {
						await writeWikiDocument(r, doc);
					},
					onFailure: (failure) =>
						log.failure(`wiki: ${failure.kind} ${failure.document}: ${failure.reason}`),
					onTaskStart: (label) => log.taskStarted(label, `wiki: ${label}…`),
					onProgress: (label, done, total) =>
						// The total counts one unit per chapter up front; planned
						// sections extend the run past it, so it is a lower bound.
						log.docDone(label, `wiki ${done}/${total}${label.startsWith("section") ? "+" : ""}: ${label}`),
				});

				// Persist the resolved sections so a rerun reuses the same ids.
				await writeWikiPlan(r, out.plan);
				await writeProvenance(
					r,
					out.documents.map((d) => d.provenance),
				);
				await writeWikiIndex(r, out.plan);

				// Record what the verifier concluded, so a reader can check the
				// grounding claim rather than take it on trust. Until this existed
				// the defects were computed, printed once, and dropped — leaving
				// the serve site with nothing to badge.
				await writeVerification(r, {
					model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "offline",
					multiplier: m,
					documents: out.documents.map((d) => ({
						document: d.path,
						grounded: d.verification.grounded,
						uncovered: d.verification.uncovered,
						coverage: d.verification.coverage,
						defects: d.verification.defects,
					})),
				});

				const defects = out.documents.reduce((n, d) => n + groundingDefects(d.verification.defects).length, 0);
				log.done(
					`Wrote ${out.documents.length} document(s); ${defects} ungrounded claim(s) reported${out.failures.length ? `, ${out.failures.length} failure(s)` : ""}.`,
					"grounded",
				);
			} catch (err: any) {
				log.failure(`Wiki cascade failed: ${err.message}`);
			} finally {
				ctx.ui?.setWorkingMessage?.(undefined);
			}
		},
	});

	// 14. /kaio-update [--dry] <×N>
	pi.registerCommand("kaio-update", {
		description: "Update stale documents from provenance diff",
		handler: async (args, ctx) => {
			const r = resolveRoot(root, ctx);
			const m = parseMult(args);
			const log = new LiveLog(ctx.ui, "update", pi);
			log.start(`Starting staleness check (multiplier ×${m})…`);

			if (!(await spendGate.confirm(ctx, "update", m))) {
				log.failure("Update cancelled at spend confirmation.");
				return;
			}
			try {
				const drift = await checkDrift(r);
				const stale = drift.documents.filter((d) => d.freshness !== "current");

				if (stale.length === 0) {
					log.done("Nothing is stale. No spend, no regeneration.");
					return;
				}

				if (/--dry/.test(args)) {
					log.done(
						`${stale.length} stale document(s): ${stale.slice(0, 8).map((d) => d.document).join(", ")}`,
					);
					return;
				}

				const client = clientFor(ctx);
				if (!client) {
					log.failure("No model bound; updating needs one.");
					return;
				}

				// Regenerate only the stale documents, by path, reusing the plan.
				const plan = await readWikiPlan(r);
				if (!plan) {
					log.failure("No wiki plan found; nothing to update.");
					return;
				}

				log.progress("Scanning workspace files and reading symbol index…");
				const scanResult = await scan(r);
				const index = await readIndexArtifact(r).catch(() => null);
				const brief = (await readBrief(r)) ?? undefined;

				log.progress(`Regenerating ${stale.length} stale document(s)…`);
				const out = await runWiki({
					root: r,
					plan,
					scan: scanResult,
					index,
					client,
					multiplier: m,
					onlyDocuments: stale.map((d) => d.document),
					...(brief ? { brief } : {}),
					onDocument: async (doc) => {
						await writeWikiDocument(r, doc);
					},
					onFailure: (failure) =>
						log.failure(`update: ${failure.kind} ${failure.document}: ${failure.reason}`),
					onTaskStart: (label) => log.taskStarted(label, `update: ${label}…`),
					onProgress: (label, done, total) =>
						log.docDone(label, `update ${done}/${total}: ${label}`),
				});

				await writeProvenance(
					r,
					out.documents.map((d) => d.provenance),
				);
				log.done(`Regenerated ${out.documents.length} of ${stale.length} stale document(s).`);
			} catch (err: any) {
				log.failure(`Update failed: ${err.message}`);
			} finally {
				ctx.ui?.setWorkingMessage?.(undefined);
			}
		},
	});

	// 15. /kaio-research <topic> <×N>
	pi.registerCommand("kaio-research", {
		description: "Grounded deep research report on topic",
		handler: async (args, ctx) => {
			const r = resolveRoot(root, ctx);
			const m = parseMult(args);
			const topic = args.replace(/--?\w+/g, "").replace(/[×x]\d+/i, "").trim();

			const log = new LiveLog(ctx.ui, "research", pi);
			if (!topic) {
				log.failure("Usage: /kaio-research <topic> <×N>");
				return;
			}

			log.start(`Starting deep research for "${topic}" (multiplier ×${m})…`);
			if (!(await spendGate.confirm(ctx, "research", m))) {
				log.failure("Research cancelled at spend confirmation.");
				return;
			}

			const client = clientFor(ctx);
			if (!client) {
				log.failure("No model bound; research needs one.");
				return;
			}

			// The network is injected here and nowhere else, so the research core
			// itself stays transport-free and offline-testable (Invariant 10).
			const depth = depthFor(m);
			try {
				log.progress(`Gathering web sources for "${topic}" (depth ${depth})…`);
				const gathered = await gatherSources({
					question: topic,
					depth,
					search: web.search,
					fetch: web.fetch,
				});

				const fetched = gathered.sources.filter((s) => s.fetched).length;
				if (fetched === 0) {
					log.failure(
						`No page could be fetched for "${topic}". Nothing to research, and writing without sources would be fiction.`,
					);
					return;
				}

				log.progress(`Fetched ${fetched}/${gathered.sources.length} source(s). Writing report with model…`);
				const { document } = await generateResearch({ question: topic, gathered, depth, client });
				const path = await writeResearchDocument(r, document);

				log.done(
					`${document.verification.grounded}/${document.verification.cited} citation(s) grounded, ` +
						`${document.verification.defects.length} defect(s). Written to ${path}.`,
				);
			} catch (err: any) {
				log.failure(`Research failed: ${err.message}`);
			} finally {
				ctx.ui?.setWorkingMessage?.(undefined);
			}
		},
	});

	// 16. /kaio-skills <×N>
	pi.registerCommand("kaio-skills", {
		description: "Propose and write task procedures into .kaioken/skills",
		handler: async (args, ctx) => {
			const r = resolveRoot(root, ctx);
			const m = parseMult(args);
			const log = new LiveLog(ctx.ui, "skills", pi);
			log.start(`Starting skill generation (multiplier ×${m})…`);

			if (!(await spendGate.confirm(ctx, "skillgen", m))) {
				log.failure("Skill generation cancelled at spend confirmation.");
				return;
			}

			const client = clientFor(ctx);
			if (!client) {
				log.failure("No model bound; skill generation needs one.");
				return;
			}

			try {
				log.progress("Scanning workspace files and reading wiki plan…");
				const scanResult = await scan(r);
				const index = await readIndexArtifact(r).catch(() => null);
				const plan = await readWikiPlan(r);

				log.taskStarted("proposing", "Proposing skills with model…");
				const proposals = await proposeSkills({
					scan: scanResult,
					index,
					client,
					...(plan ? { chapters: plan.chapters.map((c) => c.title) } : {}),
				});

				if (proposals.length === 0) {
					log.done("The model proposed no skills for this repository.");
					return;
				}

				log.progress(`Model proposed ${proposals.length} skill(s). Writing skill files…`);
				const written: string[] = [];
				let ungrounded = 0;
				for (let i = 0; i < proposals.length; i++) {
					const proposal = proposals[i] as (typeof proposals)[number];
					log.taskStarted(proposal.name, `skills ${i + 1}/${proposals.length}: ${proposal.name}…`);
					try {
						const result = await writeSkill({ root: r, proposal, scan: scanResult, index, client });
						written.push(result.name);
						ungrounded += result.ungrounded.length;
						log.docDone(proposal.name, `skills ${i + 1}/${proposals.length}: ✓ ${proposal.name}`);
					} catch (error) {
						log.failure(`skills: skipped ${proposal.name}: ${(error as Error).message}`);
					}
				}

				log.done(
					`Wrote ${written.length} skill(s): ${written.join(", ")}.` +
						(ungrounded ? ` ${ungrounded} ungrounded path(s) reported.` : ""),
				);
			} catch (err: any) {
				log.failure(`Skills generation failed: ${err.message}`);
			} finally {
				ctx.ui?.setWorkingMessage?.(undefined);
			}
		},
	});
}
