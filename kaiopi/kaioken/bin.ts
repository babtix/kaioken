#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { generateCompletion } from "./completion/src/index.ts";
import {
	diffScorecards,
	formatNdjson,
	formatReport,
	formatScorecard,
	readScorecard,
	runEval,
	toScorecard,
	writeScorecard,
} from "./evals/src/index.ts";
import {
	detectConflicts,
	formatDelegationRecipe,
	generateDelegationRecipe,
	getThreeWayDiff,
	hookStatus,
	installPostCommit,
	listWorktrees,
	pruneWorktrees,
	readDiff,
	readHookLog,
	removePostCommit,
	renderConflictCard,
	safeMerge,
	worktreeStatus,
} from "./gitops/src/index.ts";
import { buildGraph, graphStats, readWikiTree, renderGraphJson, renderGraphMarkdown, renderGraphMermaid, writeExportTree, writeGraph, type ExportManifest } from "./graph/src/index.ts";
import { predictImpactForSymbol, renderImpact } from "./impact/src/index.ts";
import { buildIndex, readIndexArtifact, SymbolOracle, writeIndexArtifact } from "./index/src/index.ts";
import {
	BudgetCeilingManager,
	estimatePreflightTokens,
	estimateSpend,
	formatModelComparisonMatrix,
	formatMultiplierDial,
	formatOfflineModeBadge,
	formatPricingCard,
	formatSpendAuditReport,
	STANDARD_MODEL_CATALOG,
} from "./modelport/src/index.ts";
import {
	computeCoverageIndicator,
	deduplicateCards,
	exportCardsToObsidianVault,
	formatCardBadge,
	formatCheckpointReport,
	formatCitationDensityGauge,
	formatCoverageGauge,
	mergeModules,
	moveFile,
	proposeModulePlan,
	readCards,
	readModulePlan,
	readModulePlanRaw,
	renderCard3D,
	renderCardPair,
	renderCardSortingGrid,
	renderModuleTree,
	splitModule,
	validateYamlCheckpoint,
	writeModulePlan,
} from "./plan/src/index.ts";
import { checkDrift, gatherProvenance } from "./provenance/src/index.ts";
import { readResearchDocuments } from "./research/src/index.ts";
import {
	formatClassificationTable,
	KAIOKEN_DIR,
	readScanArtifact,
	scan,
	suggestIgnoreRules,
	visualizeEntropyProfile,
	writeScanArtifact,
} from "./scan/src/index.ts";
import { bm25Search } from "./search/src/index.ts";
import { serve } from "./serve/src/index.ts";
import { discoverRepoCommands } from "./skillgen/src/index.ts";
import { loadSkills } from "./skills/src/index.ts";
import { runVerify } from "./verify/src/index.ts";
import {
	budgetChapterEvidence,
	computeDocCoverageHeatmap,
	formatLinkValidationReport,
	readProvenance,
	readVerification,
	readWikiPlan,
	renderCoverageHeatmap,
	validateWikiLinks,
	wikiDir,
	type WikiDocument,
} from "./wiki/src/index.ts";

