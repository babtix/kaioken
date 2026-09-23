#!/usr/bin/env node
/**
 * Run the Kaioken evaluation suite and print the report.
 *
 * Offline by design: no keys, no network, no model. The suite drives the real
 * pipeline with scripted doubles against a temporary fixture repository, so it
 * can run in CI on a machine that has never seen a credential (Invariant 10).
 *
 *   node kaioken/evals/bin.mjs            # x3, the default multiplier
 *   node kaioken/evals/bin.mjs --x10      # exhaustive
 *
 * Exits non-zero when any metric misses its threshold, so it is usable as a gate.
 */
import { runEval, formatReport } from "./dist/index.js";

const multiplierArg = process.argv.find((a) => /^--x?\d+$/.test(a));
const multiplier = multiplierArg ? Number.parseInt(multiplierArg.replace(/^--x?/, ""), 10) : 3;

const repoIndex = process.argv.indexOf("--repo");
const repo = repoIndex !== -1 ? process.argv[repoIndex + 1] : undefined;

const report = await runEval({ multiplier, ...(repo ? { repo } : {}) });
console.log(formatReport(report));
process.exit(report.passed ? 0 : 1);
