import type { Skill } from "./skills.ts";

/**
 * Step-through procedure execution debugger (UX-1731–UX-1740).
 *
 * A skill body is a checklist an agent follows. The debugger makes that
 * checklist stepper-addressable: parse the body into discrete steps, then walk
 * them one at a time without ever reaching the network or touching the host.
 * Everything here is pure string logic so the offline core stays offline.
 */

export interface ProcedureStep {
	/** Zero-based position in the parsed procedure. */
	index: number;
	/** First line of the step, without the list marker. */
	title: string;
	/** Full step text including continuation lines. */
	body: string;
	/** Backtick-quoted repository paths cited by this step. */
	citations: string[];
	/** Backtick-quoted commands prescribed by this step. */
	commands: string[];
	/** 1-based line number in the original body where the step starts. */
	line: number;
}

export interface StepSession {
	skillName: string;
	steps: ProcedureStep[];
	/** Index of the current step. -1 when there are no steps. */
	position: number;
	completed: boolean[];
	history: number[];
}

const MAX_STEPS = 100;
const MAX_TITLE_CHARS = 240;

const COMMAND_RUNNERS = new Set([
	"npm",
	"npx",
	"pnpm",
	"pnpx",
	"yarn",
	"bun",
	"bunx",
	"deno",
	"cargo",
	"go",
	"make",
	"pytest",
	"python",
	"python3",
	"vitest",
	"jest",
	"tsc",
	"gradle",
	"mvn",
	"rake",
	"dotnet",
	"mix",
]);

function isFileLike(candidate: string): boolean {
	if (!candidate || candidate.length > 200) return false;
	if (candidate.startsWith("http://") || candidate.startsWith("https://")) return false;
	return /^[\w./-]+\.[A-Za-z0-9]{1,8}$/.test(candidate);
}

function isCommandLike(candidate: string): boolean {
	if (!candidate || candidate.length > 200) return false;
	if (candidate.startsWith("http://") || candidate.startsWith("https://")) return false;
	if (isFileLike(candidate) && !candidate.startsWith("./")) return false;
	const firstWord = candidate.split(/\s+/)[0] ?? "";
	if (COMMAND_RUNNERS.has(firstWord)) return true;
	if (candidate.startsWith("./") || candidate.startsWith("sh ") || candidate.startsWith("bash ")) return true;
	return false;
}