function printHelp(): void {
	console.log(`Kaioken CLI — Grounded Intelligence Pipeline for Codebases

Usage:
  kaioken <command> [options] [arguments]

Commands:
  scan        Deterministic repo inventory, AST symbol index, and risk flags
  symbols     Lookup symbol declaration in AST oracle
  status      0-token staleness and drift report
  search      BM25 lexical and structural search across the codebase
  impact      Predict blast radius and impact for a symbol
  verify      Run native build and test verification gate
  plan        Propose and write module decomposition plan (modules.yaml)
  cards       Read and inspect knowledge cards from .kaioken/cards
  wiki        Inspect wiki chapters, verification, and provenance
  serve       Start offline documentation preview server
  research    Read grounded research documents from .kaioken/research
  skills      Load and inspect procedures in .kaioken/skills
  skillgen    Discover repo commands and inspect procedure opportunities
   graph       Build and render knowledge dependency graph
   gitops      Git hooks, diffs, and worktree operations
   evals       Run 10-probe groundedness evaluation suite
   spend       Spend transparency, token estimates, pricing cards, and budget tracking
   export      Export static standalone documentation bundle (parity with /kaio-export)
   update      Report stale documents from provenance diff (parity with /kaio-update --dry)
   delegate    Isolate a task in a git worktree (parity with /kaio-delegate)
   merge       Verify a worktree then fast-forward merge (parity with /kaio-merge)
   completion  Print shell auto-completion script (bash, zsh, fish)

Global Options:
  --root <path>       Target repository root (default: current working directory)
  --json              Output raw JSON results
  -h, --help          Show this help message

Command Options:
  scan:     --progress           Display streaming throughput meter and file counter
            --table              Display formatted risk classification breakdown table
            --entropy            Compute Shannon entropy and identify suspicious strings
            --quarantine         Interactive quarantine suggestions and .gitignore updates
  search:   --limit <n>          Maximum search results to return (default: 8)
            --preview            Instant live query preview across code, docs, cards
            --explain            Reciprocal Rank Fusion (RRF) & BM25 score visualizer
            --boost <path:mul>   Custom directory boost multipliers (e.g. "src:1.5,api:2.0")
  plan:     --multiplier <n>     Depth multiplier for planning (default: 1)
            --budget <usd>       Enforce session budget limit before proposing plan
            --tree               Display hierarchical module tree explorer
            --coverage           Display file coverage indicator gauge and unassigned breakdown
            --lint               Validate YAML checkpoint and lint module purpose statements
            --cardsort           Render visual terminal card-sorting board
            --split <modId>      Split an oversized module into submodules
            --merge <src:target> Merge two modules together
            --move <file:modId>  Reassign file to a target module
  cards:    --3d                 Render 3D isometric perspective box
            --flip               Render dual-sided card pair (front & back)
            --badge              Display visual verification status badges and citation density
            --dedupe             Deduplicate and merge overlapping knowledge cards
            --export <dir>       Export knowledge cards to Obsidian-compatible vault directory
  wiki:     --heatmap            Display repository documentation coverage heatmap
            --validate-links     Validate cross-chapter relative markdown links and anchors
            --budget <tokens>    Display hierarchical token budgeting breakdown per chapter
  spend:    --multiplier <n>     Depth multiplier (1–10, default: 1)
            --budget <usd>       Session hard budget ceiling in USD
            --model <name>       Target model ID for pricing calculations
            --matrix             Show multi-provider pricing comparison matrix
            --audit              Show chronological session spend audit ledger
            --dial               Render interactive multiplier dial with depth metrics
            --offline            Show zero-cost offline mode badge & avoided spend
  serve:    --port <n>           Port for preview server (default: 4173)
            --host <str>         Host to bind server to (default: 127.0.0.1)
  graph:    --format <fmt>       Output format: mermaid | markdown | json | summary
            --write              Write graph to .kaioken/graph.json
   gitops:   --action <act>       Action: status | list | delegate | merge | prune | conflict | diff | install-hook | remove-hook | hook-log
   evals:    --repo <path>        Target repository for evaluations
             --multiplier <n>     Depth multiplier for planning (default: 3)
             --scorecard          Write .kaioken/evals/scorecard.json and print regression vs baseline
             --ndjson             Stream one JSON object per line for CI pipelines
   update:   --dry                List stale documents without regenerating (default behavior)
   completion: --shell <sh>       Shell dialect: bash | zsh | fish (default: bash)
`);
}

