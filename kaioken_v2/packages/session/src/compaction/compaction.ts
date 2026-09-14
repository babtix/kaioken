import {
	computeFileLists,
	createFileOps,
	extractFileOpsFromMessage,
	formatFileOperations,
	type GenericMessage,
	serializeConversation,
} from "./utils.js";

export interface CompactDetails {
	readFiles: string[];
	modifiedFiles: string[];
}

export interface CompactResult<T = CompactDetails> {
	summary: string;
	tokensBefore: number;
	retainedTail: GenericMessage[];
	details: T;
}

export interface CompactOptions {
	/** Number of recent turns (user + assistant) to retain untouched in context. Defaults to 2. */
	retainedTurnCount?: number;
	/** Token limit threshold after which compaction is recommended. */
	tokenThreshold?: number;
	/** Any previous summary to update. */
	previousSummary?: string;
	/** Custom user instructions for the summarizer. */
	customInstructions?: string;
}

export const SUMMARIZATION_SYSTEM_PROMPT = `You are an expert context compaction assistant for an autonomous software engineering agent.
Your mission is to distill prior conversation history into an authoritative, compact checkpoint summary.

CRITICAL DIRECTIVE - PRESERVE GROUND TRUTH:
You must strictly record the exact ground truth of all files modified, created, or deleted, and the exact build/test status.
Never say "files were updated" or "tests were run" without specifying EXACT file paths, function names, and pass/fail counts.
The continuing agent will rely entirely on this summary to avoid re-writing files already fixed and to avoid repeating completed work.
Do NOT continue the conversation. ONLY output the structured summary markdown.`;

export const GROUND_TRUTH_SUMMARIZATION_PROMPT = `The conversation history above represents work completed so far. Create a structured checkpoint summary following this EXACT schema:

## Goal & Scope
[Concise statement of the user's primary objective and any sub-tasks]

## Constraints & Preferences
- [Explicit constraints, rules, or architectural decisions specified by the user]

## Modified Files & Changes (Ground Truth)
- [List EVERY file path created or modified. Specify what changed (e.g. "packages/agent/src/tools/coding/edit.ts: added withFileMutationQueue lock and diff in details"). DO NOT omit any modified files.]

## Build & Test Status (Ground Truth)
- [Latest build, test, and verification status: exact command lines executed, test pass/fail counts, and 0 regressions confirmation]

## Progress & Completed Tasks
- [x] [Completed task 1]
- [x] [Completed task 2]
- [ ] [Current in-progress task]

## Key Architecture Decisions
- **[Component]**: [Decision and rationale]

## Next Steps
1. [Next immediate action to take]

## Critical Unresolved Context
- [Any lingering error messages, unresolved edge cases, or pending questions; or "(none)"]`;

export const UPDATE_GROUND_TRUTH_SUMMARIZATION_PROMPT = `The conversation history above represents NEW activity since the previous checkpoint.
Incorporate the new messages into the previous summary provided in <previous-summary> tags.

RULES:
1. PRESERVE GROUND TRUTH: Never drop modified files from the previous summary. Append newly modified files with exact paths.
2. UPDATE BUILD/TEST STATUS: Reflect the latest verification results and pass/fail counts.
3. MOVE PROGRESS: Move completed items from in-progress to done.
4. REVISE NEXT STEPS: Align next steps with the remaining uncompleted work.
Follow the EXACT schema from the original summary.`;

export function estimateTokens(messages: GenericMessage[]): number {
	let chars = 0;
	for (const msg of messages) {
		if (typeof msg.content === "string") {
			chars += msg.content.length;
		} else if (Array.isArray(msg.content)) {
			chars += JSON.stringify(msg.content).length;
		}
	}
	// Approximate 4 characters per token
	return Math.ceil(chars / 4);
}

export function shouldCompact(
	messages: GenericMessage[],
	tokenThreshold = 100_000,
): boolean {
	return estimateTokens(messages) >= tokenThreshold;
}

/**
 * Split messages into history to summarize and recent tail to retain verbatim.
 */
function partitionMessages(
	messages: GenericMessage[],
	retainedTurnCount: number,
): { toSummarize: GenericMessage[]; retainedTail: GenericMessage[] } {
	if (messages.length === 0) {
		return { toSummarize: [], retainedTail: [] };
	}

	let userTurnsSeen = 0;
	let splitIndex = messages.length;

	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i]?.role === "user") {
			userTurnsSeen++;
			if (userTurnsSeen === retainedTurnCount) {
				splitIndex = i;
				break;
			}
		}
	}

	if (splitIndex <= 0) {
		splitIndex = Math.floor(messages.length / 2);
	}

	return {
		toSummarize: messages.slice(0, splitIndex),
		retainedTail: messages.slice(splitIndex),
	};
}

/**
 * Compact conversation messages into an authoritative checkpoint summary.
 *
 * Invokes the injected `summarize` function without importing any model SDKs.
 */
export async function compact(
	messages: GenericMessage[],
	options: CompactOptions,
	summarize: (prompt: string) => Promise<string>,
): Promise<CompactResult> {
	const retainedTurnCount = options.retainedTurnCount ?? 2;
	const { toSummarize, retainedTail } = partitionMessages(messages, retainedTurnCount);

	const tokensBefore = estimateTokens(messages);

	// Extract file operations across the messages being compacted
	const fileOps = createFileOps();
	for (const msg of toSummarize) {
		extractFileOpsFromMessage(msg, fileOps);
	}
	const { readFiles, modifiedFiles } = computeFileLists(fileOps);
	const fileMetaXml = formatFileOperations(readFiles, modifiedFiles);

	// Serialize the messages to summarize into structured text
	const serializedConversation = serializeConversation(toSummarize);

	// Construct the prompt with Ground Truth guarantees
	const promptParts: string[] = [
		SUMMARIZATION_SYSTEM_PROMPT,
		"\n--- CONVERSATION HISTORY TO COMPACT ---\n",
		serializedConversation,
	];

	if (fileMetaXml) {
		promptParts.push("\n--- DETECTED FILE OPERATIONS ---\n", fileMetaXml);
	}

	if (options.previousSummary) {
		promptParts.push(
			"\n<previous-summary>\n",
			options.previousSummary,
			"\n</previous-summary>\n",
			UPDATE_GROUND_TRUTH_SUMMARIZATION_PROMPT,
		);
	} else {
		promptParts.push("\n", GROUND_TRUTH_SUMMARIZATION_PROMPT);
	}

	if (options.customInstructions) {
		promptParts.push(`\nADDITIONAL USER INSTRUCTIONS:\n${options.customInstructions}`);
	}

	const prompt = promptParts.join("\n");
	const rawSummary = await summarize(prompt);

	// Append machine-readable file metadata to the summary for downstream tooling
	const fullSummary = fileMetaXml ? `${rawSummary.trim()}${fileMetaXml}` : rawSummary.trim();

	return {
		summary: fullSummary,
		tokensBefore,
		retainedTail,
		details: { readFiles, modifiedFiles },
	};
}
