import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { parseSkill, type Skill } from "@kaioken/agent";
import { activeExtensions } from "./install.js";
import type { Installed } from "./lock.js";

/**
 * What a declarative extension actually gives you.
 *
 * Documents, in exactly the format the repository's own skills use, loaded into
 * the same catalog. That is the whole tier: a pack of task guides for a
 * framework the agent does not know this project uses, contributed by somebody
 * who does. Nothing is executed, which is why this tier needs no trust prompt.
 *
 * The name is prefixed with the extension's id. Two packs that both ship a
 * `deploy` skill are two different procedures, and a collision that silently
 * hid one of them would be discovered the first time an agent followed the
 * wrong one.
 */

export interface ContributedSkill extends Skill {
	/** The extension that supplied it. */
	extension: string;
}

export async function contributedSkills(): Promise<{
	skills: ContributedSkill[];
	problems: Array<{ extension: string; path: string; reason: string }>;
}> {
	const skills: ContributedSkill[] = [];
	const problems: Array<{ extension: string; path: string; reason: string }> = [];

	for (const entry of await activeExtensions()) {
		// Only the code-free tier contributes documents. An mcp or wasm
		// extension contributes tools, through a path that asks first.
		if (entry.manifest.type !== "declarative") continue;
		await collect(entry, skills, problems);
	}

	return { skills, problems };
}

async function collect(
	entry: Installed,
	skills: ContributedSkill[],
	problems: Array<{ extension: string; path: string; reason: string }>,
): Promise<void> {
	const dir = join(entry.dir, "skills");
	let names: string[];
	try {
		names = await readdir(dir);
	} catch {
		// An extension with no skills directory contributes nothing. That is a
		// thin extension, not a broken one.
		return;
	}

	for (const name of names.sort()) {
		const absolute = join(dir, name);
		let isDir = false;
		try {
			isDir = (await stat(absolute)).isDirectory();
		} catch {
			continue;
		}

		const file = isDir ? join(absolute, "SKILL.md") : absolute;
		if (!isDir && extname(name).toLowerCase() !== ".md") continue;

		let raw: string;
		try {
			raw = await readFile(file, "utf8");
		} catch {
			if (!isDir) problems.push({ extension: entry.id, path: file, reason: "unreadable" });
			continue;
		}

		const fallback = isDir ? name : name.slice(0, -3);
		const parsed = parseSkill(raw, fallback);
		if ("reason" in parsed) {
			problems.push({ extension: entry.id, path: file, reason: parsed.reason });
			continue;
		}
		skills.push({
			...parsed,
			name: `${entry.id}/${parsed.name}`,
			path: file,
			extension: entry.id,
		});
	}
}