function extractCitationsAndCommands(text: string): { citations: string[]; commands: string[] } {
	const citations: string[] = [];
	const commands: string[] = [];
	const seenCitations = new Set<string>();
	const seenCommands = new Set<string>();
	for (const match of text.matchAll(/`([^`\n]+)`/g)) {
		const candidate = (match[1] ?? "").trim();
		if (!candidate) continue;
		if (isCommandLike(candidate)) {
			if (!seenCommands.has(candidate)) {
				seenCommands.add(candidate);
				commands.push(candidate);
			}
			continue;
		}
		if (isFileLike(candidate)) {
			const path = candidate.replace(/^\.\//, "");
			if (!seenCitations.has(path)) {
				seenCitations.add(path);
				citations.push(path);
			}
		}
	}
	return { citations, commands };
}

function stepsSection(body: string): { text: string; offset: number } {
	const lines = body.split("\n");
	let start = -1;
	for (let i = 0; i < lines.length; i++) {
		const line = (lines[i] ?? "").trim().toLowerCase();
		if (/^#{1,6}\s+steps?\b/.test(line)) {
			start = i + 1;
			break;
		}
	}
	if (start === -1) return { text: body, offset: 0 };
	let end = lines.length;
	for (let i = start; i < lines.length; i++) {
		const line = (lines[i] ?? "").trim();
		if (/^#{1,6}\s+\S/.test(line)) {
			end = i;
			break;
		}
	}
	return { text: lines.slice(start, end).join("\n"), offset: start };
}

function isStepMarker(line: string): { title: string } | null {
	const trimmed = line.trim();
	const numbered = /^(?:\d+[.)]\s+)(.+)$/.exec(trimmed);
	if (numbered) return { title: (numbered[1] ?? "").trim() };
	const checkbox = /^(?:[-*]\s+\[[ xX]\]\s+)(.+)$/.exec(trimmed);
	if (checkbox) return { title: (checkbox[1] ?? "").trim() };
	const bullet = /^(?:[-*]\s+)(.+)$/.exec(trimmed);
	if (bullet) {
		const rest = (bullet[1] ?? "").trim();
		if (rest) return { title: rest };
	}
	return null;
}

/**
 * Parse a skill body into stepper-addressable steps.
 *
 * Fail-soft by design: empty, whitespace-only, or marker-less bodies yield an
 * empty list rather than throwing. Output is capped so a huge context file
 * cannot blow up the session.
 */
export function parseProcedureSteps(content: string): ProcedureStep[] {
	if (typeof content !== "string") return [];
	const normalised = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
	if (!normalised.trim()) return [];
	const { text, offset } = stepsSection(normalised);
	const lines = text.split("\n");
	const steps: ProcedureStep[] = [];
	let current: { title: string; bodyLines: string[]; line: number } | null = null;
	function flush(): void {
		if (!current) return;
		if (steps.length >= MAX_STEPS) {
			current = null;
			return;
		}
		const body = current.bodyLines.join("\n").trim();
		if (!body) {
			current = null;
			return;
		}
		const { citations, commands } = extractCitationsAndCommands(body);
		steps.push({
			index: steps.length,
			title: current.title.slice(0, MAX_TITLE_CHARS),
			body,
			citations,
			commands,
			line: current.line,
		});
		current = null;
	}
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const marker = isStepMarker(line);
		if (marker && marker.title) {
			flush();
			if (steps.length >= MAX_STEPS) break;
			current = { title: marker.title, bodyLines: [marker.title], line: offset + i + 1 };
			continue;
		}
		if (current) current.bodyLines.push(line);
	}
	flush();
	return steps;
}

/** Start a step-through session over a skill body or pre-parsed steps. */
export function createStepSession(skillName: string, content: string | readonly ProcedureStep[]): StepSession {
	const steps = typeof content === "string" ? parseProcedureSteps(content) : [...content];
	const safeName = typeof skillName === "string" && skillName.trim() ? skillName.trim() : "skill";
	return {
		skillName: safeName,
		steps,
		position: steps.length > 0 ? 0 : -1,
		completed: steps.map(() => false),
		history: [],
	};
}

/** Start a session directly from a loaded skill record. */
export function sessionForSkill(skill: Skill): StepSession {
	return createStepSession(skill.name, skill.content);
}

/** The step the session is currently parked on, or null when there are no steps. */
export function currentStep(session: StepSession): ProcedureStep | null {
	if (session.position < 0 || session.position >= session.steps.length) return null;
	return session.steps[session.position] ?? null;
}

/** Advance one step. Returns the new current step, or null when at the end. */
export function stepNext(session: StepSession): ProcedureStep | null {
	if (session.position < 0) return null;
	if (session.position >= session.steps.length - 1) return null;
	session.history.push(session.position);
	session.position += 1;
	return currentStep(session);
}

/** Step back one position in history when possible, else one index back. */
export function stepPrev(session: StepSession): ProcedureStep | null {
	if (session.position < 0) return null;
	const previous = session.history.pop();
	if (previous !== undefined && previous >= 0 && previous < session.steps.length) {
		session.position = previous;
		return currentStep(session);
	}
	if (session.position === 0) return null;
	session.position -= 1;
	return currentStep(session);
}

/** Jump to an explicit step index. Returns null and leaves position unchanged on out-of-range input. */
export function stepTo(session: StepSession, index: number): ProcedureStep | null {
	if (!Number.isInteger(index) || index < 0 || index >= session.steps.length) return null;
	if (index !== session.position) {
		session.history.push(session.position);
		session.position = index;
	}
	return currentStep(session);
}

/** Mark the current step complete without advancing. */
export function completeCurrentStep(session: StepSession): boolean {
	const step = currentStep(session);
	if (!step) return false;
	session.completed[step.index] = true;
	return true;
}

/** Reset the session to its initial position and clear completion. */
export function resetSession(session: StepSession): void {
	session.position = session.steps.length > 0 ? 0 : -1;
	for (let i = 0; i < session.completed.length; i++) session.completed[i] = false;
	session.history.length = 0;
}

/** True when every parsed step is marked complete. Empty procedures are never complete. */
export function isComplete(session: StepSession): boolean {
	if (session.steps.length === 0) return false;
	return session.completed.every(Boolean);
}

/** One-line progress summary, e.g. "release 2/5 (40%)". */
export function formatSessionProgress(session: StepSession): string {
	if (session.steps.length === 0) return `${session.skillName} 0/0 (no steps)`;
	const done = session.completed.filter(Boolean).length;
	const at = session.position >= 0 ? session.position + 1 : 0;
	const pct = Math.round((done / session.steps.length) * 100);
	return `${session.skillName} ${at}/${session.steps.length} (done ${done}, ${pct}%)`;
}

/** Multi-line rendering of a single step for terminal display. Fail-soft on null. */
export function formatStep(skillName: string, step: ProcedureStep | null): string {
	if (!step) return `# ${skillName}\n\nNo steps to display.`;
	const lines = [`# ${skillName} — step ${step.index + 1}`, "", step.body];
	if (step.citations.length > 0) {
		lines.push("", "Cites:", ...step.citations.map((c) => `- \`${c}\``));
	}
	if (step.commands.length > 0) {
		lines.push("", "Runs:", ...step.commands.map((c) => `- \`${c}\``));
	}
	return lines.join("\n");
}
