import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { posix, resolveInside } from "../dist/index.js";

describe("resolveInside", () => {
	it("allows a relative path inside the root", () => {
		const root = resolve("/repo");
		expect(resolveInside(root, "src/main.ts")).not.toBeNull();
	});

	it("allows an absolute path inside the root", () => {
		const root = resolve("/repo");
		const abs = resolve("/repo/src/main.ts");
		expect(resolveInside(root, abs)).toBe(abs);
	});

	it("refuses a path that escapes via ..", () => {
		const root = resolve("/repo");
		expect(resolveInside(root, "../../../etc/passwd")).toBeNull();
	});

	it("refuses an absolute path outside the root", () => {
		const root = resolve("/repo");
		expect(resolveInside(root, resolve("/other/file.ts"))).toBeNull();
	});

	it("returns the root itself for an empty relative path", () => {
		const root = resolve("/repo");
		expect(resolveInside(root, ".")).not.toBeNull();
	});

	// The test that matters on Windows: drive-letter case mismatch.
	// On POSIX, normalizeDrive is a no-op so this is a normal escape check.
	it("blocks traversal via drive-letter case mismatch", () => {
		if (process.platform !== "win32") return;
		// d:\root with a D:\ reference that escapes
		const root = "d:\\repo";
		const escape = "D:\\repo\\..\\other\\secret.txt";
		expect(resolveInside(root, escape)).toBeNull();
	});

	it("allows same-drive path on Windows regardless of case", () => {
		if (process.platform !== "win32") return;
		const root = "d:\\repo";
		const inside = "D:\\repo\\src\\main.ts";
		expect(resolveInside(root, inside)).not.toBeNull();
	});
});

describe("posix", () => {
	it("converts backslashes to forward slashes", () => {
		expect(posix("src\\tools\\path.ts")).toBe("src/tools/path.ts");
	});

	it("leaves forward slashes unchanged", () => {
		expect(posix("src/tools/path.ts")).toBe("src/tools/path.ts");
	});
});
