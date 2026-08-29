import { relative, resolve } from "node:path";
import {
	type ModulePlan,
	type PlanValidation,
	modulePlanPath,
	parseMultiplier,
	proposeModulePlan,
	readModulePlan,
	validatePlan,
	writeModulePlan,
} from "@kaioken/plan";
import { readScanArtifact, scan, writeScanArtifact } from "@kaioken/scan";
import { ensureIndex } from "../artifacts.js";
import type { Flags } from "../main.js";
import { resolveModelClient } from "../model.js";

/**
 * Propose — or validate — the module plan.
 *
 * `--check` needs no model at all: validating a hand-edited plan against the
 * scan is pure lookup, and it is the loop a user is actually in after editing.
 */
export async function runPlan(flags: Flags): Promise<number> {
	const root = resolve(flags.root);

	const multiplier = parseMultiplier(flags.positional[0] ?? flags.multiplier);
	if (multiplier === null) {
		process.stderr.write("kaioken plan: multiplier must be x1..x10\n");
		return 1;
	}

	const scanResult = (await readScanArtifact(root)) ?? (await writeAndReturn(root));
	const index = await ensureIndex(root);

	if (flags.check) {
		const existing = await readModulePlan(root);
		if (!existing) {
			process.stderr.write("kaioken plan --check: no module plan yet\n");
			return 1;
		}
		return report(root, existing, validatePlan(existing, scanResult), flags, false);
	}

	// A plan is a checkpoint the user edits. Overwriting one without being told
	// to would throw away exactly the work this stage exists to capture.
	const existing = await readModulePlan(root);
	if (existing && !flags.force) {
		process.stderr.write(
			`kaioken plan: ${relative(root, modulePlanPath(root))} already exists.\n` +
				"  It is a checkpoint you are meant to edit, so it is never overwritten silently.\n" +
				"  Use --check to validate your edits, or --force to propose a new plan.\n",
		);
		return 1;
	}

	const client = await resolveModelClient(flags);
	if (!client.ok) {
		process.stderr.write(`kaioken plan: ${client.reason}\n`);
		return 1;
	}
	if (client.warning) process.stderr.write(`kaioken plan: ${client.warning}\n`);

	const { plan, validation } = await proposeModulePlan(scanResult, index, client.client, {
		multiplier,
	});
	await writeModulePlan(root, plan);
	return report(root, plan, validation, flags, true);
}

async function writeAndReturn(root: string) {
	const result = await scan(root);
	await writeScanArtifact(root, result);
	return result;
}

function report(
	root: string,
	plan: ModulePlan,
	validation: PlanValidation,
	flags: Flags,
	wrote: boolean,
): number {
	if (flags.json) {
		process.stdout.write(`${JSON.stringify({ plan, validation }, null, 2)}\n`);
		return validation.ok ? 0 : 1;
	}

	const out: string[] = [];
	if (wrote) out.push(`wrote ${relative(root, modulePlanPath(root))}`, "");

	out.push(`${validation.moduleCount} modules, ${validation.coveredFiles} files assigned`);
	if (validation.orphans.length > 0) {
		out.push(`${validation.orphans.length} scanned files belong to no module`);
	}

	const errors = validation.defects.filter((d) => d.severity === "error");
	const warnings = validation.defects.filter((d) => d.severity === "warning");

	if (errors.length > 0) {
		out.push("", "errors");
		for (const defect of errors) {
			out.push(`  ${defect.message}`);
			for (const item of (defect.items ?? []).slice(0, 10)) out.push(`      ${item}`);
		}
	}

	if (warnings.length > 0) {
		out.push("", "warnings");
		for (const defect of warnings) out.push(`  ${defect.message}`);
	}

	out.push(
		"",
		validation.ok
			? "plan is valid — edit it, then run `kaioken cards`"
			: "plan has errors — fix them, then run `kaioken plan --check`",
	);

	process.stdout.write(`${out.join("\n")}\n`);
	return validation.ok ? 0 : 1;
}
