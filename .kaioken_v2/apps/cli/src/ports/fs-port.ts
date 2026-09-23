import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { FileSystemPort } from "@kaioken/agent";

/**
 * Concrete FileSystemPort backed by node:fs/promises.
 *
 * Implements the FileSystemPort contract from `@kaioken/agent` for production
 * CLI usage. All mutations are confined to what the agent tools request.
 */
export function createNodeFsPort(): FileSystemPort {
	return {
		async readFile(path: string, encoding: "utf8"): Promise<string> {
			return fs.readFile(path, encoding);
		},

		async writeFile(path: string, content: string): Promise<void> {
			return fs.writeFile(path, content, "utf8");
		},

		async exists(path: string): Promise<boolean> {
			try {
				await fs.access(path);
				return true;
			} catch {
				return false;
			}
		},

		async mkdir(path: string): Promise<void> {
			await fs.mkdir(path, { recursive: true });
		},

		async readdir(
			path: string,
		): Promise<Array<{ name: string; isDirectory: boolean; size: number }>> {
			const entries = await fs.readdir(path, { withFileTypes: true });
			return Promise.all(
				entries.map(async (entry) => {
					let size = 0;
					if (!entry.isDirectory()) {
						try {
							const s = await fs.stat(join(path, entry.name));
							size = s.size;
						} catch {
							size = 0;
						}
					}
					return {
						name: entry.name,
						isDirectory: entry.isDirectory(),
						size,
					};
				}),
			);
		},

		async stat(
			path: string,
		): Promise<{ isFile: boolean; isDirectory: boolean; size: number }> {
			const s = await fs.stat(path);
			return {
				isFile: s.isFile(),
				isDirectory: s.isDirectory(),
				size: s.size,
			};
		},
	};
}
