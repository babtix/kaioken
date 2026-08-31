import { describe, expect, it } from "vitest";
import { sessionSignals } from "@kaioken/session";
import { renderTranscript, toEvents } from "../src/session-text.js";

/**
 * The shapes below are not invented — they were captured from a real
 * pi-agent-core session (2026-08-31, openrouter/minimax via the CLI's own
 * runChat). That runtime puts tool calls in `content` parts of type
 * "toolCall" and reports results as role "toolResult" with `toolName` and an
 * `isError` flag. A reader written against the OpenAI-ish guesses — a
 * top-level `toolCalls` array and role "tool" — sees the calls but drops
 * every result, and with them the error_recovery signal.
 */

const REAL_ASSISTANT_WITH_CALLS = {
	role: "assistant",
	api: "openai-completions",
	provider: "openrouter",
	model: "minimax-m3:free",
	stopReason: "toolUse",
	content: [
		{ type: "thinking", thinking: "..." },
		{
			type: "toolCall",
			id: "call_1",
			name: "write",
			arguments: { path: "scratch-alpha.txt", content: "alpha" },
		},
	],
	usage: { input: 100, output: 20 },
	timestamp: 1,
};

const REAL_TOOL_RESULT_ERROR = {
	role: "toolResult",
	toolCallId: "call_2",
	toolName: "bash",
	content: [{ type: "text", text: "Command exited with code 3" }],
	isError: true,
	timestamp: 2,
};

const REAL_TOOL_RESULT_OK = {
	role: "toolResult",
	toolCallId: "call_3",
	toolName: "bash",
	content: [{ type: "text", text: "(no output)" }],
	isError: false,
	timestamp: 3,
};

describe("session text, against the shapes pi-agent-core actually saves", () => {
	it("turns a toolResult into a tool event named by toolName", () => {
		const events = toEvents([REAL_TOOL_RESULT_ERROR]);
		expect(events).toHaveLength(1);
		expect(events[0]?.role).toBe("tool");
		expect(events[0]?.tool).toBe("bash");
		expect(events[0]?.text).toContain("exited with code 3");
	});

	it("carries the runtime's isError flag onto the event", () => {
		const [failed] = toEvents([REAL_TOOL_RESULT_ERROR]);
		const [passed] = toEvents([REAL_TOOL_RESULT_OK]);
		expect(failed?.isError).toBe(true);
		expect(passed?.isError).toBe(false);
	});

	it("sees error_recovery when a failing command later passes", () => {
		// The text "exited with code 3" matches none of the gate's sniffed
		// patterns — only the isError flag carries the failure.
		const events = toEvents([
			{ role: "user", content: [{ type: "text", text: "run it" }] },
			{ role: "assistant", content: [{ type: "toolCall", id: "a", name: "bash", arguments: { command: "x" } }] },
			REAL_TOOL_RESULT_ERROR,
			{ role: "assistant", content: [{ type: "toolCall", id: "b", name: "bash", arguments: { command: "y" } }] },
			REAL_TOOL_RESULT_OK,
		]);
		expect(sessionSignals(events)).toContain("error_recovery");
	});

	it("keeps extracting tool calls from content parts", () => {
		const events = toEvents([REAL_ASSISTANT_WITH_CALLS]);
		expect(events[0]?.calls).toEqual([{ name: "write", path: "scratch-alpha.txt" }]);
	});

	it("renders a toolResult as the compact result line, not a prose blob", () => {
		const rendered = renderTranscript([REAL_TOOL_RESULT_ERROR]);
		expect(rendered).toContain("*bash result*");
		expect(rendered).not.toContain("**toolResult**");
	});
});
