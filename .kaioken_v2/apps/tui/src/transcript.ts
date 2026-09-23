/**
 * The transcript.
 *
 * v1 has no views: everything — chat, command output, approvals, listings —
 * lands as styled lines in one scrollback, and that single surface is most of
 * what makes the interface feel the way it does. These are the line builders,
 * ported from `tui.go`.
 *
 * Pure: values in, styled lines out. Nothing here touches state, which is what
 * lets the whole transcript be asserted on without a terminal.
 */
import { truncate } from "./screen.js";
import { renderProse } from "./markdown.js";
import { bold, dim, fg, DIFF_GUTTER } from "./theme.js";

/** One rendered line. The transcript is an array of these, nothing more. */
export type Line = string;

/**
 * Each tool gets a distinct shape, so a long run of calls can be skimmed by
 * silhouette: hollow marks read, solid marks write.
 */
export const TOOL_GLYPHS: Record<string, string> = {
	read_file: "◇",
	list_files: "◈",
	search: "◎",
	read_knowledge: "◈",
	write_file: "◆",
	edit_file: "◆",
	run_command: "▶",
	task: "◍",
	todo: "☰",
};

const DEFAULT_GLYPH = "◇";

/** The user's own input, echoed back so the transcript reads as a dialogue. */
export function userLine(text: string): Line {
	return bold(fg("user", `› ${text}`));
}

/** A powershell command invocation directly from the TUI. */
export function shellCommandLine(text: string): Line {
	return `${bold(fg("warn", "! powershell"))} ${bold(fg("user", `› ${text}`))}`;
}

/**
 * An assistant reply.
 *
 * Markdown is rendered only when the text carries structure worth rendering —
 * a one-line conversational answer gains nothing from a markdown pass except
 * padding and a parse. v1 made the same call via glamour and it held up.
 */
export function assistantLines(text: string, width: number): Line[] {
	return renderProse(text, width, 0).map((line) => fg("assistant", line));
}

/** A tool invocation: glyph, name, and whatever identifies the call. */
export function toolCallLine(name: string, args: string): Line {
	const glyph = TOOL_GLYPHS[name] ?? DEFAULT_GLYPH;
	const line = fg("tool", `${glyph} ${name}`);
	const compact = compactArgs(args);
	return compact ? `${line}  ${dim(compact)}` : line;
}

/** A tool result, hung under its call. */
export function toolResultLine(result: string, failed = false): Line {
	return `${dim("  └ ")}${fg(failed ? "error" : "toolResult", preview(result, 3, 240))}`;
}

/** Anything the interface says on its own behalf. */
export function infoLine(text: string): Line {
	return dim(text);
}

export function errorLine(text: string): Line {
	return fg("error", text);
}

export function okLine(text: string): Line {
	return fg("ok", text);
}

export function warnLine(text: string): Line {
	return fg("warn", text);
}

/** A request the interface is waiting on the user for. */
export interface ApprovalRequest {
	/** The verb: "write", "edit", "run". */
	action: string;
	/** What it acts on: a path, a command line. */
	target: string;
	/** The diff or command, rendered verbatim. */
	preview: string;
}

/**
 * A proposed change, as a block.
 *
 * A gutter down the left edge groups the diff into one visual unit, so a long
 * proposal cannot be mistaken for ordinary scrollback. The +/- tally goes in
 * the header because the size of a change is the first thing you want and the
 * last thing you can count.
 */
export function approvalLines(request: ApprovalRequest): Line[] {
	const body = request.preview.replace(/\n+$/, "").split("\n");
	let adds = 0;
	let dels = 0;
	for (const line of body) {
		if (line.startsWith("+")) adds++;
		else if (line.startsWith("-")) dels++;
	}

	let header = `${bold(fg("warn", `● ${request.action}`))}  ${bold(fg("user", request.target))}`;
	if (adds + dels > 0) {
		header += `  ${fg("diffAdd", `+${adds}`)} ${fg("diffDel", `-${dels}`)}`;
	}

	const bar = fg("warn", DIFF_GUTTER);
	const lines: Line[] = ["", header];
	for (const line of body) {
		if (line.startsWith("+")) lines.push(bar + fg("diffAdd", line));
		else if (line.startsWith("-")) lines.push(bar + fg("diffDel", line));
		else lines.push(bar + dim(line));
	}
	return lines;
}

/**
 * The identifying argument of a tool call, in one line.
 *
 * Ordered by how well each key identifies the call at a glance: `description`
 * is the task tool's own label for what it is off doing, and `doc` names the
 * knowledge page being opened.
 */
export function compactArgs(args: string): string {
	let parsed: unknown;
	try {
		parsed = JSON.parse(args);
	} catch {
		return truncate(args.replace(/\n/g, " "), 80);
	}
	if (typeof parsed !== "object" || parsed === null) return "";
	const record = parsed as Record<string, unknown>;
	for (const key of ["path", "command", "query", "description", "doc"]) {
		const value = record[key];
		if (typeof value === "string") return truncate(value, 80);
	}
	return "";
}

/**
 * Flatten output to a single line, capped.
 *
 * The newline marker keeps multi-line output legible on one row — dropping the
 * breaks entirely runs the last word of one line into the first of the next.
 */
export function preview(text: string, maxLines: number, maxChars: number): string {
	const trimmed = text.trim();
	const lines = trimmed.split("\n");
	let out =
		lines.length > maxLines ? `${lines.slice(0, maxLines).join(" ⏎ ")} …` : lines.join(" ⏎ ");
	if (out.length > maxChars) out = `${out.slice(0, maxChars)}…`;
	return out;
}

/** The newest non-blank line of streamed output — the one worth showing. */
export function lastOutputLine(chunk: string): string {
	const lines = chunk.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = (lines[i] ?? "").trim();
		if (line) return line;
	}
	return "";
}

/** A thinking/reasoning line, styled in dimmed text. */
export function thinkingLine(text: string): Line {
	return dim(text);
}

/** Header announcing model thought process, matching OpenCode/Claude Code style. */
export function thinkingHeaderLine(title?: string | null): Line {
	return thinkingCompletedHeader(title ?? null);
}

export interface ReasoningSummary {
	title: string | null;
	body: string;
}

/**
 * Extract an opening bold title block (`**Title**\n\n<body>`) from reasoning text,
 * matching OpenCode's reasoningSummary parser.
 */
export function reasoningSummary(text: string): ReasoningSummary {
	const content = text.trim();
	const match = content.match(/^\*\*([^*\n]+)\*\*(?:\r?\n\r?\n|$)/);
	if (!match) return { title: null, body: content };
	return { title: match[1]!.trim(), body: content.slice(match[0].length).trimEnd() };
}

/** While the model is thinking: live indicator and title. */
export function thinkingStreamingHeader(title: string | null): Line {
	const label = title ? `Thinking: ${title}` : "Thinking";
	return dim(`● ${label}`);
}

/** When the thinking step completes: duration and title. */
export function thinkingCompletedHeader(
	title: string | null,
	durationMs?: number,
	collapsed = false,
): Line {
	const duration =
		durationMs !== undefined
			? durationMs < 1000
				? `${durationMs}ms`
				: `${(durationMs / 1000).toFixed(1)}s`
			: undefined;
	const parts = [title, duration].filter(Boolean);
	const details = parts.length > 0 ? `: ${parts.join(" · ")}` : "";
	const prefix = collapsed ? "+ " : "";
	return dim(`${prefix}Thought${details}`);
}
