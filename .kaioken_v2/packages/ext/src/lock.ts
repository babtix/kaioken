import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Manifest } from "./manifest.js";

/**
 * What is installed, where it came from, and whether it may run.
 *
 * Extensions live per user rather than per repository: someone who installs a
 * documentation pack wants it in every checkout, and a copy per repository
 * would mean updating each of them. The lockfile is the record of that shared
 * state, and it holds the manifest as installed — so what the host acts on is
 * what was reviewed at install time, not whatever the package's files say now.
 */

export interface Installed {
	id: string;
	version: string;
	/** Where the archive came from: a URL, or a local path. */
	source: string;
	installedAt: string;
	/** Absolute install directory. */
	dir: string;
	/** Off means installed but not loaded. */
	enabled: boolean;
	/**
	 * The exact version the user trusted to run.
	 *
	 * Per version, never per extension: trusting `owner.name` once would make
	 * every future update — which is new code from the internet — trusted
	 * before anyone had seen it.
	 */
	trustedVersion?: string;
	manifest: Manifest;
}

export interface Lock {
	version: 1;
	extensions: Installed[];
}

/** The per-user root. `KAIOKEN_HOME` moves it, which is what tests use. */
export function extensionsRoot(): string {
	const home = process.env["KAIOKEN_HOME"];
	return home ? join(home, "extensions") : join(homedir(), ".kaioken", "extensions");
}

export function installDir(id: string, version: string): string {
	return join(extensionsRoot(), id, version);
}

export function lockPath(): string {
	return join(extensionsRoot(), "lock.json");
}

export async function loadLock(): Promise<Lock> {
	try {
		const parsed = JSON.parse(await readFile(lockPath(), "utf8")) as Partial<Lock>;
		return { version: 1, extensions: Array.isArray(parsed.extensions) ? parsed.extensions : [] };
	} catch {
		return { version: 1, extensions: [] };
	}
}

export async function saveLock(lock: Lock): Promise<void> {
	await mkdir(extensionsRoot(), { recursive: true });
	await writeFile(lockPath(), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

export function findInstalled(lock: Lock, id: string): Installed | undefined {
	return lock.extensions.find((entry) => entry.id === id);
}

/** Replace an entry with the same id, or append. Kept sorted for a readable file. */
export function upsert(lock: Lock, entry: Installed): void {
	const index = lock.extensions.findIndex((existing) => existing.id === entry.id);
	if (index === -1) lock.extensions.push(entry);
	else lock.extensions[index] = entry;
	lock.extensions.sort((a, b) => a.id.localeCompare(b.id));
}

export function removeFromLock(lock: Lock, id: string): boolean {
	const index = lock.extensions.findIndex((entry) => entry.id === id);
	if (index === -1) return false;
	lock.extensions.splice(index, 1);
	return true;
}

/**
 * May this entry's code run?
 *
 * A declarative extension has no code, so the question does not arise. For the
 * others the installed version has to match the trusted one exactly: an update
 * that inherited its predecessor's trust would be new code from the internet
 * running before anybody looked at it.
 */
export function isTrusted(entry: Installed): boolean {
	if (entry.manifest.type === "declarative") return true;
	return entry.trustedVersion === entry.version;
}
