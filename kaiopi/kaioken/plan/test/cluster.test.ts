import { describe, expect, it } from "vitest";
import type { ScanResult } from "@kaioken/scan";
import {
	ARCHITECTURAL_DOMAINS,
	clusterDirectories,
	detectArchitecturalDomain,
} from "../src/cluster.ts";

function scanOf(files: Array<{ path: string; language?: string; risk?: string[]; binary?: boolean }>): ScanResult {
	return {
		root: "/repo",
		scannedAt: "",
		fileCount: files.length,
		totalBytes: files.length * 100,
		files: files.map((f) => ({
			path: f.path,
			language: f.language ?? "typescript",
			bytes: 100,
			lineCount: 10,
			risk: f.risk ?? [],
			binary: f.binary ?? false,
			hash: `hash-${f.path}`,
		})),
	} as unknown as ScanResult;
}

describe("plan: architectural domain detection (UX-1201 - UX-1210)", () => {
	it("detects all 10 architectural domains correctly", () => {
		expect(detectArchitecturalDomain("src/components/Header.tsx")).toBe("frontend-ui");
		expect(detectArchitecturalDomain("src/ui/theme.css")).toBe("frontend-ui");
		expect(detectArchitecturalDomain("src/api/routes.ts")).toBe("backend-api");
		expect(detectArchitecturalDomain("src/controllers/user.controller.ts")).toBe("backend-api");
		expect(detectArchitecturalDomain("src/models/User.ts")).toBe("database-orm");
		expect(detectArchitecturalDomain("src/db/migrations/001.sql")).toBe("database-orm");
		expect(detectArchitecturalDomain("src/auth/jwt.ts")).toBe("auth-session");
		expect(detectArchitecturalDomain("src/session/store.ts")).toBe("auth-session");
		expect(detectArchitecturalDomain("src/workers/indexer.ts")).toBe("job-worker");
		expect(detectArchitecturalDomain("src/queue/consumer.ts")).toBe("job-worker");
		expect(detectArchitecturalDomain("infra/terraform/main.tf")).toBe("cloud-infra");
		expect(detectArchitecturalDomain("Dockerfile")).toBe("cloud-infra");
		expect(detectArchitecturalDomain("src/cli/commands.ts")).toBe("cli-interface");
		expect(detectArchitecturalDomain("bin/run.ts")).toBe("cli-interface");
		expect(detectArchitecturalDomain("src/clients/stripe.ts")).toBe("third-party-client");
		expect(detectArchitecturalDomain("src/adapters/github.ts")).toBe("third-party-client");
		expect(detectArchitecturalDomain("test/unit/auth.test.ts")).toBe("testing-fixture");
		expect(detectArchitecturalDomain("src/utils/format.ts")).toBe("shared-util");
		expect(detectArchitecturalDomain("src/helpers/date.ts")).toBe("shared-util");
	});

	it("returns null for unrecognized paths", () => {
		expect(detectArchitecturalDomain("random_file.xyz")).toBeNull();
	});

	it("contains meta for all 10 domains", () => {
		expect(ARCHITECTURAL_DOMAINS).toHaveLength(10);
	});
});

describe("plan: clusterDirectories deterministic heuristic fallback (UX-1201 - UX-1210)", () => {
	it("returns empty array for empty scan or only generated files", () => {
		expect(clusterDirectories(scanOf([]))).toEqual([]);
		expect(clusterDirectories(scanOf([{ path: "dist/bundle.js", risk: ["generated"] }]))).toEqual([]);
	});

	it("clusters monorepo packages by package directory", () => {
		const scan = scanOf([
			{ path: "packages/core/src/index.ts" },
			{ path: "packages/ui/src/button.tsx" },
			{ path: "packages/ui/src/modal.tsx" },
			{ path: "tools/build.ts" },
			{ path: "README.md" },
		]);
		const modules = clusterDirectories(scan);
		const ids = modules.map((m) => m.id);

		expect(ids).toContain("packages-core");
		expect(ids).toContain("packages-ui");
		expect(ids).toContain("tools");
		expect(ids).toContain("root");

		const uiMod = modules.find((m) => m.id === "packages-ui");
		expect(uiMod?.purpose).toContain("Frontend UI view components");
	});

	it("sorts modules deterministically by ID", () => {
		const scan = scanOf([
			{ path: "z/file.ts" },
			{ path: "a/file.ts" },
			{ path: "m/file.ts" },
		]);
		const modules = clusterDirectories(scan);
		expect(modules.map((m) => m.id)).toEqual(["a", "m", "z"]);
	});
});
