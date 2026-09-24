import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import bridgeInit from "../index.ts";
import { DefaultSpendGate, LiveLog, parseMult, registerCommands, type SpendGate } from "../commands/index.ts";
import { fakePi as createFakePi } from "./fake-pi.ts";

function recordingUi() {
	const notifications: Array<{ message: string; type?: string }> = [];
	const statuses: Array<{ id: string; text: string | undefined }> = [];
	const widgets: Array<{ id: string; lines: string[] | undefined }> = [];
	const working: Array<string | undefined> = [];
	const entries: Array<{ customType: string; data?: any }> = [];
	return {
		ui: {
			notify: (message: string, type?: "info" | "warning" | "error") => {
				notifications.push({ message, ...(type ? { type } : {}) });
			},
			setStatus: (id: string, text: string | undefined) => {
				statuses.push({ id, text });
			},
			setWidget: (id: string, lines: string[] | undefined) => {
				widgets.push({ id, lines });
			},
			setWorkingMessage: (message?: string) => {
				working.push(message);
			},
		},
		appendEntry: (customType: string, data?: unknown) => {
			entries.push({ customType, data });
		},
		notifications,
		statuses,
		widgets,
		working,
		entries,
	};
}

describe("Phase 6: Command Surface & HUD", () => {
	it("registers all 16 commands", () => {
		const fake = createFakePi();
		bridgeInit(fake.pi);

		const expected = [
			"kaio-scan",
			"kaio-symbols",
			"kaio-search",
			"kaio-status",
			"kaio-verify",
			"kaio-graph",
			"kaio-serve",
			"kaio-export",
			"kaio-delegate",
			"kaio-merge",
			"kaio-plan",
			"kaio-cards",
			"kaio-wiki",
			"kaio-update",
			"kaio-research",
			"kaio-skills",
		];

		for (const name of expected) {
			expect(fake.commands.has(name)).toBe(true);
		}
		expect(fake.commands.size).toBe(16);
	});

	it("parses multiplier dial accurately", () => {
		expect(parseMult("")).toBe(3);
		expect(parseMult(undefined)).toBe(3);
		expect(parseMult("×1")).toBe(1);
		expect(parseMult("x5")).toBe(5);
		expect(parseMult("×10")).toBe(10);
		expect(parseMult("×99")).toBe(10); // clamped to 10
		expect(parseMult("0")).toBe(1); // clamped to 1
	});

	it("runs offline commands with zero network access", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "kaio-cmd-offline-"));
		try {
			await writeFile(
				join(tempDir, "sample.ts"),
				"export function testFn() { return 42; }\n",
			);

			const notifications: string[] = [];
			const fakeCtx = {
				cwd: tempDir,
				hasUI: true,
				ui: {
					notify: (msg: string) => notifications.push(msg),
					setStatus: () => {},
					setWidget: () => {},
				},
			};

			const fake = createFakePi();
			registerCommands(fake.pi, () => tempDir);

			const hasOutput = (text: string) =>
				notifications.some((n) => n.includes(text)) ||
				fake.entries.some((e) => String((e.data as any)?.message ?? "").includes(text));

			// 1. /kaio-scan
			const scanCmd = fake.commands.get("kaio-scan");
			await scanCmd.handler("", fakeCtx);
			expect(hasOutput("Scan complete")).toBe(true);

			// 2. /kaio-symbols
			notifications.length = 0;
			const symCmd = fake.commands.get("kaio-symbols");
			await symCmd.handler("testFn", fakeCtx);
			expect(hasOutput("testFn")).toBe(true);

			// 3. /kaio-status
			notifications.length = 0;
			const statusCmd = fake.commands.get("kaio-status");
			await statusCmd.handler("", fakeCtx);
			expect(hasOutput("DRIFT REPORT")).toBe(true);

			// 4. /kaio-graph
			notifications.length = 0;
			const graphCmd = fake.commands.get("kaio-graph");
			await graphCmd.handler("", fakeCtx);
			expect(hasOutput("Knowledge Graph")).toBe(true);

			// 5. /kaio-export
			notifications.length = 0;
			const exportCmd = fake.commands.get("kaio-export");
			await exportCmd.handler("", fakeCtx);
			expect(hasOutput("Exported")).toBe(true);
		} finally {
			await rm(tempDir, { recursive: true, force: true }).catch(() => {});
		}
	});

	it("prompts spend confirmation on model commands and respects user cancel", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "kaio-cmd-spend-"));
		try {
			const notifications: string[] = [];
			let confirmedPrompt = "";

			const fakeCtx = {
				cwd: tempDir,
				hasUI: true,
				ui: {
					notify: (msg: string) => notifications.push(msg),
					confirm: async (_title: string, message: string) => {
						confirmedPrompt = message;
						return false; // User cancels spend
					},
					setStatus: () => {},
					setWidget: () => {},
				},
			};

			const fake = createFakePi();
			registerCommands(fake.pi, () => tempDir);

			const planCmd = fake.commands.get("kaio-plan");
			await planCmd.handler("×5", fakeCtx);

			// The gate now quotes the active model's own registry, so with no model
			// bound it must say so plainly rather than print a made-up price.
			expect(confirmedPrompt).toContain("plan ×5");
			expect(confirmedPrompt).toContain("Cost: unknown");
			expect(confirmedPrompt).not.toMatch(/\$\d/);
			expect(confirmedPrompt).toContain("not a quote");
			expect(notifications).toContain("Cancelled spend.");
		} finally {
			await rm(tempDir, { recursive: true, force: true }).catch(() => {});
		}
	});

	it("executes /kaio-plan on confirmation and updates HUD widget with outline", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "kaio-cmd-plan-"));
		try {
			await writeFile(join(tempDir, "index.ts"), "export const a = 1;\n");

			let widgetLines: string[] = [];
			const fakeCtx = {
				cwd: tempDir,
				hasUI: true,
				ui: {
					notify: () => {},
					confirm: async () => true, // User confirms spend
					setStatus: () => {},
					setWidget: (_id: string, lines: string[]) => {
						widgetLines = lines;
					},
				},
			};

			const fake = createFakePi();
			registerCommands(fake.pi, () => tempDir);

			const planCmd = fake.commands.get("kaio-plan");
			await planCmd.handler("×3", fakeCtx);

			// The checkpoint is now a human-editable YAML plan.
			const writtenYaml = await readFile(join(tempDir, ".kaioken", "module-plan.yaml"), "utf8");
			expect(writtenYaml).toContain("Kaioken module plan");
			expect(writtenYaml).toContain("multiplier: 3");

			// Verify HUD widget received outline
			expect(widgetLines.length).toBeGreaterThan(0);
			expect(widgetLines[0]).toContain("module plan");
			// With no model bound the plan is mechanical, and says so.
			expect(widgetLines[0]).toContain("mechanical");
		} finally {
			await rm(tempDir, { recursive: true, force: true }).catch(() => {});
		}
	});

	it("quotes real registry pricing when a model is bound, with no hardcoded rates", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "kaio-cmd-cost-"));
		try {
			let confirmedPrompt = "";
			const fakeCtx = {
				cwd: tempDir,
				hasUI: true,
				// Deliberately unusual rates: if the gate were still hardcoding
				// Gemini prices, this figure could not appear.
				model: {
					id: "gemini-3.8-flash-high",
					provider: "antigravity",
					cost: { input: 1.0, output: 2.0, cacheRead: 0.1, cacheWrite: 0.2 },
				},
				ui: {
					notify: () => {},
					confirm: async (_title: string, message: string) => {
						confirmedPrompt = message;
						return false;
					},
					setStatus: () => {},
					setWidget: () => {},
				},
			};

			const fake = createFakePi();
			registerCommands(fake.pi, () => tempDir);
			await fake.commands.get("kaio-plan").handler("×1", fakeCtx);

			expect(confirmedPrompt).toContain("antigravity/gemini-3.8-flash-high");
			expect(confirmedPrompt).toMatch(/Cost: ~\$\d+\.\d{4} USD/);
			expect(confirmedPrompt).not.toContain("unknown");
		} finally {
			await rm(tempDir, { recursive: true, force: true }).catch(() => {});
		}
	});
});

