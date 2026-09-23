import type { SessionMutation } from "../state.js";
import type { Entry, LaneRecord } from "../types.js";
import { JsonlDecodeError } from "./errors.js";
import type { JsonlSessionMetadata, JsonlV4Header } from "./types.js";

const ENTRY_TYPES = new Set<Entry["type"]>([
	"message",
	"model_change",
	"thinking_level_change",
	"active_tools_change",
	"compaction",
	"branch_summary",
	"custom",
]);

const RECORD_TYPES = new Set<LaneRecord["type"]>([
	"operation_started",
	"abort_requested",
	"operation_finished",
	"step_attempt",
	"tool_started",
]);

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseObject(line: string): Record<string, unknown> {
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch (error) {
		throw new JsonlDecodeError("syntax", "is not valid JSON", error instanceof Error ? error : undefined);
	}
	if (!isObject(value)) throw new JsonlDecodeError("schema", "is not a JSON object");
	return value;
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== "string") throw new JsonlDecodeError("schema", `has invalid ${field}`);
	return value;
}

function requireSequence(value: unknown): number {
	if (!Number.isSafeInteger(value) || (value as number) <= 0) {
		throw new JsonlDecodeError("schema", "has invalid seq");
	}
	return value as number;
}

function requireTimestamp(value: unknown): number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw new JsonlDecodeError("schema", "has invalid timestamp");
	}
	return value as number;
}

function requireNullableId(value: unknown, field: string): string | null {
	if (value !== null && typeof value !== "string") {
		throw new JsonlDecodeError("schema", `has invalid ${field}`);
	}
	return value as string | null;
}

export function parseHeader(line: string): { ok: true; value: JsonlV4Header } | { ok: false; error: JsonlDecodeError } {
	try {
		const value = parseObject(line);
		if (value.kind !== "header") throw new JsonlDecodeError("schema", "is not a header");
		if (value.version !== 4) throw new JsonlDecodeError("schema", "has unsupported session version");
		const parentSessionId = value.parentSessionId;
		if (parentSessionId !== undefined && typeof parentSessionId !== "string") {
			throw new JsonlDecodeError("schema", "has invalid parentSessionId");
		}
		const metadata = isObject(value.metadata) ? (value.metadata as JsonlV4Header["metadata"]) : undefined;
		return {
			ok: true,
			value: {
				kind: "header",
				version: 4,
				id: requireString(value.id, "id"),
				createdAt: requireTimestamp(value.createdAt),
				cwd: requireString(value.cwd, "cwd"),
				parentSessionId,
				metadata,
			},
		};
	} catch (error) {
		if (error instanceof JsonlDecodeError) return { ok: false, error };
		return { ok: false, error: new JsonlDecodeError("syntax", String(error)) };
	}
}

export function encodeHeader(header: JsonlV4Header): string {
	return `${JSON.stringify(header)}\n`;
}

export function metadataFromHeader(
	header: JsonlV4Header,
	path: string,
	modifiedAt: number,
): JsonlSessionMetadata {
	return {
		id: header.id,
		createdAt: header.createdAt,
		cwd: header.cwd,
		path,
		modifiedAt,
		sourceFormat: 4,
		parentSessionId: header.parentSessionId,
		metadata: header.metadata,
	};
}

function parseEntryMutation(value: Record<string, unknown>, seq: number): Extract<SessionMutation, { kind: "entry" }> {
	const lane = value.lane === undefined ? undefined : requireString(value.lane, "lane");
	const id = requireString(value.id, "id");
	const type = requireString(value.type, "entry type") as Entry["type"];
	if (!ENTRY_TYPES.has(type)) {
		throw new JsonlDecodeError("schema", `has unknown entry type ${type}`);
	}
	const parentId = requireNullableId(value.parentId, "parentId");
	const timestamp = requireTimestamp(value.timestamp);
	const { kind: _kind, lane: _lane, ...entryFields } = value;
	const entry = { ...entryFields, id, type, parentId, seq, timestamp } as unknown as Entry;
	return lane === undefined ? { kind: "entry", entry } : { kind: "entry", lane, entry };
}

function parseRecordMutation(value: Record<string, unknown>, seq: number): Extract<SessionMutation, { kind: "record" }> {
	const id = requireString(value.id, "id");
	const lane = requireString(value.lane, "lane");
	const type = requireString(value.type, "record type") as LaneRecord["type"];
	if (!RECORD_TYPES.has(type)) {
		throw new JsonlDecodeError("schema", `has unknown record type ${type}`);
	}
	const timestamp = requireTimestamp(value.timestamp);
	const { kind: _kind, ...recordFields } = value;
	const record = { ...recordFields, id, lane, type, seq, timestamp } as unknown as LaneRecord;
	return { kind: "record", record };
}

function parseLaneMutation(value: Record<string, unknown>, seq: number): Extract<SessionMutation, { kind: "lane" }> {
	return {
		kind: "lane",
		seq,
		lane: requireString(value.lane, "lane"),
		leafId: requireNullableId(value.leafId, "leafId"),
	};
}

function parseFactMutation(value: Record<string, unknown>, seq: number): Extract<SessionMutation, { kind: "fact" }> {
	const fact = requireString(value.fact, "fact");
	if (fact === "name") {
		if (value.name !== undefined && typeof value.name !== "string") {
			throw new JsonlDecodeError("schema", "has invalid name");
		}
		return { kind: "fact", seq, fact: "name", name: value.name as string | undefined };
	}
	if (fact === "label") {
		const targetId = requireString(value.targetId, "targetId");
		if (value.label !== undefined && typeof value.label !== "string") {
			throw new JsonlDecodeError("schema", "has invalid label");
		}
		return {
			kind: "fact",
			seq,
			fact: "label",
			targetId,
			label: value.label as string | undefined,
		};
	}
	throw new JsonlDecodeError("schema", `has unknown fact type ${fact}`);
}

export function parseMutation(
	line: string,
): { ok: true; value: SessionMutation } | { ok: false; error: JsonlDecodeError } {
	try {
		const value = parseObject(line);
		const seq = requireSequence(value.seq);
		const kind = requireString(value.kind, "kind");

		switch (kind) {
			case "entry":
				return { ok: true, value: parseEntryMutation(value, seq) };
			case "record":
				return { ok: true, value: parseRecordMutation(value, seq) };
			case "lane":
				return { ok: true, value: parseLaneMutation(value, seq) };
			case "fact":
				return { ok: true, value: parseFactMutation(value, seq) };
			default:
				throw new JsonlDecodeError("schema", `has unknown mutation kind ${kind}`);
		}
	} catch (error) {
		if (error instanceof JsonlDecodeError) return { ok: false, error };
		return { ok: false, error: new JsonlDecodeError("syntax", String(error)) };
	}
}

export function encodeMutation(mutation: SessionMutation): string {
	switch (mutation.kind) {
		case "entry":
			return `${JSON.stringify({ kind: "entry", lane: mutation.lane, ...mutation.entry })}\n`;
		case "record":
			return `${JSON.stringify({ kind: "record", ...mutation.record })}\n`;
		case "lane":
			return `${JSON.stringify(mutation)}\n`;
		case "fact":
			return `${JSON.stringify(mutation)}\n`;
	}
}
