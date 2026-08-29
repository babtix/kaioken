import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import { parse as parseYaml } from "yaml";

/**
 * Skills are procedure, where the wiki is description.
 *
 * A chapter tells the agent how this repository is put together; a skill tells
 * it how to carry out a task *in* this repository — the release checklist, the
 * migration ritual, the thing that is obvious to everyone who already knows it.
 * They are files a human writes and reviews, not something generated, which is
 * why nothing in this package invents one.
 *
 * They are loaded whole and only on request. Pasting every skill into the system
 * prompt would spend the context window on instructions for tasks the session is
 * not doing.
 */

export const SKILLS_DIR = join(KAIOKEN_DIR, "skills");

export interface Skill {
	name: string;
	description: string;
	/** The body below the frontmatter. */
	content: string;
	/** Repository-relative, so a message about it is clickable. */
	path: string;
}

export interface SkillProblem {
	path: string;
	reason: string;
}

export interface LoadedSkills {
	skills: Skill[];
	/**
	 * Files that look like skills but could not be read as one. Reported rather
	 * than skipped: a skill silently missing from the listing is a skill the
	 * agent will never use, and the author has no way to find out why.
	 */
	problems: SkillProblem[];
}

export function skillsDir(root: string): string {
	return join(root, SKILLS_DIR);
}

/**
 * Read every skill under `.kaioken/skills`.
 *
 * Two layouts are accepted, because both are natural to write: a single
 * `topic.md`, or a `topic/SKILL.md` beside the files it refers to. A missing
 * directory is not an error — most repositories have no skills, and the agent
 * works without them.
 */
export async function loadSkills(root: string): Promise<LoadedSkills> {
	const dir = skillsDir(root);
	const skills: Skill[] = [];
	const problems: SkillProblem[] = [];

	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return { skills, problems };
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
			// A directory with no SKILL.md is a directory, not a broken skill.
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
		skills.push({ ...parsed, path: relPath });
	}

	const seen = new Set<string>();
	for (const skill of skills) {
		if (seen.has(skill.name)) {
			problems.push({ path: skill.path, reason: `duplicate skill name "${skill.name}"` });
		}
		seen.add(skill.name);
	}

	return { skills, problems };
}

function defaultName(entry: string, isDir: boolean): string {
	return isDir ? entry : basename(entry, extname(entry));
}

/**
 * Split frontmatter from body.
 *
 * The description is mandatory and the name is not: the name can be taken from
 * the filename, but nothing can guess when a skill applies, and a skill the
 * model cannot tell apart from the others is worse than one that is absent.
 */
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
	const name = typeof fields["name"] === "string" ? fields["name"].trim() : "";
	const description =
		typeof fields["description"] === "string" ? fields["description"].trim() : "";

	if (!description) return { reason: "frontmatter has no description" };

	const content = normalised.slice(match[0].length).trim();
	if (!content) return { reason: "skill has no body" };

	return { name: name || fallbackName, description, content };
}
