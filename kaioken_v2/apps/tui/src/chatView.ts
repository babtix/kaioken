import { truncate, DIM, RESET, BOLD } from "./screen.js";

/**
 * The chat view.
 *
 * The transcript is the session — the same model the CLI uses. Streaming is
 * the one place a TUI clearly beats a command: the answer arrives as it is
 * generated, and the view keeps the last turns visible above the composer.
 */

export interface ChatTurn {
	role: "user" | "assistant";
	text: string;
}

export interface ChatViewState {
	input: string;
	turns: ChatTurn[];
	/** True while the model is mid-reply; input is disabled. */
	busy: boolean;
	error: string | null;
}

export function emptyChatState(): ChatViewState {
	return { input: "", turns: [], busy: false, error: null };
}

export function renderChat(state: ChatViewState, bodyHeight: number): string[] {
	const lines: string[] = [];

	lines.push(`${BOLD}Chat — the engine as an agent. Type a question, Enter to send.${RESET}`);
	lines.push("");

	// Render the tail of the transcript that fits, wrapping is left to the
	// terminal: long answers scroll in place rather than reflowing per frame.
	const body: string[] = [];
	for (const turn of state.turns) {
		if (turn.role === "user") {
			body.push(`you > ${turn.text}`);
			body.push("");
		} else {
			for (const line of turn.text.split("\n")) body.push(line);
			body.push("");
		}
	}
	if (state.busy) body.push(`${DIM}…thinking${RESET}`);
	if (state.error) body.push(`error: ${state.error}`);

	const visible = body.slice(Math.max(0, body.length - bodyHeight));
	lines.push(...visible);
	for (let i = lines.length; i < bodyHeight + 2; i++) lines.push("");

	lines.push(`> ${truncate(state.input, 70)}█`);
	return lines;
}
