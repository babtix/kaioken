import { promises as fs } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

export interface ContextFile {
	path: string;
	relativePath: string;
	content: string;
	kind: "agent-doc" | "rule";
}

export interface DiscoverContextFilesOptions {
	cwd: string;
	workspaceRoot?: string;
}

function normalizePath(p: string): string {
	return resolve(p).replace(/\\/g, "/");
}

/**
 * Walk up directory tree from `cwd` to `workspaceRoot`, collecting
 * `AGENTS.md` and `.kaioken/rules/*.md` files.
 *
 * Returned in root-to-leaf order so higher-level workspace rules precede
 * directory-specific rules.
 */
export async function discoverContextFiles(
	options: DiscoverContextFilesOptions,
): Promise<ContextFile[]> {
	const cwd = resolve(options.cwd);
	const workspaceRoot = options.workspaceRoot ? resolve(options.workspaceRoot) : undefined;

	const visitedDirs: string[] = [];
	let current = cwd;

	while (true) {
		visitedDirs.push(current);

		if (workspaceRoot && normalizePath(current) === normalizePath(workspaceRoot)) {
			break;
		}

		const parent = dirname(current);
		if (parent === current) {
			break;
		}
		current = parent;
	}

	// Reverse so we process from root to leaf
	const searchOrder = visitedDirs.reverse();
	const seenPaths = new Set<string>();
	const files: ContextFile[] = [];

	for (const dir of searchOrder) {
		// 1. Check for AGENTS.md
		const agentsMdPath = join(dir, "AGENTS.md");
		const normAgentsPath = normalizePath(agentsMdPath);
		if (!seenPaths.has(normAgentsPath)) {
			try {
				const content = await fs.readFile(agentsMdPath, "utf8");
				seenPaths.add(normAgentsPath);
				const rel = workspaceRoot ? relative(workspaceRoot, agentsMdPath) : basename(agentsMdPath);
				files.push({
					path: normAgentsPath,
					relativePath: rel.replace(/\\/g, "/"),
					content: content.trim(),
					kind: "agent-doc",
				});
			} catch {
				// No AGENTS.md here
			}
		}

		// 2. Check for .kaioken/rules/*.md
		const rulesDir = join(dir, ".kaioken", "rules");
		try {
			const entries = await fs.readdir(rulesDir, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
				const rulePath = join(rulesDir, entry.name);
				const normRulePath = normalizePath(rulePath);
				if (seenPaths.has(normRulePath)) continue;

				try {
					const content = await fs.readFile(rulePath, "utf8");
					seenPaths.add(normRulePath);
					const rel = workspaceRoot ? relative(workspaceRoot, rulePath) : entry.name;
					files.push({
						path: normRulePath,
						relativePath: rel.replace(/\\/g, "/"),
						content: content.trim(),
						kind: "rule",
					});
				} catch {
					// Unreadable rule file
				}
			}
		} catch {
			// No rules dir
		}
	}

	return files;
}

/**
 * Format discovered context and rule files into a system prompt section.
 */
export function formatContextFilesPrompt(files: ContextFile[]): string {
	if (files.length === 0) return "";

	const sections: string[] = ["## Repository Context & Rules", ""];

	for (const file of files) {
		const title =
			file.kind === "agent-doc"
				? `### Document: ${file.relativePath}`
				: `### Rule: ${file.relativePath}`;

		sections.push(title, "", file.content, "");
	}

	return sections.join("\n").trim();
}
