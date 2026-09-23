import { gunzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

/**
 * Unpacking a release archive.
 *
 * A gzipped tar, read here rather than through a dependency: the format is a
 * few hundred bytes of header arithmetic, and an extension installer is exactly
 * the wrong place to add a transitive supply chain. GitHub serves release
 * tarballs in this format, so it is also the format that arrives.
 *
 * Every path is checked against the destination before anything is written. An
 * archive is untrusted input by definition — that is the whole point of
 * installing one — and `../../.bashrc` inside a tar entry is the oldest trick
 * there is.
 */

const BLOCK = 512;

export interface ArchiveEntry {
	path: string;
	body: Buffer;
}

/** Read a .tar.gz into its file entries, with directories and metadata dropped. */
export function readTarGz(archive: Buffer): ArchiveEntry[] {
	return readTar(gunzipSync(archive));
}

export function readTar(tar: Buffer): ArchiveEntry[] {
	const out: ArchiveEntry[] = [];
	let offset = 0;
	// A long name from the GNU extension applies to the entry that follows it.
	let pendingName = "";

	while (offset + BLOCK <= tar.length) {
		const header = tar.subarray(offset, offset + BLOCK);
		// Two consecutive zero blocks end the archive; one is enough to stop.
		if (header.every((byte) => byte === 0)) break;

		const name = pendingName || readString(header, 0, 100);
		const size = readOctal(header, 124, 12);
		const typeFlag = String.fromCharCode(header[156] as number);
		const prefix = readString(header, 345, 155);
		pendingName = "";

		const dataStart = offset + BLOCK;
		const dataEnd = dataStart + size;
		const padded = Math.ceil(size / BLOCK) * BLOCK;
		offset = dataStart + padded;

		if (typeFlag === "L") {
			// GNU long name: the body is the next entry's path.
			pendingName = tar.subarray(dataStart, dataEnd).toString("utf8").replace(/\0+$/, "");
			continue;
		}
		// Regular files only. A symlink inside an archive is a way to write
		// outside the destination after extraction, so they are dropped.
		if (typeFlag !== "0" && typeFlag !== "\0") continue;

		const full = prefix ? `${prefix}/${name}` : name;
		if (!full || full.endsWith("/")) continue;
		out.push({ path: full, body: tar.subarray(dataStart, dataEnd) });
	}
	return out;
}

/**
 * Write entries under `dest`, stripping the archive's single root directory.
 *
 * GitHub wraps a tarball in `owner-repo-<sha>/`, which nobody wants reproduced
 * on disk. The strip happens only when every entry shares one root — an archive
 * with several top-level directories means something else, and quietly dropping
 * the first path segment would scatter its files.
 */
export async function extractTo(entries: readonly ArchiveEntry[], dest: string): Promise<number> {
	const root = commonRoot(entries);
	const base = resolve(dest);
	let written = 0;

	for (const entry of entries) {
		const relative = root ? entry.path.slice(root.length + 1) : entry.path;
		if (!relative) continue;

		const target = resolve(base, relative);
		// The check that matters: the resolved path has to stay under dest.
		if (target !== base && !target.startsWith(base + sep)) {
			throw new Error(`archive entry "${entry.path}" escapes the install directory`);
		}

		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, entry.body);
		written++;
	}
	return written;
}

/** The single directory every entry sits under, or "" when there is not one. */
function commonRoot(entries: readonly ArchiveEntry[]): string {
	let root: string | null = null;
	for (const entry of entries) {
		const slash = entry.path.indexOf("/");
		if (slash <= 0) return "";
		const segment = entry.path.slice(0, slash);
		if (root === null) root = segment;
		else if (root !== segment) return "";
	}
	return root ?? "";
}

function readString(header: Buffer, offset: number, length: number): string {
	const raw = header.subarray(offset, offset + length);
	const end = raw.indexOf(0);
	return raw.subarray(0, end === -1 ? raw.length : end).toString("utf8");
}

function readOctal(header: Buffer, offset: number, length: number): number {
	const text = readString(header, offset, length).trim();
	if (!text) return 0;
	const value = Number.parseInt(text, 8);
	return Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Join a repo-relative path onto a base, refusing anything that escapes it. */
export function safeJoin(base: string, relative: string): string {
	const target = resolve(base, relative);
	const root = resolve(base);
	if (target !== root && !target.startsWith(root + sep)) {
		throw new Error(`"${relative}" escapes ${base}`);
	}
	return join(base, relative);
}
