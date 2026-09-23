import { randomUUID } from "node:crypto";
import { Session } from "../session.js";
import { type ForkOptions, SessionError, type SessionRepo } from "../types.js";
import { parseHeader } from "./codec.js";
import { JsonlSessionStorage } from "./storage.js";
import type {
	JsonlSessionCreateOptions,
	JsonlSessionListOptions,
	JsonlSessionMetadata,
	JsonlSessionRepoFileSystem,
	JsonlSessionRepoOptions,
	JsonlV4Header,
} from "./types.js";

function jsonlSessionDirectoryName(cwd: string): string {
	return `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

export class JsonlSessionRepo implements SessionRepo<JsonlSessionMetadata, JsonlSessionCreateOptions, JsonlSessionListOptions> {
	private readonly fs: JsonlSessionRepoFileSystem;
	private readonly sessionsRoot: string;

	constructor(options: JsonlSessionRepoOptions) {
		this.fs = options.fs;
		this.sessionsRoot = options.sessionsRoot;
	}

	async create(options: JsonlSessionCreateOptions): Promise<Session<JsonlSessionMetadata>> {
		const id = options.id ?? randomUUID();
		const cwd = options.cwd;
		if (!cwd) throw new SessionError("invalid_payload", "Session cwd is required");

		const dir = await this.fs.joinPath([this.sessionsRoot, jsonlSessionDirectoryName(cwd)]);
		await this.fs.createDir(dir, { recursive: true });
		const path = await this.fs.joinPath([dir, `${id}.jsonl`]);

		if (await this.fs.exists(path)) {
			throw new SessionError("already_exists", `Session already exists: ${id}`);
		}

		const header: JsonlV4Header = {
			kind: "header",
			version: 4,
			id,
			createdAt: Date.now(),
			cwd,
			parentSessionId: options.parentSessionId,
			metadata: options.metadata,
		};

		const storage = await JsonlSessionStorage.create(this.fs, path, header);
		return new Session(storage);
	}

	async load(metadata: JsonlSessionMetadata): Promise<Session<JsonlSessionMetadata>> {
		if (!(await this.fs.exists(metadata.path))) {
			throw new SessionError("not_found", `Session not found: ${metadata.id}`);
		}
		const storage = await JsonlSessionStorage.load(this.fs, metadata.path);
		return new Session(storage);
	}

	async list(query: JsonlSessionListOptions = {}): Promise<JsonlSessionMetadata[]> {
		const result: JsonlSessionMetadata[] = [];
		if (!(await this.fs.exists(this.sessionsRoot))) {
			return result;
		}

		const directories = await this.fs.listDir(this.sessionsRoot);
		for (const dir of directories) {
			if (dir.kind !== "directory") continue;
			const files = await this.fs.listDir(dir.path);
			for (const file of files) {
				if (!file.name.endsWith(".jsonl")) continue;
				try {
					const lines = await this.fs.readTextLines(file.path, { maxLines: 1 });
					if (!lines[0]) continue;
					const parsed = parseHeader(lines[0]);
					if (!parsed.ok) continue;
					const info = await this.fs.fileInfo(file.path);
					if (query.cwd && parsed.value.cwd !== query.cwd) continue;
					result.push({
						id: parsed.value.id,
						createdAt: parsed.value.createdAt,
						cwd: parsed.value.cwd,
						path: file.path,
						modifiedAt: info.mtimeMs,
						sourceFormat: 4,
						parentSessionId: parsed.value.parentSessionId,
						metadata: parsed.value.metadata,
					});
				} catch {
					// Ignore unreadable session files
				}
			}
		}

		return result.sort((a, b) => b.modifiedAt - a.modifiedAt);
	}

	async delete(metadata: JsonlSessionMetadata): Promise<void> {
		if (await this.fs.exists(metadata.path)) {
			await this.fs.remove(metadata.path, { force: true });
		}
	}

	async fork(
		source: JsonlSessionMetadata,
		options: ForkOptions & JsonlSessionCreateOptions,
	): Promise<Session<JsonlSessionMetadata>> {
		const targetId = options.id ?? randomUUID();
		const cwd = options.cwd ?? source.cwd;
		const dir = await this.fs.joinPath([this.sessionsRoot, jsonlSessionDirectoryName(cwd)]);
		await this.fs.createDir(dir, { recursive: true });
		const path = await this.fs.joinPath([dir, `${targetId}.jsonl`]);

		if (await this.fs.exists(path)) {
			throw new SessionError("already_exists", `Session already exists: ${targetId}`);
		}

		const header: JsonlV4Header = {
			kind: "header",
			version: 4,
			id: targetId,
			createdAt: Date.now(),
			cwd,
			parentSessionId: source.id,
			metadata: options.metadata,
		};

		const sourceStorage = await JsonlSessionStorage.load(this.fs, source.path);
		const targetStorage = await sourceStorage.fork(path, header, options);
		return new Session(targetStorage);
	}
}
