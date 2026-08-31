/**
 * Did this session teach anything?
 *
 * Distilling a conversation into a skill costs a model call, and most sessions
 * have nothing to distil — a question asked and answered teaches the repository
 * nothing it did not already know. So the decision is made first, locally, from
 * the shape of the transcript alone: no model, no network, no cost. Only a
 * session that trips one of these signals is worth paying to think about.
 *
 * The signals are deliberately coarse. A false positive costs one call; a false
 * negative costs a lesson nobody ever learns again.
 */

export type Signal = "error_recovery" | "correction" | "multi_file" | "many_tools";

/** Below this a session is not substantial enough to hold a procedure. */
const MIN_TOOL_CALLS = 3;

export interface ConversationEvent {
	role: "user" | "assistant" | "tool" | "system";
	text: string;
	/** Tool names this assistant message called. */
	calls?: Array<{ name: string; path?: string }>;
	/** For a tool result: the tool it came from. */
	tool?: string;
	/**
	 * For a tool result: whether the runtime marked it failed.
	 *
	 * pi-agent-core sets this on every toolResult, and it is the only
	 * trustworthy source — the text of a failure ("Command exited with code
	 * 3") matches none of the sniffed patterns below for most exit codes.
	 */
	isError?: boolean;
}

export function sessionSignals(events: readonly ConversationEvent[]): Signal[] {
	const found: Signal[] = [];
	const add = (signal: Signal): void => {
		if (!found.includes(signal)) found.push(signal);
	};

	let toolCalls = 0;
	const editedFiles = new Set<string>();
	let assistantActed = false;
	let lastRunFailed = false;

	for (const event of events) {
		if (event.role === "assistant") {
			for (const call of event.calls ?? []) {
				toolCalls++;
				if (WRITE_TOOLS.has(call.name) && call.path) editedFiles.add(call.path);
				// Any action counts. A correction after a *read* is still the
				// user saying the agent went the wrong way.
				assistantActed = true;
			}
			continue;
		}

		if (event.role === "tool") {
			const failed = event.isError ?? looksLikeToolError(event.text);
			// The signal is recovery, not failure: a run that failed and then
			// passed is a session that found out how to make it pass.
			if (!failed && lastRunFailed) add("error_recovery");
			lastRunFailed = failed;
			continue;
		}

		if (event.role === "user") {
			if (assistantActed && looksLikeCorrection(event.text)) add("correction");
			assistantActed = false;
		}
	}

	if (toolCalls >= MIN_TOOL_CALLS) add("many_tools");
	// Edits across two or more files suggest a cross-cutting change whose
	// procedure — which files move together — is the thing worth recording.
	if (editedFiles.size >= 2) add("multi_file");

	return found;
}

const WRITE_TOOLS = new Set(["write", "write_file", "edit", "edit_file", "apply_patch"]);

/**
 * A tool result that reports failure.
 *
 * The fallback when an event carries no `isError` flag — sessions saved by
 * other harnesses, or older files. The agent surfaces errors as ordinary text
 * so the model can recover from them, so all that remains to read is the
 * shape of what the harness writes.
 */
export function looksLikeToolError(result: string): boolean {
	const text = result.trimStart().toLowerCase();
	return (
		text.startsWith("error:") ||
		text.startsWith("error ") ||
		text.startsWith("user declined") ||
		text.includes("exited with error") ||
		text.includes("exited with code 1") ||
		text.includes("command failed")
	);
}

/**
 * A user message that walks back what the agent just did.
 *
 * These are the strongest evidence that a convention was violated — the agent
 * did something reasonable, and a person who knows the project said no. That is
 * exactly the knowledge a skill exists to carry.
 */
export function looksLikeCorrection(text: string): boolean {
	const low = text.trim().toLowerCase();
	if (!low) return false;

	const first = low.split(/[\s,]+/)[0] ?? "";
	if (OPENERS.has(first)) return true;

	return MARKERS.some((marker) => low.includes(marker));
}

const OPENERS = new Set([
	"no",
	"nope",
	"wait",
	"stop",
	"actually",
	"don't",
	"dont",
	"not",
	"wrong",
	"instead",
	"revert",
	"undo",
]);

const MARKERS = [
	"not what i",
	"instead of",
	"i meant",
	"that's wrong",
	"thats wrong",
	"use ",
	"don't ",
	"dont ",
];
