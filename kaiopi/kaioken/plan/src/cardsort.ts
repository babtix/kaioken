import type { Module, ModulePlan } from "./types.ts";
import { findModule, flatten } from "./validate.ts";
import { detectArchitecturalDomain, ARCHITECTURAL_DOMAINS } from "./cluster.ts";

export interface SplitOptions {
	/** Method to split by: 'directory' (subdirectories) or 'domain' (architectural domain). Defaults to 'directory'. */
	by?: "directory" | "domain";
	/** Custom submodules to create from files. */
	customSubmodules?: Array<{
		id: string;
		name: string;
		purpose: string;
		files: string[];
	}>;
}

export interface MergeOptions {
	mergedName?: string;
	mergedPurpose?: string;
}

export interface CardSortRenderOptions {
	maxFilesPerCard?: number;
	selectedModuleId?: string;
	terminalWidth?: number;
}

/**
 * Moves a file from its current owning module into targetModuleId.
 */
export function moveFile(plan: ModulePlan, filePath: string, toModuleId: string): ModulePlan {
	const normalizedPath = filePath.split("\\").join("/");
	const target = findModule(plan, toModuleId);
	if (!target) {
		throw new Error(`Target module "${toModuleId}" does not exist in module plan.`);
	}

	const updateModule = (m: Module): Module => {
		let files = m.files.filter((f) => f.split("\\").join("/") !== normalizedPath);
		if (m.id === toModuleId && !files.includes(normalizedPath)) {
			files.push(normalizedPath);
			files.sort();
		}

		return {
			...m,
			files,
			...(m.children ? { children: m.children.map(updateModule) } : {}),
		};
	};

	return {
		...plan,
		modules: plan.modules.map(updateModule),
	};
}

/**
 * Granular module splitter breaking down an oversized module into submodules (UX-1261–UX-1270).
 */
export function splitModule(plan: ModulePlan, moduleId: string, options: SplitOptions = {}): ModulePlan {
	const target = findModule(plan, moduleId);
	if (!target) {
		throw new Error(`Cannot split: module "${moduleId}" not found.`);
	}

	if (options.customSubmodules && options.customSubmodules.length > 0) {
		const newChildren: Module[] = options.customSubmodules.map((sub) => ({
			id: sub.id,
			name: sub.name,
			purpose: sub.purpose,
			files: sub.files.sort(),
		}));

		const claimed = new Set(newChildren.flatMap((c) => c.files));
		const remainingFiles = target.files.filter((f) => !claimed.has(f));

		const updateModule = (m: Module): Module => {
			if (m.id === moduleId) {
				return {
					...m,
					files: remainingFiles,
					children: [...(m.children ?? []), ...newChildren],
				};
			}
			return {
				...m,
				...(m.children ? { children: m.children.map(updateModule) } : {}),
			};
		};

		return {
			...plan,
			modules: plan.modules.map(updateModule),
		};
	}

	const by = options.by ?? "directory";
	const submodules: Module[] = [];

	if (by === "domain") {
		const domainGroups = new Map<string, string[]>();
		for (const file of target.files) {
			const dom = detectArchitecturalDomain(file) ?? "core";
			let list = domainGroups.get(dom);
			if (!list) {
				list = [];
				domainGroups.set(dom, list);
			}
			list.push(file);
		}

		for (const [dom, files] of domainGroups.entries()) {
			const meta = ARCHITECTURAL_DOMAINS.find((d) => d.domain === dom);
			const subId = `${target.id}-${dom}`;
			submodules.push({
				id: subId,
				name: `${target.name} (${meta?.title ?? dom})`,
				purpose: meta?.purpose ?? `Domain sub-module for ${dom}`,
				files: files.sort(),
			});
		}
	} else {
		// Split by subdirectories
		const dirGroups = new Map<string, string[]>();
		for (const file of target.files) {
			const parts = file.split("/");
			const subKey = parts.length > 2 ? parts[parts.length - 2]! : "root";
			let list = dirGroups.get(subKey);
			if (!list) {
				list = [];
				dirGroups.set(subKey, list);
			}
			list.push(file);
		}

		for (const [dir, files] of dirGroups.entries()) {
			const subId = `${target.id}-${dir.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`;
			submodules.push({
				id: subId,
				name: `${target.name} — ${dir.charAt(0).toUpperCase() + dir.slice(1)}`,
				purpose: `Sub-component module for ${dir}`,
				files: files.sort(),
			});
		}
	}

	if (submodules.length <= 1) {
		return plan; // Cannot split into meaningful submodules
	}

	const updateModule = (m: Module): Module => {
		if (m.id === moduleId) {
			return {
				...m,
				files: [],
				children: submodules,
			};
		}
		return {
			...m,
			...(m.children ? { children: m.children.map(updateModule) } : {}),
		};
	};

	return {
		...plan,
		modules: plan.modules.map(updateModule),
	};
}

