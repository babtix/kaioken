#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { formatReport, runEval } from "./evals/src/index.ts";
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
import { buildGraph, graphStats, renderGraphJson, renderGraphMarkdown, renderGraphMermaid, writeGraph } from "./graph/src/index.ts";
import { predictImpactForSymbol, renderImpact } from "./impact/src/index.ts";
import { buildIndex, readIndexArtifact, SymbolOracle, writeIndexArtifact } from "./index/src/index.ts";
import { proposeModulePlan, readCards, writeModulePlan } from "./plan/src/index.ts";
import { checkDrift, gatherProvenance } from "./provenance/src/index.ts";
import { readResearchDocuments } from "./research/src/index.ts";
import {
	formatClassificationTable,
	KAIOKEN_DIR,
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
import { readProvenance, readVerification, readWikiPlan } from "./wiki/src/index.ts";

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
  serve:    --port <n>           Port for preview server (default: 4173)
            --host <str>         Host to bind server to (default: 127.0.0.1)
  graph:    --format <fmt>       Output format: mermaid | markdown | json | summary
            --write              Write graph to .kaioken/graph.json
  gitops:   --action <act>       Action: status | list | delegate | merge | prune | conflict | diff | install-hook | remove-hook | hook-log
  evals:    --repo <path>        Target repository for evaluations
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
			port: { type: "string" },
			host: { type: "string" },
			format: { type: "string" },
			action: { type: "string" },
			repo: { type: "string" },
			write: { type: "boolean" },
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
			const scanResult = await scan(root);
			const index = await readIndexArtifact(root);
			const proposeResult = await proposeModulePlan(scanResult, index, null, { multiplier });
			const planPath = await writeModulePlan(root, proposeResult.plan);
			if (isJson) {
				console.log(
					JSON.stringify(
						{ plan: proposeResult.plan, validation: proposeResult.validation, planPath },
						null,
						2,
					),
				);
			} else {
				console.log(`Module plan (${proposeResult.source}) written to ${planPath}`);
				console.log(`Decomposed into ${proposeResult.plan.modules.length} module(s):`);
				for (const m of proposeResult.plan.modules) {
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

		case "cards": {
			const cards = await readCards(root);
			if (isJson) {
				console.log(JSON.stringify(cards, null, 2));
			} else if (cards.length === 0) {
				console.log("No cards found in .kaioken/cards.");
			} else {
				console.log(`Loaded ${cards.length} card(s) from .kaioken/cards:`);
				for (const c of cards) {
					console.log(
						`  - [${c.moduleId}] (${c.entryPoints.length} entry point(s)): ${c.summary.slice(0, 100)}`,
					);
				}
			}
			break;
		}

		case "wiki": {
			const plan = await readWikiPlan(root);
			const verification = await readVerification(root);
			const provenance = await readProvenance(root);
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
			const report = await runEval({ multiplier, ...(repo ? { repo } : {}) });
			if (isJson) {
				console.log(JSON.stringify(report, null, 2));
			} else {
				console.log(formatReport(report));
			}
			process.exit(report.passed ? 0 : 1);
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
