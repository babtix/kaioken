import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import { parse as parseYaml } from "yaml";

export const SKILLS_DIR = join(KAIOKEN_DIR, "skills");

/**
 * Standard directories where agents store skills, in deterministic discovery order:
 * 1. Primary Kaioken truth layer directory: .kaioken/skills
 * 2. Standard coding agent skills directory: .agents/skills
 * 3. Pi agent skills directory: .pi/skills
 * 4. GitHub agent skills directory: .github/skills
 *
 * Earlier directories take precedence over later directories.
 */
export const STANDARD_SKILL_DIRS = [
	SKILLS_DIR,
	join(".agents", "skills"),
	join(".pi", "skills"),
	join(".github", "skills"),
];

export interface Skill {
	name: string;
	description: string;
	content: string;
	path: string;
	parameters?: Record<string, unknown>;
	triggers?: string[];
}

export interface SkillProblem {
	path: string;
	reason: string;
}

export interface LoadedSkills {
	skills: Skill[];
	problems: SkillProblem[];
}

export interface LoadSkillsOptions {
	extraDirs?: string[];
	searchDirs?: string[];
}

export function skillsDir(root: string): string {
	return join(root, SKILLS_DIR);
}

export function skillsDirs(root: string, options?: LoadSkillsOptions): string[] {
	const relDirs = options?.searchDirs ?? [...STANDARD_SKILL_DIRS, ...(options?.extraDirs ?? [])];
	return relDirs.map((d) => (isAbsolute(d) ? d : join(root, d)));
}

export async function loadSkills(
	root: string,
	options?: LoadSkillsOptions,
): Promise<LoadedSkills> {
	const dirs = skillsDirs(root, options);
	const rawSkills: Skill[] = [];
	const problems: SkillProblem[] = [];

	for (const dir of dirs) {
		let entries: string[];
		try {
			entries = await readdir(dir);
		} catch {
			continue;
		}

		for (const entry of entries.sort()) {
			const abs = join(dir, entry);

			let isDir = false;
			try {
				isDir = (await stat(abs)).isDirectory();
			} catch {
				continue;
			}

			const file = isDir ? join(abs, "SKILL.md") : abs;
			if (!isDir && extname(entry).toLowerCase() !== ".md") continue;

			let raw: string;
			try {
				raw = await readFile(file, "utf8");
			} catch {
				if (isDir) continue;
				problems.push({ path: relative(root, file).split("\\").join("/"), reason: "unreadable" });
				continue;
			}

			const relPath = relative(root, file).split("\\").join("/");
			const parsed = parseSkill(raw, defaultName(entry, isDir));

			if ("reason" in parsed) {
				problems.push({ path: relPath, reason: parsed.reason });
				continue;
			}
			rawSkills.push({ ...parsed, path: relPath });
		}
	}

	const seen = new Set<string>();
	const skills: Skill[] = [];

	for (const skill of rawSkills) {
		if (seen.has(skill.name)) {
			problems.push({ path: skill.path, reason: `duplicate skill name "${skill.name}"` });
		} else {
			seen.add(skill.name);
			skills.push(skill);
		}
	}

	return { skills, problems };
}

function defaultName(entry: string, isDir: boolean): string {
	return isDir ? entry : basename(entry, extname(entry));
}

export function parseSkill(
	raw: string,
	fallbackName: string,
): Omit<Skill, "path"> | { reason: string } {
	const normalised = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
	const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalised);
	if (!match) return { reason: "no frontmatter block" };

	let front: unknown;
	try {
		front = parseYaml(match[1] as string);
	} catch (error) {
		return { reason: `frontmatter is not valid YAML (${(error as Error).message.split("\n")[0]})` };
	}
	if (typeof front !== "object" || front === null || Array.isArray(front)) {
		return { reason: "frontmatter is not a mapping" };
	}

	const fields = front as Record<string, unknown>;

	if (fields["name"] !== undefined && (typeof fields["name"] !== "string" || !fields["name"].trim())) {
		return { reason: "frontmatter field 'name' must be a non-empty string" };
	}
	const name = typeof fields["name"] === "string" ? fields["name"].trim() : "";

	if (fields["description"] === undefined) {
		return { reason: "frontmatter has no description" };
	}
	if (typeof fields["description"] !== "string" || !fields["description"].trim()) {
		return { reason: "frontmatter has no description" };
	}
	const description = fields["description"].trim();

	let parameters: Record<string, unknown> | undefined;
	if (fields["parameters"] !== undefined) {
		if (typeof fields["parameters"] !== "object" || fields["parameters"] === null || Array.isArray(fields["parameters"])) {
			return { reason: "frontmatter field 'parameters' must be a mapping" };
		}
		parameters = fields["parameters"] as Record<string, unknown>;
	}

	let triggers: string[] | undefined;
	if (fields["triggers"] !== undefined) {
		if (!Array.isArray(fields["triggers"]) || !fields["triggers"].every((t) => typeof t === "string")) {
			return { reason: "frontmatter field 'triggers' must be a list of strings" };
		}
		triggers = fields["triggers"] as string[];
	}

	const content = normalised.slice(match[0].length).trim();
	if (!content) return { reason: "skill has no body" };

	const result: Omit<Skill, "path"> = {
		name: name || fallbackName,
		description,
		content,
	};
	if (parameters !== undefined) result.parameters = parameters;
	if (triggers !== undefined) result.triggers = triggers;

	return result;
}
