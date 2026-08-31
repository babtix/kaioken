import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extensionsRoot } from "./lock.js";

/**
 * The community index: how somebody finds an extension they did not already
 * know the name of.
 *
 * A plain JSON file at a URL, cached on disk. There is no server to run and
 * nothing to sign up for, and a listing here is not an endorsement — the index
 * says an extension exists, and the trust prompt still decides whether its code
 * ever runs.
 */

export interface RegistryEntry {
	id: string;
	name: string;
	description?: string;
	/** "owner/repo", which is what `ext install` takes. */
	repo: string;
	type?: string;
	author?: string;
}

const DEFAULT_REGISTRY =
	"https://raw.githubusercontent.com/babtix/kaioken-extensions/main/registry.json";

/** Six hours: long enough to stay out of the way, short enough to see new ones. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function registryUrl(): string {
	return process.env["KAIOKEN_EXTENSION_REGISTRY"] ?? DEFAULT_REGISTRY;
}

function cachePath(): string {
	return join(extensionsRoot(), "registry.json");
}

export interface RegistryOptions {
	force?: boolean;
	fetchJson?: (url: string) => Promise<unknown>;
}

export async function fetchRegistry(options: RegistryOptions = {}): Promise<RegistryEntry[]> {
	if (!options.force) {
		const cached = await readCache();
		if (cached) return cached;
	}

	const fetcher = options.fetchJson ?? defaultFetchJson;
	let payload: unknown;
	try {
		payload = await fetcher(registryUrl());
	} catch (error) {
		// A stale index beats no index: the network is not always there, and a
		// six-hour-old list of extension names is still a list of extensions.
		const cached = await readCache(Number.POSITIVE_INFINITY);
		if (cached) return cached;
		throw error;
	}

	const entries = normalise(payload);
	await writeCache(entries);
	return entries;
}

/** Substring match over id, name and description. */
export function searchRegistry(entries: readonly RegistryEntry[], term: string): RegistryEntry[] {
	const needle = term.trim().toLowerCase();
	if (!needle) return [...entries];
	return entries.filter((entry) =>
		`${entry.id} ${entry.name} ${entry.description ?? ""}`.toLowerCase().includes(needle),
	);
}

function normalise(payload: unknown): RegistryEntry[] {
	const list = Array.isArray(payload)
		? payload
		: payload && typeof payload === "object" && Array.isArray((payload as { extensions?: unknown }).extensions)
			? ((payload as { extensions: unknown[] }).extensions)
			: [];

	const out: RegistryEntry[] = [];
	for (const raw of list) {
		if (!raw || typeof raw !== "object") continue;
		const record = raw as Record<string, unknown>;
		const id = typeof record.id === "string" ? record.id : "";
		const repo = typeof record.repo === "string" ? record.repo : "";
		if (!id || !repo) continue;
		out.push({
			id,
			repo,
			name: typeof record.name === "string" ? record.name : id,
			...(typeof record.description === "string" ? { description: record.description } : {}),
			...(typeof record.type === "string" ? { type: record.type } : {}),
			...(typeof record.author === "string" ? { author: record.author } : {}),
		});
	}
	return out;
}

async function readCache(ttl = CACHE_TTL_MS): Promise<RegistryEntry[] | null> {
	try {
		const parsed = JSON.parse(await readFile(cachePath(), "utf8")) as {
			fetchedAt?: string;
			entries?: unknown;
		};
		const age = Date.now() - new Date(parsed.fetchedAt ?? 0).getTime();
		if (!Number.isFinite(age) || age > ttl) return null;
		return Array.isArray(parsed.entries) ? (parsed.entries as RegistryEntry[]) : null;
	} catch {
		return null;
	}
}

async function writeCache(entries: readonly RegistryEntry[]): Promise<void> {
	try {
		await mkdir(extensionsRoot(), { recursive: true });
		await writeFile(
			cachePath(),
			`${JSON.stringify({ fetchedAt: new Date().toISOString(), entries }, null, 2)}\n`,
			"utf8",
		);
	} catch {
		// A cache that could not be written is a slower search, not a failure.
	}
}

async function defaultFetchJson(url: string): Promise<unknown> {
	const response = await globalThis.fetch(url, {
		headers: { "user-agent": "kaioken-ext/1.0", accept: "application/json" },
	});
	// A 404 is the ordinary case today: no community index is published yet.
	// Reporting it as an HTTP code makes a missing feature look like a broken
	// one, and sends the reader hunting for a network problem they do not have.
	if (response.status === 404) throw new RegistryUnpublished(url);
	if (!response.ok) throw new Error(`fetching the extension registry: HTTP ${response.status}`);
	return response.json();
}

/** No index exists at the configured URL. Not an error in the machinery. */
export class RegistryUnpublished extends Error {
	constructor(readonly url: string) {
		super(
			[
				`no extension registry is published at ${url}`,
				"  install directly instead: kaioken ext install <owner/repo>",
				"  or point KAIOKEN_EXTENSION_REGISTRY at your own index",
			].join("\n"),
		);
		this.name = "RegistryUnpublished";
	}
}
