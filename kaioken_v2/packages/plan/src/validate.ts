import type { ScanResult } from "@kaioken/scan";
import type { Module, ModulePlan, PlanDefect, PlanValidation } from "./types.js";

/**
 * Validate a plan against the scan.
 *
 * This runs on model output and on human edits alike, and it is deliberately
 * deterministic: a plan that names files the repository does not contain is
 * wrong whether a person or a model wrote it, and finding that out here costs
 * nothing compared with finding it out after generation.
 */
export function validatePlan(plan: ModulePlan, scan: ScanResult): PlanValidation {
	const known = new Set(scan.files.filter((f) => !f.binary).map((f) => f.path));
	const defects: PlanDefect[] = [];

	const seenIds = new Set<string>();
	const owners = new Map<string, string[]>();
	const modules = flatten(plan.modules);

	for (const module of modules) {
		if (seenIds.has(module.id)) {
			defects.push({
				severity: "error",
				kind: "duplicate_id",
				moduleId: module.id,
				message: `Two modules share the id "${module.id}". Ids are how cards and edits refer to a module.`,
			});
		}
		seenIds.add(module.id);

		if (!module.purpose || module.purpose.trim().length === 0) {
			defects.push({
				severity: "warning",
				kind: "missing_purpose",
				moduleId: module.id,
				message: `Module "${module.id}" has no stated purpose.`,
			});
		}

		const unknown = module.files.filter((path) => !known.has(path));
		if (unknown.length > 0) {
			defects.push({
				severity: "error",
				kind: "unknown_file",
				moduleId: module.id,
				message: `Module "${module.id}" claims ${unknown.length} file(s) the scan does not contain.`,
				items: unknown,
			});
		}

		// A parent that only groups children is legitimate; a leaf with no files
		// would generate a card about nothing.
		const hasChildren = (module.children?.length ?? 0) > 0;
		if (module.files.length === 0 && !hasChildren) {
			defects.push({
				severity: "warning",
				kind: "empty_module",
				moduleId: module.id,
				message: `Module "${module.id}" owns no files and has no children.`,
			});
		}

		for (const path of module.files) {
			const list = owners.get(path);
			if (list) list.push(module.id);
			else owners.set(path, [module.id]);
		}
	}

	const overlapping = [...owners.entries()].filter(([, ids]) => ids.length > 1);
	if (overlapping.length > 0) {
		defects.push({
			severity: "warning",
			kind: "overlapping_files",
			message: `${overlapping.length} file(s) are claimed by more than one module.`,
			items: overlapping.map(([path, ids]) => `${path} → ${ids.join(", ")}`),
		});
	}

	const orphans = [...known].filter((path) => !owners.has(path)).sort();
	if (orphans.length > 0) {
		defects.push({
			severity: "warning",
			kind: "orphaned_files",
			message: `${orphans.length} scanned file(s) belong to no module.`,
			items: orphans.slice(0, 40),
		});
	}

	return {
		// Warnings are informational: an incomplete decomposition is often the
		// correct one, and the user is the judge. Only errors block.
		ok: !defects.some((d) => d.severity === "error"),
		defects,
		orphans,
		moduleCount: modules.length,
		coveredFiles: owners.size,
	};
}

/**
 * Expand any entry that names a directory into the files beneath it.
 *
 * Both a model and a person will naturally write `packages/scan/src` when they
 * mean everything in it. Rejecting that would be pedantry: the expansion is
 * unambiguous, deterministic, and derived from the scan rather than guessed. An
 * entry that matches no file is left alone, so `validatePlan` still reports it.
 */
export function expandDirectories(plan: ModulePlan, scan: ScanResult): ModulePlan {
	const known = new Set(scan.files.filter((f) => !f.binary).map((f) => f.path));
	const paths = [...known];

	const expand = (module: Module): Module => {
		const files = new Set<string>();
		for (const entry of module.files) {
			if (known.has(entry)) {
				files.add(entry);
				continue;
			}
			const prefix = entry.endsWith("/") ? entry : `${entry}/`;
			const beneath = paths.filter((path) => path.startsWith(prefix));
			if (beneath.length > 0) for (const path of beneath) files.add(path);
			// No match either way: keep it so the validator can name it.
			else files.add(entry);
		}
		return {
			...module,
			files: [...files].sort(),
			...(module.children ? { children: module.children.map(expand) } : {}),
		};
	};

	return { ...plan, modules: plan.modules.map(expand) };
}

/** Depth-first list of every module, parents before children. */
export function flatten(modules: readonly Module[]): Module[] {
	const out: Module[] = [];
	const walk = (list: readonly Module[]) => {
		for (const module of list) {
			out.push(module);
			if (module.children) walk(module.children);
		}
	};
	walk(modules);
	return out;
}

export function findModule(plan: ModulePlan, id: string): Module | null {
	return flatten(plan.modules).find((m) => m.id === id) ?? null;
}

/**
 * Every file a module owns, including its children's. Cards are generated over
 * this, so a parent module's card sees the whole subtree.
 */
export function moduleScope(module: Module): string[] {
	const out = new Set(module.files);
	for (const child of module.children ?? []) {
		for (const path of moduleScope(child)) out.add(path);
	}
	return [...out].sort();
}
