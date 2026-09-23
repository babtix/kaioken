import { describe, expect, it } from "vitest";
import {
	createAllTools,
	createCodingTools,
	KNOWLEDGE_TOOLS,
	type CodingToolPorts,
	type FileSystemPort,
	type ShellPort,
} from "../../dist/index.js";

const mockFs: FileSystemPort = {
	async readFile() { return ""; },
	async writeFile() {},
	async exists() { return true; },
	async mkdir() {},
	async readdir() { return []; },
	async stat() { return { isFile: true, isDirectory: false, size: 0 }; },
};

const mockShell: ShellPort = {
	async exec() { return { exitCode: 0, stdout: "", stderr: "" }; },
};

const mockPorts: CodingToolPorts = {
	fs: mockFs,
	shell: mockShell,
};

describe("tool registry", () => {
	it("createCodingTools creates all 6 coding tools", () => {
		const tools = createCodingTools("/repo", mockPorts);
		expect(tools).toHaveLength(6);
		const names = tools.map((t) => t.name).sort();
		expect(names).toEqual(["bash", "edit", "find", "grep", "ls", "write"]);
	});

	it("createAllTools provides both knowledge and coding tools", () => {
		const all = createAllTools("/repo", mockPorts);
		expect(all.knowledge).toHaveLength(KNOWLEDGE_TOOLS.length);
		expect(all.coding).toHaveLength(6);
	});
});
