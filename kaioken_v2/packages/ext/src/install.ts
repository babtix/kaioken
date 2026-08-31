import { cp, mkdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { extractTo, readTarGz } from "./archive.js";
import {
	findInstalled,
	installDir,
	loadLock,
	removeFromLock,
	saveLock,
	upsert,
	type Installed,
} from "./lock.js";
import { isExecutable, loadManifest, type Manifest } from "./manifest.js";
import { atLeast, isNewer } from "./semver.js";

/**
 * Installing an extension.
 *
 * Two sources, one path through the code. A local directory is how an author
 * tests what they are building; a GitHub repository is how everyone else gets
 * it. Both end in a directory whose manifest has been validated, an entry in
 * the lockfile, and — for anything that runs code — no trust at all until
 * somebody grants it by version.
 *
 * Installing is deliberately not enabling-and-running. An `mcp` or `wasm`
 * extension lands inert. The gap between "I installed this" and "this is now
 * executing on my machine" is where a person gets to look at what they fetched.
 */

export interface InstallOptions {
	/** A local directory, "owner/repo", or a full tarball URL. */
	source: string;
	/** The running host's version, checked against minKaiokenVersion. */
	hostVersion?: string;
	/** Fetch, injectable so tests never touch the network. */
	fetchArchive?: (url: string) => Promise<Buffer>;
	/** A specific release tag. Defaults to the latest release. */
	tag?: string;
}

export interface InstallResult {
	entry: Installed;
	/** True when this replaced an earlier version of the same extension. */
	upgraded: boolean;
	previousVersion?: string;
}

export async function installExtension(options: InstallOptions): Promise<InstallResult> {
	const staged = await stage(options);

	let manifest: Manifest;
	try {
		manifest = await loadManifest(staged.dir);
	} catch (error) {
		// A staging directory left behind after a failed install would be
		// picked up by the next one as though it had succeeded.
		await rm(staged.dir, { recursive: true, force: true });
		throw error;
	}

	if (manifest.minKaiokenVersion && options.hostVersion && !atLeast(options.hostVersion, manifest.minKaiokenVersion)) {
		await rm(staged.dir, { recursive: true, force: true });
		throw new Error(
			`extension ${manifest.id} needs Kaioken ${manifest.minKaiokenVersion} or newer (this is ${options.hostVersion})`,
		);
	}

	const target = installDir(manifest.id, manifest.version);
	await rm(target, { recursive: true, force: true });
	await mkdir(target, { recursive: true });
	await cp(staged.dir, target, { recursive: true });
	await rm(staged.dir, { recursive: true, force: true });

	const lock = await loadLock();
	const previous = findInstalled(lock, manifest.id);
	const entry: Installed = {
		id: manifest.id,
		version: manifest.version,
		source: staged.source,
		installedAt: new Date().toISOString(),
		dir: target,
		// A disabled extension that is reinstalled stays disabled: turning it
		// back on is a decision, and `ext update` is not the place to make it.
		enabled: previous ? previous.enabled : true,
		manifest,
		// Trust is per version, and this is still that version. Dropping it
		// here would mean `ext update` — which most people run over everything
		// at once — silently disarmed every extension they had trusted, and
		// re-trusting a dozen unchanged packages teaches people to type
		// `ext trust` without reading, which is the one habit this guards.
		...(previous?.trustedVersion === manifest.version ? { trustedVersion: manifest.version } : {}),
	};
	upsert(lock, entry);
	await saveLock(lock);

	// The old version's files stay only until the new one is recorded, so a
	// failed install never leaves the lockfile pointing at a deleted directory.
	if (previous && previous.version !== manifest.version) {
		await rm(previous.dir, { recursive: true, force: true });
	}

	return {
		entry,
		upgraded: Boolean(previous),
		...(previous ? { previousVersion: previous.version } : {}),
	};
}

export async function removeExtension(id: string): Promise<boolean> {
	const lock = await loadLock();
	const entry = findInstalled(lock, id);
	if (!entry) return false;
	await rm(entry.dir, { recursive: true, force: true });
	removeFromLock(lock, id);
	await saveLock(lock);
	return true;
}

export async function setEnabled(id: string, enabled: boolean): Promise<boolean> {
	const lock = await loadLock();
	const entry = findInstalled(lock, id);
	if (!entry) return false;
	entry.enabled = enabled;
	await saveLock(lock);
	return true;
}

/**
 * Trust one installed version to run.
 *
 * Recorded against the version rather than the extension, so the next update
 * arrives untrusted — which is the entire value of the record.
 */
export async function trustExtension(id: string, trusted: boolean): Promise<Installed | null> {
	const lock = await loadLock();
	const entry = findInstalled(lock, id);
	if (!entry) return null;
	if (trusted) entry.trustedVersion = entry.version;
	else delete entry.trustedVersion;
	await saveLock(lock);
	return entry;
}

export interface UpdateResult {
	id: string;
	from: string;
	to: string;
	updated: boolean;
	reason?: string;
}

/**
 * Reinstall from the source each entry was installed from.
 *
 * A local install updates by re-reading the directory, which is what an author
 * iterating on an extension wants; a remote one re-fetches its release.
 */
export async function updateExtensions(
	ids: readonly string[],
	options: Omit<InstallOptions, "source"> = {},
): Promise<UpdateResult[]> {
	const lock = await loadLock();
	const wanted = ids.length > 0 ? lock.extensions.filter((entry) => ids.includes(entry.id)) : lock.extensions;

	const out: UpdateResult[] = [];
	for (const entry of wanted) {
		try {
			const result = await installExtension({ ...options, source: entry.source });
			const updated = isNewer(result.entry.version, entry.version);
			out.push({
				id: entry.id,
				from: entry.version,
				to: result.entry.version,
				updated,
				...(updated ? {} : { reason: "already current" }),
			});
		} catch (error) {
			out.push({
				id: entry.id,
				from: entry.version,
				to: entry.version,
				updated: false,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return out;
}

/** Everything installed, whether or not it is enabled or trusted. */
export async function listInstalled(): Promise<Installed[]> {
	return (await loadLock()).extensions;
}

/** Extensions whose contributions should actually load. */
export async function activeExtensions(): Promise<Installed[]> {
	const lock = await loadLock();
	return lock.extensions.filter((entry) => entry.enabled);
}

/** Place the source in a staging directory and say where it came from. */
async function stage(options: InstallOptions): Promise<{ dir: string; source: string }> {
	const source = options.source.trim();
	if (!source) throw new Error("install needs a source: a directory, owner/repo, or a tarball URL");

	const local = await isDirectory(source);
	const staging = installDir(".staging", String(Date.now()));
	await rm(staging, { recursive: true, force: true });
	await mkdir(staging, { recursive: true });

	if (local) {
		// Copied rather than linked: an extension whose files change under the
		// host between load and use is a different extension than the one that
		// was validated.
		await cp(resolve(source), staging, { recursive: true });
		return { dir: staging, source: resolve(source) };
	}

	const url = archiveUrl(source, options.tag);
	const fetcher = options.fetchArchive ?? defaultFetch;
	const archive = await fetcher(url);
	await extractTo(readTarGz(archive), staging);
	return { dir: staging, source };
}

/** `owner/repo` is the common case; a full URL is taken as given. */
function archiveUrl(source: string, tag?: string): string {
	if (/^https?:\/\//.test(source)) return source;
	if (!/^[\w.-]+\/[\w.-]+$/.test(source)) {
		throw new Error(`"${source}" is not a directory, an owner/repo, or a URL`);
	}
	return tag
		? `https://codeload.github.com/${source}/tar.gz/refs/tags/${tag}`
		: `https://api.github.com/repos/${source}/tarball`;
}

async function defaultFetch(url: string): Promise<Buffer> {
	const response = await globalThis.fetch(url, {
		headers: { "user-agent": "kaioken-ext/1.0", accept: "application/octet-stream" },
		redirect: "follow",
	});
	if (!response.ok) throw new Error(`fetching ${url}: HTTP ${response.status}`);
	return Buffer.from(await response.arrayBuffer());
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

export { isExecutable };
