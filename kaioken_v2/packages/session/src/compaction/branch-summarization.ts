import type { Session } from "../session.js";
import { type Entry, SessionError } from "../types.js";
import {
	computeFileLists,
	createFileOps,
	extractFileOpsFromMessage,
	formatFileOperations,
	type GenericMessage,
	serializeConversation,
} from "./utils.js";

export interface BranchSummaryResult {
	summary: string;
	readFiles: string[];
	modifiedFiles: string[];
}

export interface CollectEntriesResult {
	entries: Entry[];
	commonAncestorId: string | null;
}

/**
 * Collect entries that should be summarized before navigating to a different session tree branch.
 */
export async function collectEntriesForBranchSummary(
	session: Session,
	oldLeafId: string | null,
	targetId: string,
): Promise<CollectEntriesResult> {
	if (!oldLeafId) {
		return { entries: [], commonAncestorId: null };
	}

	const oldBranch = await session.findEntriesOnBranch({ start: oldLeafId });
	const oldPathIds = new Set(oldBranch.map((entry) => entry.id));

	const targetBranch = await session.findEntriesOnBranch({ start: targetId });
	let commonAncestorId: string | null = null;

	// Deepest common ancestor
	for (let i = targetBranch.length - 1; i >= 0; i--) {
		const entry = targetBranch[i]!;
		if (oldPathIds.has(entry.id)) {
			commonAncestorId = entry.id;
			break;
		}
	}

	const entries: Entry[] = [];
	let current: string | null = oldLeafId;

	while (current && current !== commonAncestorId) {
		const entry = await session.getEntry(current);
		if (!entry) throw new SessionError("invalid_entry", `Entry not found: ${current}`);
		entries.push(entry);
		current = entry.parentId;
	}

	entries.reverse();
	return { entries, commonAncestorId };
}

/**
 * Summarize work done on an abandoned or divergent branch before jumping to another node.
 */
export async function summarizeBranch(
	session: Session,
	oldLeafId: string | null,
	targetId: string,
	summarize: (prompt: string) => Promise<string>,
): Promise<BranchSummaryResult> {
	const { entries } = await collectEntriesForBranchSummary(session, oldLeafId, targetId);
	if (entries.length === 0) {
		return { summary: "", readFiles: [], modifiedFiles: [] };
	}

	const messages: GenericMessage[] = [];
	const fileOps = createFileOps();

	for (const entry of entries) {
		if (entry.type === "message") {
			messages.push(entry.message);
			extractFileOpsFromMessage(entry.message, fileOps);
		}
	}

	const { readFiles, modifiedFiles } = computeFileLists(fileOps);
	const fileMetaXml = formatFileOperations(readFiles, modifiedFiles);
	const conversationText = serializeConversation(messages);

	const prompt = `You are summarizing an exploration branch in a coding session before jumping back to another point in the tree.
Summarize what was tried on this branch, what was learned, and which files were touched.

--- BRANCH HISTORY ---
${conversationText}
${fileMetaXml ? `\n--- FILES TOUCHED ---\n${fileMetaXml}` : ""}

Provide a concise summary highlighting key learnings and file modifications:`;

	const summaryText = await summarize(prompt);
	const fullSummary = fileMetaXml ? `${summaryText.trim()}${fileMetaXml}` : summaryText.trim();

	return {
		summary: fullSummary,
		readFiles,
		modifiedFiles,
	};
}