describe("LiveLog: transcript + widget progress for long commands", () => {
	it("mirrors start and progress into transcript, footer, and spinner", () => {
		const rec = recordingUi();
		const log = new LiveLog(rec.ui, "wiki");

		log.start("wiki: generating 2 chapter(s) (×1)…");
		log.progress("wiki 1/2: chapter core");

		expect(rec.notifications.map((n) => n.message)).toEqual([
			"wiki: generating 2 chapter(s) (×1)…",
			"wiki 1/2: chapter core",
		]);
		expect(rec.statuses.map((s) => s.text)).toEqual([
			"wiki: generating 2 chapter(s) (×1)…",
			"wiki 1/2: chapter core",
		]);
		expect(rec.working).toEqual(["wiki: generating 2 chapter(s) (×1)…", "wiki 1/2: chapter core"]);
	});

	it("appends transcript entries alongside notifications, footer, and spinner", () => {
		const rec = recordingUi();
		const log = new LiveLog(rec.ui, "wiki", rec.appendEntry);

		log.start("wiki: generating 2 chapter(s) (×1)…");
		log.progress("Scanning files…");
		log.taskStarted("chapter core", "wiki: chapter core…");
		log.docDone("chapter core", "wiki 1/2: chapter core");
		log.failure("failed item");
		log.done("wiki finished", "grounded");

		expect(rec.entries.map((e) => ({ kind: e.data.kind, message: e.data.message }))).toEqual([
			{ kind: "start", message: "wiki: generating 2 chapter(s) (×1)…" },
			{ kind: "progress", message: "Scanning files…" },
			{ kind: "task", message: "wiki: chapter core…" },
			{ kind: "done", message: "wiki 1/2: chapter core" },
			{ kind: "error", message: "failed item" },
			{ kind: "done", message: "wiki finished" },
		]);
	});

	it("registers kaioken-progress entry renderer and produces TUI component", () => {
		const fake = createFakePi();
		registerCommands(fake.pi);

		expect(fake.entryRenderers.has("kaioken-progress")).toBe(true);
		const renderer = fake.entryRenderers.get("kaioken-progress");
		const fakeTheme = {
			fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
			bold: (text: string) => `<b>${text}</b>`,
		};
		const comp = renderer(
			{
				type: "custom",
				customType: "kaioken-progress",
				data: {
					scope: "wiki",
					kind: "done",
					message: "Wrote 3 chapters",
				},
			},
			{ expanded: false },
			fakeTheme,
		);
		expect(comp).toBeDefined();
		const rendered = comp.render(80);
		expect(rendered.join("\n")).toContain("wiki");
		expect(rendered.join("\n")).toContain("Wrote 3 chapters");
	});

	it("kaio-scan emits start, progress, and done transcript entries", async () => {
		const fake = createFakePi();
		registerCommands(fake.pi);
		const scanCmd = fake.commands.get("kaio-scan");
		const tempDir = await mkdtemp(join(tmpdir(), "kaio-scan-ui-"));
		try {
			await writeFile(join(tempDir, "a.ts"), "export const x = 1;\n");
			const ctx = fake.ctx(tempDir);
			await scanCmd.handler("", ctx);

			const scanEntries = fake.entries.filter((e) => e.customType === "kaioken-progress");
			expect(scanEntries.length).toBeGreaterThanOrEqual(2);
			expect((scanEntries[0]?.data as any)?.kind).toBe("start");
			expect((scanEntries.at(-1)?.data as any)?.kind).toBe("done");
		} finally {
			await rm(tempDir, { recursive: true, force: true }).catch(() => {});
		}
	});

	it("tracks in-flight work and persistent history in the widget", () => {
		const rec = recordingUi();
		const log = new LiveLog(rec.ui, "wiki");

		log.taskStarted("chapter core", "wiki: chapter core…");
		expect(rec.widgets.at(-1)?.lines).toEqual(["wiki:", "… chapter core"]);

		log.docDone("chapter core", "wiki 1/2: chapter core");
		expect(rec.widgets.at(-1)?.lines).toEqual(["wiki:", "✓ chapter core"]);

		log.taskStarted("section core/s1", "wiki: section core/s1…");
		expect(rec.widgets.at(-1)?.lines).toEqual(["wiki:", "✓ chapter core", "… section core/s1"]);
	});

	it("caps the widget at 10 lines", () => {
		const rec = recordingUi();
		const log = new LiveLog(rec.ui, "cards");

		for (let i = 0; i < 15; i++) log.docDone(`m${i}`, `cards ${i + 1}/15: m${i}`);
		const lines = rec.widgets.at(-1)?.lines ?? [];
		expect(lines.length).toBeLessThanOrEqual(10);
		expect(lines[0]).toBe("cards:");
		expect(lines.at(-1)).toBe("✓ m14");
	});

	it("reports failures as errors and clears the spinner on done", () => {
		const rec = recordingUi();
		const log = new LiveLog(rec.ui, "wiki");

		log.start("wiki: generating 1 chapter(s) (×1)…");
		log.failure("wiki: document core/index.md: boom");
		expect(rec.notifications.at(-1)).toEqual({ message: "wiki: document core/index.md: boom", type: "error" });
		expect(rec.working.at(-1)).toBeUndefined();
		expect(rec.widgets.at(-1)?.lines).toContain("✗ wiki: document core/index.md: boom");

		log.done("Wrote 0 document(s); 0 ungrounded claim(s) reported, 1 failure(s).", "grounded");
		expect(rec.statuses.at(-1)).toEqual({ id: "kaioken", text: "grounded" });
		expect(rec.working.at(-1)).toBeUndefined();
		expect(rec.notifications.at(-1)?.message).toContain("1 failure(s)");
	});

	it("kaio-plan emits immediate start and cancel entries on spend cancellation", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "kaio-plan-start-"));
		try {
			const fake = createFakePi();
			registerCommands(fake.pi, () => tempDir);
			const planCmd = fake.commands.get("kaio-plan");

			const ctx = fake.ctx(tempDir);
			(ctx.ui as any).confirm = async () => false; // User cancels spend

			await planCmd.handler("×2", ctx);

			const planEntries = fake.entries.filter((e) => e.customType === "kaioken-progress");
			expect(planEntries.length).toBeGreaterThanOrEqual(2);
			expect((planEntries[0]?.data as any)?.kind).toBe("start");
			expect((planEntries[0]?.data as any)?.message).toContain("Starting module planning");
			expect((planEntries.at(-1)?.data as any)?.kind).toBe("error");
			expect((planEntries.at(-1)?.data as any)?.message).toContain("cancelled at spend confirmation");
		} finally {
			await rm(tempDir, { recursive: true, force: true }).catch(() => {});
		}
	});

	it("kaio-merge emits immediate start entry before verification", async () => {
		const fake = createFakePi();
		registerCommands(fake.pi);
		const mergeCmd = fake.commands.get("kaio-merge");
		const tempDir = await mkdtemp(join(tmpdir(), "kaio-merge-start-"));
		try {
			const ctx = fake.ctx(tempDir);
			await mergeCmd.handler("feat-test", ctx);

			const mergeEntries = fake.entries.filter((e) => e.customType === "kaioken-progress");
			expect(mergeEntries.length).toBeGreaterThanOrEqual(1);
			expect((mergeEntries[0]?.data as any)?.kind).toBe("start");
			expect((mergeEntries[0]?.data as any)?.message).toContain("Verifying and merging worktree");
		} finally {
			await rm(tempDir, { recursive: true, force: true }).catch(() => {});
		}
	});
});

