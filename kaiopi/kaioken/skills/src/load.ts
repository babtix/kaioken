import { loadSkills, type LoadSkillsOptions, type Skill } from "./skills.ts";

export async function loadSkill(
	root: string,
	name: string,
	options?: LoadSkillsOptions,
): Promise<string> {
	const { skills, problems } = await loadSkills(root, options);
	const hasDuplicate = problems.some((p) => p.reason === `duplicate skill name "${name}"`);
	if (hasDuplicate) {
		return `Error: duplicate skill name "${name}" detected. Resolve the collision before loading.`;
	}
	const skill = skills.find((s: Skill) => s.name === name);
	if (!skill) {
		const list = skills.map((s: Skill) => s.name).join(", ");
		return `Skill "${name}" not found. Available skills: ${list || "none"}`;
	}
	return `# Skill: ${skill.name}\n${skill.description}\n\n${skill.content}`;
}
