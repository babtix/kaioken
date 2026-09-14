import { SessionError } from "../types.js";

export class JsonlDecodeError extends Error {
	readonly kind: "syntax" | "schema";

	constructor(kind: "syntax" | "schema", message: string, cause?: Error) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "JsonlDecodeError";
		this.kind = kind;
	}
}

export function invalidFile(path: string, line: number, cause: Error): SessionError {
	return new SessionError(
		"invalid_entry",
		`Invalid JSONL session ${path}: line ${line} ${cause.message}`,
		cause,
	);
}
