import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import bridgeInit from "../index.ts";
import { isDirty, registerHooks, setDirty } from "../hooks/index.ts";
import { GROUNDING_RULES } from "../prompts/grounding.ts";
import { fakePi as createFakePi } from "./fake-pi.ts";

describe("Phase 4: Grounded Prompt & Lifecycle Hooks", () => {
	it("injects grounding rules into system prompt on before_agent_start", async () => {
		const fake = createFakePi();
		bridgeInit(fake.pi);

		expect(fake.hooks.before_agent_start).toBeDefined();
		const handler = fake.hooks.before_agent_start[0];

		const event = {
			type: "before_agent_start",
			prompt: "build a feature",
			systemPrompt: "You are an assistant.",
			systemPromptOptions: {},
		};

		const result = await handler(event);
		expect(result.systemPrompt).toContain("You are an assistant.");
		expect(result.systemPrompt).toContain("KAIOKEN GROUNDING RULES");
		expect(result.systemPrompt).toContain("1. NEVER assert a symbol/import/file exists without kaio_symbol_lookup first.");
		expect(result.systemPrompt).toContain("5. A coding task is COMPLETE only after kaio_verify returns PASS.");
	});

	it("sets the grounded badge on session_start, and no widget", async () => {
		const fake = createFakePi();
		bridgeInit(fake.pi);

		let badgeStatus = "";
		const fakeCtx = {
			ui: {
				setStatus: (id: string, text: string) => {
					if (id === "kaioken") badgeStatus = text;
				},
				setWidget: () => {},
			},
		};

		await fake.hooks.session_start[0]({}, fakeCtx);
		expect(badgeStatus).toBe("grounded");
	});

	it("does not claim a model in the badge", async () => {
		// The badge used to read "grounded · flash-high" and a widget beneath it
		// named gemini-3.8-flash-high — a model hard-coded from the plan rather
		// than read from the session, so it named a model that was not running.
		// The header reports the real one; nothing else should guess.
		const fake = createFakePi();
		bridgeInit(fake.pi);
		await fake.emit("session_start", {}, fake.ctx());

		expect(fake.statusText().join(" ")).not.toMatch(/flash-high|gemini|nemotron|glm/i);
		expect(fake.widgets).toHaveLength(0);
	});

	it("flips badge to UNVERIFIED CHANGES and sets dirty on edit/write tool calls", async () => {
		const fake = createFakePi();
		bridgeInit(fake.pi);

		let badgeStatus = "";
		const fakeCtx = {
			ui: {
				setStatus: (id: string, text: string) => {
					if (id === "kaioken") badgeStatus = text;
				},
				setWidget: () => {},
			},
		};

		// Start session first to bind lastCtx
		await fake.hooks.session_start[0]({}, fakeCtx);
		setDirty(false);
		expect(isDirty()).toBe(false);

		// Trigger edit tool call
		const editEvent = { toolName: "edit", input: { path: "src/foo.ts" } };
		await fake.hooks.tool_call[0](editEvent, fakeCtx);

		expect(isDirty()).toBe(true);
		expect(badgeStatus).toBe("UNVERIFIED CHANGES");

		// Trigger write tool call
		setDirty(false);
		const writeEvent = { toolName: "write", input: { path: "src/bar.ts" } };
		await fake.hooks.tool_call[0](writeEvent, fakeCtx);

		expect(isDirty()).toBe(true);
		expect(badgeStatus).toBe("UNVERIFIED CHANGES");
	});

	it("blocks destructive bash operations and allows safe ones", async () => {
		const fake = createFakePi();
		bridgeInit(fake.pi);

		const fakeCtx = {
			ui: {
				setStatus: () => {},
				setWidget: () => {},
			},
		};

		const handler = fake.hooks.tool_call[0];

		// Destructive rm -rf
		const rmCall = { toolName: "bash", input: { command: "rm -rf /tmp/test" } };
		const rmResult = await handler(rmCall, fakeCtx);
		expect(rmResult).toEqual({ block: true, reason: "Kaioken policy: destructive operation blocked" });

		// Destructive git push --force
		const pushCall = { toolName: "bash", input: { command: "git push origin main --force" } };
		const pushResult = await handler(pushCall, fakeCtx);
		expect(pushResult).toEqual({ block: true, reason: "Kaioken policy: destructive operation blocked" });

		// Destructive DROP TABLE
		const sqlCall = { toolName: "bash", input: { command: "psql -c 'DROP TABLE users;'" } };
		const sqlResult = await handler(sqlCall, fakeCtx);
		expect(sqlResult).toEqual({ block: true, reason: "Kaioken policy: destructive operation blocked" });

		// Safe command
		const safeCall = { toolName: "bash", input: { command: "git status" } };
		const safeResult = await handler(safeCall, fakeCtx);
		expect(safeResult).toBeUndefined();
	});

	it("blocks destructive commands through either shell and in any case", async () => {
		const fake = createFakePi();
		bridgeInit(fake.pi);
		const fakeCtx = fake.ctx();

		// The guard names both shells; only `bash` was covered before, so a
		// destructive PowerShell command would have sailed through untested.
		const blocked = [
			{ toolName: "powershell", input: { command: "Remove-Item -Recurse -Force C:\\tmp" } },
			{ toolName: "powershell", input: { command: "rm -rf ./build" } },
			{ toolName: "bash", input: { command: "RM -RF /" } },
			{ toolName: "bash", input: { command: "git push origin main --FORCE" } },
			{ toolName: "bash", input: { command: "psql -c 'drop table users;'" } },
		];

		for (const call of blocked) {
			const [result] = await fake.emit("tool_call", call, fakeCtx);
			expect(result, `${call.toolName}: ${call.input.command}`).toEqual({
				block: true,
				reason: "Kaioken policy: destructive operation blocked",
			});
		}
	});

	it("allows a forced-free push and ignores destructive text in non-shell tools", async () => {
		const fake = createFakePi();
		bridgeInit(fake.pi);
		const fakeCtx = fake.ctx();

		// A plain push is the normal case and must not be blocked, or the guard
		// becomes something people route around.
		const [push] = await fake.emit(
			"tool_call",
			{ toolName: "bash", input: { command: "git push origin main" } },
			fakeCtx,
		);
		expect(push).toBeUndefined();

		// The rule is about what a shell would execute. `rm -rf` appearing in a
		// document being written is text, not a command.
		const [write] = await fake.emit(
			"tool_call",
			{ toolName: "write", input: { command: "rm -rf /" } },
			fakeCtx,
		);
		expect(write).toBeUndefined();
	});

	it("offers the skills path only when it exists, and never the theme path", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "kaio-resources-"));
		try {
			const fake = createFakePi();
			bridgeInit(fake.pi);

			// A fresh checkout has no `.kaioken/`. Offering a path that does not
			// exist makes Pi record a warning on every startup, so absence has
			// to yield nothing rather than a hopeful path.
			const empty = await fake.emitFirst(
				"resources_discover",
				{ cwd: tempDir, reason: "startup" },
				fake.ctx(tempDir),
			);
			expect(empty?.skillPaths).toBeUndefined();
			expect(empty?.themePaths).toBeUndefined();

			await mkdir(join(tempDir, ".kaioken", "skills"), { recursive: true });
			const withSkills = await fake.emitFirst(
				"resources_discover",
				{ cwd: tempDir, reason: "startup" },
				fake.ctx(tempDir),
			);
			expect(withSkills.skillPaths).toEqual([join(tempDir, ".kaioken", "skills")]);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("does not offer .pi/themes, which Pi already discovers on its own", async () => {
		// This is a regression guard, not a hypothetical. Offering the project's
		// own `.pi/themes` directory registers every theme in it a second time,
		// and Pi reports a name collision for each — the duplicate being
		// "skipped". It was noise on every single startup.
		const tempDir = await mkdtemp(join(tmpdir(), "kaio-theme-dup-"));
		try {
			await mkdir(join(tempDir, ".pi", "themes"), { recursive: true });

			const fake = createFakePi();
			bridgeInit(fake.pi);
			const result = await fake.emitFirst(
				"resources_discover",
				{ cwd: tempDir, reason: "startup" },
				fake.ctx(tempDir),
			);

			expect(result?.themePaths).toBeUndefined();
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("flips badge to verified ✓ and clears dirty on verify PASS", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "kaio-badge-verify-"));
		try {
			await writeFile(
				join(tempDir, "package.json"),
				JSON.stringify({ name: "verify-pass", scripts: { test: 'node -e "process.exit(0)"' } }),
			);

			const fake = createFakePi();
			let badgeStatus = "";
			const fakeCtx = {
				cwd: tempDir,
				ui: {
					setStatus: (id: string, text: string) => {
						if (id === "kaioken") badgeStatus = text;
					},
					setWidget: () => {},
				},
			};

			// Initialize
			bridgeInit(fake.pi);
			await fake.hooks.session_start[0]({}, fakeCtx);

			// Mark dirty via edit
			await fake.hooks.tool_call[0]({ toolName: "edit", input: {} }, fakeCtx);
			expect(isDirty()).toBe(true);
			expect(badgeStatus).toBe("UNVERIFIED CHANGES");

			// Run verify passing tool
			const verifyTool = fake.tools.get("kaio_verify");
			const result = await verifyTool.execute("verify-call", {}, undefined, undefined, fakeCtx);
			expect(result.content[0].text).toBe("VERIFY: PASS (0 errors)");

			// Badge must flip to verified ✓ and dirty cleared
			expect(isDirty()).toBe(false);
			expect(badgeStatus).toBe("verified ✓");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