/**
 * Module merger combining tightly coupled sibling directories / modules (UX-1271–UX-1280).
 */
export function mergeModules(
	plan: ModulePlan,
	sourceModuleId: string,
	targetModuleId: string,
	options: MergeOptions = {},
): ModulePlan {
	if (sourceModuleId === targetModuleId) {
		return plan;
	}

	const source = findModule(plan, sourceModuleId);
	const target = findModule(plan, targetModuleId);

	if (!source) {
		throw new Error(`Source module "${sourceModuleId}" not found for merge.`);
	}
	if (!target) {
		throw new Error(`Target module "${targetModuleId}" not found for merge.`);
	}

	const combinedFiles = [...new Set([...target.files, ...source.files])].sort();
	const combinedChildren = [...(target.children ?? []), ...(source.children ?? [])];

	const removeAndMerge = (list: Module[]): Module[] => {
		const out: Module[] = [];
		for (const m of list) {
			if (m.id === sourceModuleId) {
				continue; // remove source module
			}
			if (m.id === targetModuleId) {
				out.push({
					...m,
					name: options.mergedName ?? target.name,
					purpose: options.mergedPurpose ?? target.purpose,
					files: combinedFiles,
					...(combinedChildren.length > 0 ? { children: combinedChildren } : {}),
				});
			} else {
				out.push({
					...m,
					...(m.children ? { children: removeAndMerge(m.children) } : {}),
				});
			}
		}
		return out;
	};

	return {
		...plan,
		modules: removeAndMerge(plan.modules),
	};
}

/**
 * Creates and appends a new module to the plan.
 */
export function createModule(plan: ModulePlan, module: Module): ModulePlan {
	if (findModule(plan, module.id)) {
		throw new Error(`Module with id "${module.id}" already exists.`);
	}
	return {
		...plan,
		modules: [...plan.modules, { ...module, files: [...module.files].sort() }],
	};
}

/**
 * Removes a module, optionally reassigning its files to another module.
 */
export function removeModule(plan: ModulePlan, moduleId: string, reassignTo?: string): ModulePlan {
	const mod = findModule(plan, moduleId);
	if (!mod) return plan;

	let updated = plan;
	if (reassignTo) {
		for (const file of mod.files) {
			updated = moveFile(updated, file, reassignTo);
		}
	}

	const filterOut = (list: Module[]): Module[] => {
		return list
			.filter((m) => m.id !== moduleId)
			.map((m) => ({
				...m,
				...(m.children ? { children: filterOut(m.children) } : {}),
			}));
	};

	return {
		...updated,
		modules: filterOut(updated.modules),
	};
}

/**
 * Renders the visual module tree hierarchy explorer (UX-1281–UX-1290).
 */
export function renderModuleTree(
	plan: ModulePlan,
	options: { showFiles?: boolean; depth?: number } = {},
): string {
	const lines: string[] = [];
	lines.push(`📦 Module Tree (${plan.modules.length} root modules):`);

	const walk = (modules: Module[], prefix = "") => {
		for (let i = 0; i < modules.length; i++) {
			const m = modules[i]!;
			const isLast = i === modules.length - 1;
			const branch = isLast ? "└── " : "├── ";
			const nextPrefix = prefix + (isLast ? "    " : "│   ");

			lines.push(`${prefix}${branch}[${m.id}] ${m.name} (${m.files.length} file${m.files.length === 1 ? "" : "s"})`);

			if (options.showFiles && m.files.length > 0) {
				const maxFiles = 8;
				for (let fi = 0; fi < Math.min(m.files.length, maxFiles); fi++) {
					const isLastFile = fi === m.files.length - 1 && (!m.children || m.children.length === 0);
					const fileBranch = isLastFile ? "└── " : "├── ";
					lines.push(`${nextPrefix}${fileBranch}📄 ${m.files[fi]}`);
				}
				if (m.files.length > maxFiles) {
					lines.push(`${nextPrefix}└── ... and ${m.files.length - maxFiles} more file(s)`);
				}
			}

			if (m.children && m.children.length > 0) {
				walk(m.children, nextPrefix);
			}
		}
	};

	walk(plan.modules);
	return lines.join("\n");
}

