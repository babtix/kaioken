import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { loadSkills } from "@kaioken/agent";
import { readCards } from "@kaioken/plan";
import { KAIOKEN_DIR } from "@kaioken/scan";
import { readWikiPlan } from "@kaioken/wiki";

/**
 * AGENTS.md: the short instruction file an agent reads before it changes
 * anything.
 *
 * The wiki explains what the codebase contains; a skill explains how to carry
 * out one recurring task. AGENTS.md is neither. It is the list of things an
 * agent would otherwise get *wrong* — the real test command, the generated file
 * it must not hand-edit, the registry that has to be updated in lockstep. Every
 * line has to earn its place by answering "would a competent agent miss this?".
 *
 * The file has two halves with two different owners. The prose is written once
 * by a model and then edited by whoever maintains the repository. The pointer
 * block — what documentation exists and where — is rendered from disk between
 * markers on every run, so it cannot drift or advertise a chapter that was
 * never generated.
 */

export const AGENTS_FILE = "AGENTS.md";

const MARKER_START = "<!-- kaioken:knowledge:start — generated, do not edit by hand -->";
const MARKER_END = "<!-- kaioken:knowledge:end -->";

export function agentsPath(root: string): string {
	return join(root, AGENTS_FILE);
}

/** The current AGENTS.md, or "" when there is none. */
export async function loadAgents(root: string): Promise<string> {
	try {
		return normalise(await readFile(agentsPath(root), "utf8"));
	} catch {
		return "";
	}
}

export async function agentsExists(root: string): Promise<boolean> {
	try {
		return (await stat(agentsPath(root))).isFile();
	} catch {
		return false;
	}
}

/**
 * A BOM and CRLF endings are routine in files edited by Windows tooling, and
 * both would defeat the prefix checks that find the markers.
 */
function normalise(text: string): string {
	return text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
}

/**
 * The document with the generated block removed — the half a person authored.
 *
 * This is what gets fed back to the model when improving a file in place, so
 * the model is never asked to preserve text it does not own.
 */
export function authoredBody(doc: string): string {
	const text = normalise(doc);
	const start = text.indexOf(MARKER_START);
	if (start === -1) return text.trim();
	const end = text.indexOf(MARKER_END, start);
	if (end === -1) return text.slice(0, start).trim();
	return `${text.slice(0, start).trim()}\n\n${text.slice(end + MARKER_END.length).trim()}`.trim();
}

/**
 * Splice the generated block into a document, replacing one that is already
 * there so edits around it survive. A document without the markers gets it
 * appended.
 */
export function mergeKnowledge(doc: string, section: string): string {
	let text = normalise(doc);
	const block = section.trim();

	const start = text.indexOf(MARKER_START);
	if (start >= 0) {
		const end = text.indexOf(MARKER_END, start);
		if (end >= 0) {
			const head = text.slice(0, start).replace(/[ \t\n]+$/, "");
			const tail = text.slice(end + MARKER_END.length).replace(/^[ \t\n]+/, "");
			return `${`${head}\n\n${block}\n${tail}`.trim()}\n`;
		}
		// A truncated marker block — half a generated section. Drop it rather
		// than nesting a second one inside it.
		text = text.slice(0, start).trim();
	}
	if (block === "") return `${text.trim()}\n`;
	return `${text.trim()}\n\n${block}\n`;
}

/**
 * The pointer block, rendered from what is actually on disk.
 *
 * Empty when nothing has been generated yet: a fresh `kaioken init` must not
 * advertise documents that do not exist.
 */
export async function knowledgeSection(root: string): Promise<string> {
	const plan = await readWikiPlan(root);
	const chapters = plan?.chapters ?? [];
	const cards = await readCards(root);
	const { skills } = await loadSkills(root);

	if (chapters.length === 0 && cards.length === 0 && skills.length === 0) return "";

	const out: string[] = [
		MARKER_START,
		"",
		"## Project knowledge (generated)",
		"",
		`Kaioken maintains documentation for this repository under \`${KAIOKEN_DIR}/\`.`,
		"Read the relevant entry before exploring source files — it is faster, and it",
		"carries decisions the code does not state. Source files remain ground truth:",
		"if a document and the code disagree, the code wins.",
	];

	if (skills.length > 0) {
		out.push("", `### Task guides (\`${KAIOKEN_DIR}/skills/\`)`, "");
		out.push("Open the matching skill FIRST when starting one of these tasks:", "");
		for (const skill of skills) {
			out.push(skill.description ? `- \`${skill.name}\` — ${skill.description}` : `- \`${skill.name}\``);
		}
	}

	if (chapters.length > 0) {
		out.push("", `### Wiki (\`${KAIOKEN_DIR}/wiki/\`)`, "");
		for (const chapter of chapters) {
			const sections = (chapter.sections ?? []).map((section) => section.title);
			out.push(sections.length > 0 ? `- **${chapter.title}** — ${sections.join(", ")}` : `- **${chapter.title}**`);
		}
	}

	if (cards.length > 0) {
		const ids = [...cards].map((card) => card.moduleId).sort();
		out.push("", `### Knowledge cards (\`${KAIOKEN_DIR}/cards/\`)`, "");
		out.push(`Dense per-module cards for: ${ids.join(", ")}`);
	}

	out.push("", "Refresh after significant changes with `kaioken update`.", "", MARKER_END);
	return out.join("\n");
}