async function main(): Promise<void> {
	const parsed = parseArgs({
		args: process.argv.slice(2),
		allowPositionals: true,
		strict: false,
		options: {
			root: { type: "string" },
			json: { type: "boolean" },
			help: { type: "boolean", short: "h" },
			progress: { type: "boolean" },
			table: { type: "boolean" },
			entropy: { type: "boolean" },
			quarantine: { type: "boolean" },
			limit: { type: "string" },
			preview: { type: "boolean" },
			explain: { type: "boolean" },
			boost: { type: "string" },
			multiplier: { type: "string" },
			budget: { type: "string" },
			model: { type: "string" },
			matrix: { type: "boolean" },
			audit: { type: "boolean" },
			dial: { type: "boolean" },
			offline: { type: "boolean" },
			port: { type: "string" },
			host: { type: "string" },
			format: { type: "string" },
			action: { type: "string" },
			repo: { type: "string" },
			shell: { type: "string" },
			scorecard: { type: "boolean" },
			ndjson: { type: "boolean" },
			dry: { type: "boolean" },
			write: { type: "boolean" },
			tree: { type: "boolean" },
			coverage: { type: "boolean" },
			lint: { type: "boolean" },
			split: { type: "string" },
			merge: { type: "string" },
			move: { type: "string" },
			cardsort: { type: "boolean" },
			"3d": { type: "boolean" },
			flip: { type: "boolean" },
			badge: { type: "boolean" },
			dedupe: { type: "boolean" },
			export: { type: "string" },
			heatmap: { type: "boolean" },
			"validate-links": { type: "boolean" },
		},
	});

	const { values, positionals } = parsed;
	const [cmd, ...args] = positionals;

	if (values.help || !cmd) {
		printHelp();
		process.exit(0);
	}

	const root = values.root ? String(values.root) : process.cwd();
	const isJson = Boolean(values.json);

	switch (cmd) {
		case "scan": {
			const showProgress = Boolean(values.progress);
			const checkEntropy = Boolean(values.entropy);
			const showTable = Boolean(values.table);
			const doQuarantine = Boolean(values.quarantine);

			const scanResult = await scan(root, {
				checkEntropy,
				onProgress: showProgress
					? (p) => {
							process.stdout.write(
								`\rScanning [${p.scannedFiles} files, ${(p.scannedBytes / 1024).toFixed(0)} KB] (${p.throughputFilesPerSec} files/s) ${p.currentFile.slice(-35)}   `,
							);
						}
					: undefined,
			});
			if (showProgress) {
				process.stdout.write("\n");
			}

			await writeScanArtifact(root, scanResult);

			const previous = await readIndexArtifact(root);
			const { index, stats } = await buildIndex(scanResult, { previous });
			await writeIndexArtifact(root, index);

			const risks: Record<string, string[]> = {};
			for (const file of scanResult.files) {
				for (const risk of file.risk) {
					(risks[risk] ??= []).push(file.path);
				}
			}
			const riskPath = join(root, KAIOKEN_DIR, "risk.json");
			await mkdir(join(root, KAIOKEN_DIR), { recursive: true });
			await writeFile(riskPath, `${JSON.stringify(risks, null, 2)}\n`, "utf8");

			if (showTable) {
				console.log(formatClassificationTable(scanResult.secretFindings ?? []));
			}

			if (checkEntropy) {
				const allEntropy = scanResult.files.flatMap((f) => f.entropyFindings ?? []);
				console.log(visualizeEntropyProfile(allEntropy));
			}

			if (doQuarantine) {
				const findings = scanResult.secretFindings ?? [];
				const suggested = suggestIgnoreRules(findings);
				console.log("=== Kaioken Quarantine Wizard ===");
				console.log(`Detected ${findings.length} quarantine candidate(s).`);
				if (suggested.length > 0) {
					console.log("\nRecommended .gitignore rules to prevent credential leaks:");
					for (const rule of suggested) {
						console.log(`  + ${rule}`);
					}
				}
			}

			if (!isJson && (showTable || checkEntropy || doQuarantine)) {
				break;
			}

			console.log(
				JSON.stringify(
					{
						root,
						scan: {
							fileCount: scanResult.fileCount,
							totalBytes: scanResult.totalBytes,
							riskCount: Object.keys(risks).length,
							secretFindingsCount: scanResult.secretFindings?.length ?? 0,
						},
						index: {
							fileCount: index.fileCount,
							symbolCount: index.symbolCount,
							stats,
						},
					},
					null,
					2,
				),
			);
			break;
		}

		case "symbols": {
			const query = args.join(" ").trim();
			const index = (await readIndexArtifact(root)) ?? {
				root,
				builtAt: "",
				fileCount: 0,
				symbolCount: 0,
				unparsedLanguages: {},
				files: [],
			};
			const oracle = new SymbolOracle(index);
			const hits = oracle.lookup(query);
			if (isJson) {
				console.log(JSON.stringify(hits, null, 2));
			} else if (hits.length === 0) {
				console.log(`NEGATIVE GUARANTEE: no symbol matching "${query}" is declared.`);
			} else {
				console.log(JSON.stringify(hits, null, 2));
			}
			break;
		}

		case "status": {
			const report = await checkDrift(root);
			if (isJson) {
				console.log(JSON.stringify(report, null, 2));
			} else {
				console.log(
					`DRIFT REPORT: freshness ${Math.round(report.freshness * 100)}%, ${report.stale.length} stale doc(s), ${report.undocumentedFiles.length} undocumented file(s)`,
				);
				if (report.stale.length > 0) {
					console.log("Stale documents:");
					for (const d of report.stale) {
						console.log(`  - ${d.document} (${d.changed.length} changed file(s))`);
					}
				}
			}
			break;
		}

		case "search": {
			const query = args.join(" ").trim();
			const limit = values.limit ? parseInt(String(values.limit), 10) : 8;
			const isPreview = Boolean(values.preview);
			const isExplain = Boolean(values.explain);
			let boostRecord: Record<string, number> | undefined;
			if (values.boost) {
				boostRecord = {};
				const pairs = String(values.boost).split(",");
				for (const p of pairs) {
					const [dir, factor] = p.split(":");
					if (dir && factor) {
						boostRecord[dir.trim()] = parseFloat(factor.trim()) || 1.0;
					}
				}
			}
			const results = await bm25Search(root, query, {
				limit,
				preview: isPreview,
				explain: isExplain,
				boost: boostRecord,
				json: isJson,
			});
			console.log(results);
			break;
		}

		case "impact": {
			const symbol = args.join(" ").trim();
			const report = await predictImpactForSymbol(root, symbol);
			if (isJson) {
				console.log(JSON.stringify(report, null, 2));
			} else {
				console.log(renderImpact(report));
			}
			break;
		}

		case "verify": {
			const result = await runVerify(root);
			if (isJson) {
				console.log(JSON.stringify(result, null, 2));
				process.exit(result.pass ? 0 : 1);
			}
			if (result.pass) {
				console.log(`VERIFY: PASS\n${result.summary}`);
				process.exit(0);
			} else {
				console.error(`VERIFY: FAIL\n${result.summary}`);
				process.exit(1);
			}
			break;
		}

		case "plan": {
			const multiplier = values.multiplier ? parseInt(String(values.multiplier), 10) : 1;
			if (values.budget) {
				const budgetLimit = parseFloat(String(values.budget));
				const estTokens = estimatePreflightTokens("plan", multiplier);
				const estSpend = estimateSpend(STANDARD_MODEL_CATALOG["gemini-2.5-flash"], estTokens);
				const mgr = new BudgetCeilingManager({ hardCeilingUsd: budgetLimit });
				const check = mgr.checkBudget(estSpend.usd ?? 0, "plan");
				if (!check.allowed) {
					console.error(`ERROR: Session budget ceiling of $${budgetLimit.toFixed(4)} USD exceeded: projected spend is $${(estSpend.usd ?? 0).toFixed(4)} USD.`);
					process.exit(1);
				}
			}

			const scanResult = await scan(root);
			let plan = await readModulePlan(root);

			// Handle checkpoint validation / linting
			if (values.lint) {
				const rawYaml = (await readModulePlanRaw(root)) ?? "";
				const report = validateYamlCheckpoint(rawYaml, scanResult);
				if (isJson) {
					console.log(JSON.stringify(report, null, 2));
				} else {
					console.log(formatCheckpointReport(report));
				}
				process.exit(report.valid ? 0 : 1);
			}

			// If plan doesn't exist yet or proposing fresh plan
			if (!plan || (!values.tree && !values.coverage && !values.cardsort && !values.split && !values.merge && !values.move)) {
				const index = await readIndexArtifact(root);
				const proposeResult = await proposeModulePlan(scanResult, index, null, { multiplier });
				plan = proposeResult.plan;
				const planPath = await writeModulePlan(root, plan);

				if (!values.tree && !values.coverage && !values.cardsort && !values.split && !values.merge && !values.move) {
					if (isJson) {
						console.log(
							JSON.stringify(
								{ plan, validation: proposeResult.validation, planPath },
								null,
								2,
							),
						);
					} else {
						if (proposeResult.source !== "model") {
							console.log(formatOfflineModeBadge({ stage: "plan", reason: `deterministic local heuristics (${proposeResult.source})` }));
						}
						console.log(`Module plan (${proposeResult.source}) written to ${planPath}`);
						console.log(`Decomposed into ${plan.modules.length} module(s):`);
						for (const m of plan.modules) {
							console.log(`  - ${m.id} (${m.files.length} file(s)): ${m.name}`);
						}
						if (proposeResult.validation.defects.length > 0) {
							console.log(`Validation defects (${proposeResult.validation.defects.length}):`);
							for (const d of proposeResult.validation.defects) {
								console.log(`  [${d.severity}] ${d.message}`);
							}
						}
					}
					break;
				}
			}

			// Handle split module
			if (values.split) {
				const targetId = String(values.split).trim();
				plan = splitModule(plan, targetId);
				const planPath = await writeModulePlan(root, plan);
				if (isJson) {
					console.log(JSON.stringify({ action: "split", targetId, plan, planPath }, null, 2));
				} else {
					console.log(`Split module "${targetId}" into submodules. Updated ${planPath}`);
					console.log(renderModuleTree(plan, { showFiles: false }));
				}
				break;
			}

			// Handle merge modules
			if (values.merge) {
				const parts = String(values.merge).split(/[:;,]/).map((s) => s.trim());
				if (parts.length < 2) {
					console.error("ERROR: --merge requires source and target module IDs format: --merge <source:target>");
					process.exit(1);
				}
				const [sourceId, targetId] = parts as [string, string];
				plan = mergeModules(plan, sourceId, targetId);
				const planPath = await writeModulePlan(root, plan);
				if (isJson) {
					console.log(JSON.stringify({ action: "merge", sourceId, targetId, plan, planPath }, null, 2));
				} else {
					console.log(`Merged module "${sourceId}" into "${targetId}". Updated ${planPath}`);
					console.log(renderModuleTree(plan, { showFiles: false }));
				}
				break;
			}

			// Handle move file
			if (values.move) {
				const parts = String(values.move).split(/[:;]/).map((s) => s.trim());
				if (parts.length < 2) {
					console.error("ERROR: --move requires filePath and targetModuleId format: --move <filePath:targetModuleId>");
					process.exit(1);
				}
				const [file, toModuleId] = parts as [string, string];
				plan = moveFile(plan, file, toModuleId);
				const planPath = await writeModulePlan(root, plan);
				if (isJson) {
					console.log(JSON.stringify({ action: "move", file, toModuleId, plan, planPath }, null, 2));
				} else {
					console.log(`Moved "${file}" into module "${toModuleId}". Updated ${planPath}`);
				}
				break;
			}

			// Handle coverage gauge
			if (values.coverage) {
				const coverageReport = computeCoverageIndicator(plan, scanResult);
				if (isJson) {
					console.log(JSON.stringify(coverageReport, null, 2));
				} else {
					console.log(formatCoverageGauge(coverageReport, { showBreakdown: true }));
				}
				break;
			}

			// Handle tree view
			if (values.tree) {
				if (isJson) {
					console.log(JSON.stringify(plan.modules, null, 2));
				} else {
					console.log(renderModuleTree(plan, { showFiles: true }));
				}
				break;
			}

			// Handle cardsort visual board
			if (values.cardsort) {
				if (isJson) {
					console.log(JSON.stringify(plan.modules, null, 2));
				} else {
					console.log(renderCardSortingGrid(plan));
				}
				break;
			}

			break;
		}

		case "cards": {
			const cards = await readCards(root);

			if (values.export) {
				const targetDir = String(values.export);
				const exportResult = await exportCardsToObsidianVault(cards, targetDir);
				if (isJson) {
					console.log(JSON.stringify(exportResult, null, 2));
				} else {
					console.log(`Exported ${exportResult.writtenFiles.length} card(s) to Obsidian vault at ${targetDir}`);
					console.log(`Map of Content (MOC): ${exportResult.mapOfContentPath}`);
				}
				break;
			}

			if (values.dedupe) {
				const dedupeResult = deduplicateCards(cards);
				if (isJson) {
					console.log(JSON.stringify(dedupeResult, null, 2));
				} else {
					console.log(
						`Deduplication: ${cards.length} original card(s) -> ${dedupeResult.cards.length} deduplicated card(s)`,
					);
					console.log(
						`Merged ${dedupeResult.mergedCount} overlapping card(s) in ${dedupeResult.clusters.length} cluster(s).`,
					);
				}
				break;
			}

			if (isJson) {
				console.log(JSON.stringify(cards, null, 2));
			} else if (cards.length === 0) {
				console.log("No cards found in .kaioken/cards.");
			} else {
				console.log(`Loaded ${cards.length} card(s) from .kaioken/cards:`);
				for (const c of cards) {
					if (values["3d"]) {
						console.log(renderCard3D(c, { side: "front" }));
					} else if (values.flip) {
						console.log(renderCardPair(c));
					} else {
						const badge = values.badge
							? ` ${formatCardBadge(c.verification)} ${formatCitationDensityGauge(c.verification)}`
							: "";
						console.log(
							`  - [${c.moduleId}] (${c.entryPoints.length} entry point(s)): ${c.summary.slice(0, 100)}${badge}`,
						);
					}
				}
			}
			break;
		}

		case "wiki": {
			const plan = await readWikiPlan(root);
			const verification = await readVerification(root);
			const provenance = await readProvenance(root);

			const wikiDirAbs = wikiDir(root);
			const docFiles: string[] = [];
			async function collectDocs(dir: string): Promise<void> {
				try {
					const entries = await readdir(dir, { withFileTypes: true });
					for (const entry of entries) {
						const res = join(dir, entry.name);
						if (entry.isDirectory()) {
							await collectDocs(res);
						} else if (entry.isFile() && entry.name.endsWith(".md")) {
							docFiles.push(res);
						}
					}
				} catch {
					// directory might not exist
				}
			}
			await collectDocs(wikiDirAbs);

			const documents: WikiDocument[] = [];
			for (const f of docFiles) {
				try {
					const relPath = relative(wikiDirAbs, f).split("\\").join("/");
					const body = await readFile(f, "utf8");
					const titleMatch = /^#\s+(.+)$/m.exec(body);
					const title = titleMatch ? titleMatch[1].trim() : relPath;
					const prov = provenance?.documents.find((p) => p.document === relPath) ?? {
						document: relPath,
						chapterId: relPath.split("/")[0] || "",
						generatedAt: "",
						sources: [],
					};
					const ver = verification?.documents.find((v) => v.document === relPath) ?? {
						grounded: 0,
						defects: [],
						uncovered: [],
						coverage: 0,
					};
					documents.push({
						path: relPath,
						chapterId: prov.chapterId,
						title,
						body,
						provenance: prov,
						verification: ver,
					});
				} catch {
					// ignore read errors
				}
			}

			if (values.heatmap) {
				const scanResult = await readScanArtifact(root);
				const indexResult = await readIndexArtifact(root);
				if (!scanResult || !indexResult || !plan) {
					console.error("Heatmap requires scan, index, and wiki-plan artifacts. Run `kaioken scan` and plan first.");
					break;
				}
				const heatmap = computeDocCoverageHeatmap(documents, scanResult, indexResult, plan);
				if (isJson) {
					console.log(JSON.stringify(heatmap, null, 2));
				} else {
					console.log(renderCoverageHeatmap(heatmap));
				}
				break;
			}

			if (values["validate-links"]) {
				const report = validateWikiLinks({ documents });
				if (isJson) {
					console.log(JSON.stringify(report, null, 2));
				} else {
					console.log(formatLinkValidationReport(report));
				}
				break;
			}

			if (values.budget !== undefined) {
				if (!plan) {
					console.log("No wiki plan found in .kaioken/wiki/plan.json.");
					break;
				}
				const indexResult = await readIndexArtifact(root);
				const maxTokens = typeof values.budget === "string" ? parseInt(values.budget, 10) || 4000 : 4000;
				console.log(
					`Hierarchical Evidence Budgeting across ${plan.chapters.length} chapter(s) (ceiling: ${maxTokens} tokens):`,
				);
				for (const ch of plan.chapters) {
					const chFiles = (ch.files ?? []).map((p) => {
						const fMap = indexResult?.files.find((f) => f.path === p);
						return {
							path: p,
							language: fMap?.language ?? "typescript",
							lineCount: fMap?.lineCount ?? 50,
							declarations: (fMap?.symbols ?? []).map((s) => `+ export ${s.kind} ${s.name}: ${s.signature}`),
						};
					});
					const budgeted = budgetChapterEvidence({ chapter: ch, files: chFiles, maxTokens });
					console.log(
						`  - Chapter [${ch.id}] (${ch.title}): ${budgeted.tokenEstimate} est. tokens (${budgeted.compressionRatio < 1 ? `pruned ${budgeted.prunedDeclarationsCount} decls, ratio ${budgeted.compressionRatio.toFixed(2)}` : "100% full detail"})`,
					);
				}
				break;
			}

			if (isJson) {
				console.log(JSON.stringify({ plan, verification, provenance }, null, 2));
			} else if (!plan) {
				console.log("No wiki plan found in .kaioken/wiki/plan.json.");
			} else {
				console.log(`Wiki: ${plan.chapters.length} chapter(s)`);
				for (const ch of plan.chapters) {
					console.log(`  - Chapter ${ch.id}: ${ch.title} (${ch.sections.length} section(s))`);
				}
				if (verification) {
					console.log(
						`Verification: multiplier ${verification.multiplier}, model: ${verification.model}, documents: ${verification.documents.length}`,
					);
				}
			}
			break;
		}

		case "serve": {
			const port = values.port ? parseInt(String(values.port), 10) : 4173;
			const host = values.host ? String(values.host) : "127.0.0.1";
			const server = await serve({ root, port, host });
			if (isJson) {
				console.log(JSON.stringify({ url: server.url, port: server.port, summary: server.summary }, null, 2));
			} else {
				console.log(`Offline preview server active at ${server.url}`);
				if (server.summary) console.log(server.summary);
				console.log("Press Ctrl+C to stop.");
			}
			const shutdown = async () => {
				await server.close();
				process.exit(0);
			};
			process.on("SIGINT", shutdown);
			process.on("SIGTERM", shutdown);
			await new Promise<void>(() => {});
			break;
		}

		case "research": {
			const docs = await readResearchDocuments(root);
			const query = args.join(" ").trim().toLowerCase();
			const filtered = query
				? docs.filter(
						(d) => d.question.toLowerCase().includes(query) || d.title.toLowerCase().includes(query),
					)
				: docs;
			if (isJson) {
				console.log(JSON.stringify(filtered, null, 2));
			} else if (filtered.length === 0) {
				console.log(
					`No research documents found${query ? ` matching "${query}"` : ""} in .kaioken/research.`,
				);
			} else {
				console.log(`Found ${filtered.length} research document(s):`);
				for (const d of filtered) {
					console.log(
						`  - [${d.slug}] ${d.title}: ${d.verification.grounded}/${d.verification.cited} citations grounded`,
					);
				}
			}
			break;
		}

		case "skills": {
			const { skills, problems } = await loadSkills(root);
			if (isJson) {
				console.log(JSON.stringify({ skills, problems }, null, 2));
			} else {
				console.log(`Loaded ${skills.length} skill(s):`);
				for (const s of skills) {
					console.log(`  - ${s.name}: ${s.description}`);
				}
				if (problems.length > 0) {
					console.log(`Problems encountered (${problems.length}):`);
					for (const p of problems) {
						console.log(`  - [${p.type}] in ${p.file}: ${p.message}`);
					}
				}
			}
			break;
		}

		case "skillgen": {
			const commands = await discoverRepoCommands(root);
			if (isJson) {
				console.log(JSON.stringify({ root, discoveredCommands: commands }, null, 2));
			} else {
				console.log(`Discovered ${commands.length} repository command(s) for skill grounding:`);
				for (const c of commands) {
					console.log(`  - ${c}`);
				}
			}
			break;
		}

		case "graph": {
			const records = await gatherProvenance(root);
			const graph = buildGraph({ provenance: records });
			if (values.write) {
				await writeGraph(root, graph);
			}
			const format = String(values.format ?? (isJson ? "json" : "summary")).toLowerCase();
			if (format === "mermaid") {
				console.log(renderGraphMermaid(graph));
			} else if (format === "markdown") {
				console.log(renderGraphMarkdown(graph));
			} else if (format === "json") {
				console.log(renderGraphJson(graph));
			} else {
				const stats = graphStats(graph);
				console.log(
					`Knowledge Graph: ${stats.nodes} nodes, ${stats.edges} edges, ${stats.coveredFiles} covered files.`,
				);
				if (values.write) {
					console.log("Saved graph artifact to .kaioken/graph.json");
				}
			}
			break;
		}

		case "gitops": {
			const action = String(values.action ?? args[0] ?? "status").toLowerCase();
			if (action === "install-hook") {
				const exe = [process.execPath, process.argv[1]];
				const path = await installPostCommit(root, exe);
				if (isJson) console.log(JSON.stringify({ installed: true, path }, null, 2));
				else console.log(`Installed post-commit hook: ${path}`);
			} else if (action === "remove-hook") {
				const removed = await removePostCommit(root);
				if (isJson) console.log(JSON.stringify({ removed }, null, 2));
				else console.log(`Removed post-commit hook: ${removed ? "yes" : "no hook was present"}`);
			} else if (action === "hook-log") {
				const logText = await readHookLog(root);
				console.log(logText);
			} else if (action === "diff") {
				const diff = await readDiff(root);
				if (isJson) console.log(JSON.stringify(diff, null, 2));
				else console.log(diff ? diff.patch || "Working tree clean." : "Not a git repository.");
			} else if (action === "list") {
				const wts = await listWorktrees(root);
				if (isJson) console.log(JSON.stringify(wts, null, 2));
				else {
					console.log(`Registered worktrees (${wts.length}):`);
					for (const wt of wts) {
						console.log(`  • ${wt.branch || "(detached)"} at ${wt.path} [${wt.isKaioken ? "kaioken" : "base"}]`);
					}
				}
			} else if (action === "delegate" || action === "create") {
				const taskName = args[1] || "scratch-task";
				const recipe = await generateDelegationRecipe(root, taskName);
				if (isJson) console.log(JSON.stringify(recipe, null, 2));
				else console.log(formatDelegationRecipe(recipe));
			} else if (action === "merge") {
				const taskName = args[1] || "scratch-task";
				const res = await safeMerge(root, taskName);
				if (isJson) console.log(JSON.stringify(res, null, 2));
				else console.log(res.message);
				if (!res.success) process.exit(1);
			} else if (action === "cleanup" || action === "prune") {
				const report = await pruneWorktrees(root);
				if (isJson) console.log(JSON.stringify(report, null, 2));
				else {
					console.log(`Pruned ${report.prunedWorktrees.length} worktree(s), ${report.prunedBranches.length} branch(es).`);
					for (const p of report.prunedWorktrees) {
						console.log(`  - ${p.name}: ${p.reason}`);
					}
				}
			} else if (action === "conflict" || action === "diff3") {
				const filePath = args[1];
				if (filePath) {
					const diff3 = await getThreeWayDiff(root, filePath);
					console.log(diff3.files[0]?.formattedDiff || diff3.summary);
				} else {
					const conflictInfo = await detectConflicts(root);
					if (isJson) console.log(JSON.stringify(conflictInfo, null, 2));
					else if (conflictInfo.hasConflicts) console.log(renderConflictCard(conflictInfo));
					else console.log("No merge conflicts detected.");
				}
			} else {
				const hook = await hookStatus(root);
				const wt = await worktreeStatus(root);
				const wts = await listWorktrees(root);
				if (isJson) {
					console.log(JSON.stringify({ hook, worktree: wt, registeredWorktrees: wts }, null, 2));
				} else {
					console.log(
						`Gitops Status:\n  Post-commit hook: ${hook.installed ? `installed at ${hook.path}` : "not installed"}\n  Worktrees: ${wts.length} registered (${wt.dirty.length} dirty file(s), ${wt.conflicted.length} conflicted)`,
					);
				}
			}
			break;
		}

		case "evals": {
			const repo = values.repo ? String(values.repo) : undefined;
			const multiplier = values.multiplier ? parseInt(String(values.multiplier), 10) : 3;
			const wantScorecard = Boolean(values.scorecard);
			const wantNdjson = Boolean(values.ndjson);
			const scoreRoot = repo ?? root;
			const report = await runEval({ multiplier, ...(repo ? { repo } : {}) });
			const card = toScorecard(report);
			if (wantNdjson) {
				console.log(formatNdjson(card));
				process.exit(report.passed ? 0 : 1);
			}
			if (wantScorecard) {
				const previous = await readScorecard(scoreRoot);
				const scorecardPath = await writeScorecard(scoreRoot, card);
				const diff = previous ? diffScorecards(card, previous) : undefined;
				if (isJson) {
					console.log(JSON.stringify({ card, scorecardPath, diff: diff ?? null }, null, 2));
				} else {
					console.log(formatScorecard(card, diff));
					console.log(`Saved scorecard to ${scorecardPath}`);
					if (previous && diff && !diff.clean) {
						console.log(`Regression vs baseline: ${diff.regressed.join(", ")}`);
					}
				}
				process.exit(report.passed ? 0 : 1);
			}
			if (isJson) {
				console.log(JSON.stringify(report, null, 2));
			} else {
				console.log(formatReport(report));
			}
			process.exit(report.passed ? 0 : 1);
			break;
		}

		case "spend": {
			const action = args[0] || "plan";
			const multiplier = values.multiplier ? parseInt(String(values.multiplier), 10) : 1;
			const modelLabel = values.model ? String(values.model) : "gemini-2.5-flash";
			const budgetLimit = values.budget ? parseFloat(String(values.budget)) : null;
			const cost = STANDARD_MODEL_CATALOG[modelLabel];

			const tokens = estimatePreflightTokens(action, multiplier);
			const spend = estimateSpend(cost, tokens);

			if (values.matrix) {
				console.log(formatModelComparisonMatrix(tokens, STANDARD_MODEL_CATALOG));
				break;
			}

			if (values.audit) {
				const mgr = new BudgetCeilingManager({ hardCeilingUsd: budgetLimit });
				const ledgerFile = join(root, KAIOKEN_DIR, "spend.json");
				await mgr.loadLedger(ledgerFile);
				console.log(formatSpendAuditReport(mgr.records, budgetLimit ?? mgr.hardCeilingUsd));
				break;
			}

			if (values.dial) {
				console.log(formatMultiplierDial(multiplier, { estimate: spend }));
				break;
			}

			if (values.offline) {
				console.log(formatOfflineModeBadge({ stage: action, bypassedTokens: tokens, benchmarkCost: cost }));
				break;
			}

			if (isJson) {
				console.log(
					JSON.stringify(
						{
							action,
							multiplier,
							model: modelLabel,
							tokens,
							spend,
							budgetLimit,
						},
						null,
						2,
					),
				);
			} else {
				console.log(formatPricingCard(modelLabel, cost, tokens));
				if (budgetLimit !== null) {
					const check = new BudgetCeilingManager({ hardCeilingUsd: budgetLimit }).checkBudget(spend.usd ?? 0, action);
					if (!check.allowed) {
						console.log(`\n⚠️  BUDGET CEILING ALERT: ${check.reason}`);
					} else {
						console.log(`\nBudget Status: projected spend $${(spend.usd ?? 0).toFixed(4)} USD is within hard ceiling of $${budgetLimit.toFixed(4)} USD.`);
					}
				}
			}
			break;
		}

		case "export": {
			const wikiFiles = await readWikiTree(join(root, ".kaioken", "wiki")).catch(() => []);
			const cards = await readCards(root).catch(() => []);
			const skills = await loadSkills(root).catch(() => ({ skills: [], problems: [] }));
			const manifest: ExportManifest = {
				version: 1,
				generatedAt: new Date().toISOString(),
				repository: root,
				counts: {
					cards: cards.length,
					wikiDocuments: wikiFiles.length,
					skills: skills.skills.length,
				},
			};
			const bundleDir = join(root, ".kaioken", "export");
			const written = await writeExportTree(bundleDir, wikiFiles, manifest);
			if (isJson) {
				console.log(JSON.stringify({ bundleDir, manifest, written }, null, 2));
			} else {
				console.log(
					`Exported ${written.length} asset(s) to .kaioken/export/ (${manifest.counts.wikiDocuments} wiki document(s), ${manifest.counts.cards} card(s), ${manifest.counts.skills} skill(s)).`,
				);
			}
			break;
		}

		case "update": {
			const report = await checkDrift(root);
			const staleDocs = report.stale.map((d) => d.document).sort();
			if (isJson) {
				console.log(
					JSON.stringify(
						{
							freshness: report.freshness,
							stale: staleDocs,
							undocumentedFiles: report.undocumentedFiles,
							note: "Regeneration needs a model; run /kaio-update in Pi to regenerate.",
						},
						null,
						2,
					),
				);
			} else if (staleDocs.length === 0) {
				console.log("Nothing is stale. No spend, no regeneration.");
			} else {
				console.log(`Stale document(s) (${staleDocs.length}): ${staleDocs.slice(0, 8).join(", ")}`);
				console.log("Regeneration needs a model; run /kaio-update in Pi to regenerate.");
			}
			process.exit(staleDocs.length === 0 ? 0 : 1);
			break;
		}

		case "delegate": {
			const taskName = args[0] || "scratch-task";
			const recipe = await generateDelegationRecipe(root, taskName);
			if (isJson) {
				console.log(JSON.stringify(recipe, null, 2));
			} else {
				console.log(formatDelegationRecipe(recipe));
			}
			break;
		}

		case "merge": {
			const taskName = args[0] || "scratch-task";
			const res = await safeMerge(root, taskName);
			if (isJson) {
				console.log(JSON.stringify(res, null, 2));
			} else {
				console.log(res.message);
			}
			if (!res.success) process.exit(1);
			break;
		}

		case "completion": {
			const shell = values.shell ? String(values.shell) : "bash";
			try {
				console.log(generateCompletion(shell));
			} catch (err) {
				console.error((err as Error).message);
				process.exit(2);
			}
			break;
		}

		default: {
			console.error(`Unknown command: "${cmd}". Run "kaioken --help" for usage.`);
			process.exit(2);
		}
	}
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