/**
 * Renders the visual terminal card-sorting UI for reorganizing module boundaries (UX-1241–UX-1250).
 */
export function renderCardSortingGrid(
	plan: ModulePlan,
	options: CardSortRenderOptions = {},
): string {
	const allModules = flatten(plan.modules);
	const maxFiles = options.maxFilesPerCard ?? 6;
	const lines: string[] = [];

	lines.push(`┌─────────────────────────────────────────────────────────────┐`);
	lines.push(`│ 🃏 INTERACTIVE MODULE CARD-SORTING BOARD                    │`);
	lines.push(
		`│ Total Modules: ${allModules.length.toString().padEnd(4)} | Multiplier: ×${plan.multiplier.toString().padEnd(3)} | Source: ${plan.source ?? "heuristic"} │`,
	);
	lines.push(`└─────────────────────────────────────────────────────────────┘`);

	for (const mod of allModules) {
		const isSelected = options.selectedModuleId === mod.id;
		const borderChar = isSelected ? "━" : "─";
		const prefixTag = isSelected ? "▶ [SELECTED] " : "";
		const header = `${prefixTag}[${mod.id}] ${mod.name} (${mod.files.length} file(s))`;

		lines.push(`\n┌─ ${header} ${borderChar.repeat(Math.max(2, 57 - header.length))}┐`);
		if (mod.purpose) {
			const purposePreview = mod.purpose.length > 55 ? `${mod.purpose.slice(0, 52)}...` : mod.purpose;
			lines.push(`│ Purpose: ${purposePreview.padEnd(51)} │`);
		}
		if (mod.files.length === 0) {
			lines.push(`│   (no files assigned)${" ".repeat(39)} │`);
		} else {
			lines.push(`│ Files:                                                      │`);
			for (let i = 0; i < Math.min(mod.files.length, maxFiles); i++) {
				const f = mod.files[i]!;
				const fileDisplay = f.length > 52 ? `...${f.slice(-49)}` : f;
				lines.push(`│   • ${fileDisplay.padEnd(54)} │`);
			}
			if (mod.files.length > maxFiles) {
				const rem = `... and ${mod.files.length - maxFiles} more file(s)`;
				lines.push(`│   ${rem.padEnd(56)} │`);
			}
		}
		lines.push(`└${borderChar.repeat(61)}┘`);
	}

	return lines.join("\n");
}

/**
 * Interactive card-sorting session manager with undo/redo support.
 */
export class CardSortingSession {
	private history: ModulePlan[] = [];
	private future: ModulePlan[] = [];
	private currentPlan: ModulePlan;

	constructor(initialPlan: ModulePlan) {
		this.currentPlan = initialPlan;
	}

	get plan(): ModulePlan {
		return this.currentPlan;
	}

	move(filePath: string, toModuleId: string): void {
		this.pushHistory();
		this.currentPlan = moveFile(this.currentPlan, filePath, toModuleId);
	}

	split(moduleId: string, options?: SplitOptions): void {
		this.pushHistory();
		this.currentPlan = splitModule(this.currentPlan, moduleId, options);
	}

	merge(sourceId: string, targetId: string, options?: MergeOptions): void {
		this.pushHistory();
		this.currentPlan = mergeModules(this.currentPlan, sourceId, targetId, options);
	}

	create(module: Module): void {
		this.pushHistory();
		this.currentPlan = createModule(this.currentPlan, module);
	}

	remove(moduleId: string, reassignTo?: string): void {
		this.pushHistory();
		this.currentPlan = removeModule(this.currentPlan, moduleId, reassignTo);
	}

	undo(): boolean {
		if (this.history.length === 0) return false;
		this.future.push(this.currentPlan);
		this.currentPlan = this.history.pop()!;
		return true;
	}

	redo(): boolean {
		if (this.future.length === 0) return false;
		this.history.push(this.currentPlan);
		this.currentPlan = this.future.pop()!;
		return true;
	}

	private pushHistory(): void {
		this.history.push(JSON.parse(JSON.stringify(this.currentPlan)));
		this.future = [];
	}
}
