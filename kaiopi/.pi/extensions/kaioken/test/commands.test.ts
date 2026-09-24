import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import bridgeInit from "../index.ts";
import {
	DefaultSpendGate,
	LiveLog,
	parseMult,
	registerCommands,
	registerProgressRenderer,
	type SpendGate,
	renderProgressBar,
	renderProgressCard,
	type ProgressState,
	parseUnifiedDiff,
	renderDiffBlock,
	osc52Copy,
	copySnippetAction,
	renderCodeSnippet,
	AutoScrollController,
	MilestoneTrail,
	formatBreadcrumbsText,
	renderBreadcrumbs,
} from "../commands/index.ts";
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

describe("Step 17: Chat Transcript & Interactive Output Stream (UX-0101 - UX-0200)", () => {
	describe("17.1: In-place live-updating progress cards with sub-phase spinners (UX-0101 - UX-0110)", () => {
		it("renders progress bars with percentage and fraction accurately", () => {
			const bar0 = renderProgressBar(0, 10, 10, true);
			expect(bar0).toContain("0%");
			expect(bar0).toContain("(0/10)");
			expect(bar0).toContain("░░░░░░░░░░");

			const bar50 = renderProgressBar(5, 10, 10, true);
			expect(bar50).toContain("50%");
			expect(bar50).toContain("(5/10)");
			expect(bar50).toContain("█████░░░░░");

			const barAscii = renderProgressBar(5, 10, 10, false);
			expect(barAscii).toContain("#####-----");

			const barClamp = renderProgressBar(20, 10, 10, true);
			expect(barClamp).toContain("100%");
			expect(barClamp).toContain("(10/10)");
		});

		it("renders progress card across running, done, error and paused states", () => {
			const state: ProgressState = {
				scope: "plan",
				title: "Module Architecture Plan",
				phase: "Decomposing modules",
				subphase: "Heuristic clustering",
				current: 3,
				total: 10,
				status: "running",
				subtasks: [
					{ name: "Scan files", status: "done" },
					{ name: "Build symbol index", status: "running" },
					{ name: "Validate YAML checkpoint", status: "pending" },
				],
				elapsedMs: 2500,
			};

			const cardRunning = renderProgressCard(state, { expanded: true, frame: 1, unicode: true });
			expect(cardRunning).toBeDefined();

			const cardDone = renderProgressCard({ ...state, status: "done" }, { expanded: false });
			expect(cardDone).toBeDefined();

			const cardError = renderProgressCard({ ...state, status: "error" }, { expanded: true });
			expect(cardError).toBeDefined();

			const cardPaused = renderProgressCard({ ...state, status: "paused" }, { expanded: false });
			expect(cardPaused).toBeDefined();
		});

		it("LiveLog.progressCard emits custom entry with progressState payload", () => {
			const rec = recordingUi();
			const log = new LiveLog(rec.ui, "plan", rec.appendEntry);

			const state: ProgressState = {
				scope: "plan",
				title: "Planning Modules",
				phase: "Clustering",
				status: "running",
			};
			log.progressCard(state);

			expect(rec.entries.length).toBe(1);
			expect(rec.entries[0]?.customType).toBe("kaioken-progress");
			expect((rec.entries[0]?.data as any)?.kind).toBe("card");
			expect((rec.entries[0]?.data as any)?.progressState).toEqual(state);
		});
	});

	describe("17.2: Syntax-highlighted unified diff blocks with collapsible folds (UX-0111 - UX-0120)", () => {
		const sampleDiff = `diff --git a/src/math.ts b/src/math.ts
--- a/src/math.ts
+++ b/src/math.ts
@@ -1,4 +1,5 @@
-export function add(a: number, b: number) { return a - b; }
+export function add(a: number, b: number) { return a + b; }
+export function sub(a: number, b: number) { return a - b; }
 context line
`;

		it("parses unified diff hunks, additions and deletions", () => {
			const parsed = parseUnifiedDiff(sampleDiff);
			expect(parsed.files).toHaveLength(1);
			expect(parsed.files[0]?.from).toBe("src/math.ts");
			expect(parsed.files[0]?.to).toBe("src/math.ts");
			expect(parsed.totalAdded).toBe(2);
			expect(parsed.totalDeleted).toBe(1);
		});

		it("renders collapsed summary pill vs expanded full diff block", () => {
			const collapsedBox = renderDiffBlock(sampleDiff, { collapsed: true });
			expect(collapsedBox).toBeDefined();

			const expandedBox = renderDiffBlock(sampleDiff, { expanded: true, collapsed: false });
			expect(expandedBox).toBeDefined();
		});

		it("LiveLog.diff emits kaioken-diff entry", () => {
			const rec = recordingUi();
			const log = new LiveLog(rec.ui, "gitops", rec.appendEntry);
			log.diff(sampleDiff, { collapsed: false });

			expect(rec.entries.length).toBe(1);
			expect(rec.entries[0]?.customType).toBe("kaioken-diff");
			expect((rec.entries[0]?.data as any)?.diffText).toBe(sampleDiff);
			expect((rec.entries[0]?.data as any)?.collapsed).toBe(false);
		});
	});

	describe("17.3: One-click copy-to-clipboard code snippet action (UX-0121 - UX-0130)", () => {
		it("generates valid ANSI OSC 52 sequence without escape codes", () => {
			const code = "console.log('hello');";
			const osc = osc52Copy(code);
			expect(osc.startsWith("\x1b]52;c;")).toBe(true);
			expect(osc.endsWith("\x07")).toBe(true);

			const base64 = osc.slice(7, -1);
			expect(Buffer.from(base64, "base64").toString("utf-8")).toBe(code);
		});

		it("copySnippetAction cleans text and prepares copy payloads", () => {
			const ansiText = "\x1b[31mconst x = 42;\x1b[0m";
			const action = copySnippetAction(ansiText);
			expect(action.clean).toBe("const x = 42;");
			expect(action.osc52).toContain(Buffer.from("const x = 42;").toString("base64"));
		});

		it("renders formatted code snippet box with language and copy hint", () => {
			const code = "function greet() {\n  return 'hello';\n}";
			const box = renderCodeSnippet(code, "typescript", { showLineNumbers: true, showCopyAction: true });
			expect(box).toBeDefined();
		});

		it("LiveLog.snippet emits kaioken-snippet entry", () => {
			const rec = recordingUi();
			const log = new LiveLog(rec.ui, "symbols", rec.appendEntry);
			log.snippet("export const pi = 3.14;", "typescript");

			expect(rec.entries.length).toBe(1);
			expect(rec.entries[0]?.customType).toBe("kaioken-snippet");
			expect((rec.entries[0]?.data as any)?.code).toBe("export const pi = 3.14;");
			expect((rec.entries[0]?.data as any)?.language).toBe("typescript");
		});
	});

	describe("17.4: Auto-scrolling lock-to-bottom toggle with wheel pause (UX-0131 - UX-0140)", () => {
		it("initializes locked to bottom and pauses upon wheel up", () => {
			const controller = new AutoScrollController(true);
			controller.updateBounds(100, 100);
			expect(controller.getState().isLocked).toBe(true);
			expect(controller.getState().pausedByWheel).toBe(false);

			// User scrolls up with mouse wheel (negative delta)
			controller.onWheel(-10);
			expect(controller.getState().isLocked).toBe(false);
			expect(controller.getState().pausedByWheel).toBe(true);
			expect(controller.renderStatus()).toContain("paused");
		});

		it("resumes follow when user scrolls back to bottom or calls resume", () => {
			const controller = new AutoScrollController(true);
			controller.updateBounds(100, 100);
			controller.onWheel(-20);
			expect(controller.getState().isLocked).toBe(false);

			// Scroll down back to maximum
			controller.onWheel(+20);
			expect(controller.getState().isLocked).toBe(true);
			expect(controller.getState().pausedByWheel).toBe(false);
			expect(controller.renderStatus()).toContain("active");

			// Test explicit pause & resume
			controller.onUserScrollUp();
			expect(controller.getState().isLocked).toBe(false);
			controller.resume();
			expect(controller.getState().isLocked).toBe(true);
		});

		it("toggles lock state and renders widget", () => {
			const controller = new AutoScrollController(true);
			const state1 = controller.toggleLock();
			expect(state1).toBe(false);
			const state2 = controller.toggleLock();
			expect(state2).toBe(true);

			const widget = controller.renderWidget();
			expect(widget).toBeDefined();
		});
	});

	describe("17.5: Interactive milestone breadcrumb trails (UX-0141 - UX-0150)", () => {
		it("initializes default pipeline stages and advances through completion", () => {
			const trail = new MilestoneTrail();
			const milestones = trail.getMilestones();
			expect(milestones).toHaveLength(6);
			expect(milestones[0]?.status).toBe("active");
			expect(milestones[1]?.status).toBe("pending");

			trail.advance("scan");
			expect(milestones[0]?.status).toBe("completed");
			expect(milestones[1]?.status).toBe("active");

			trail.fail("symbols", "Typecheck failed");
			expect(milestones[1]?.status).toBe("failed");
			expect(milestones[1]?.detail).toBe("Typecheck failed");
		});

		it("formats breadcrumbs text with icons and connective arrows", () => {
			const trail = new MilestoneTrail();
			trail.advance("scan");
			const textUnicode = formatBreadcrumbsText(trail.getMilestones(), { unicode: true });
			expect(textUnicode).toContain("✓");
			expect(textUnicode).toContain("●");
			expect(textUnicode).toContain("○");
			expect(textUnicode).toContain("➜");

			const textAscii = formatBreadcrumbsText(trail.getMilestones(), { unicode: false });
			expect(textAscii).toContain("[OK]");
			expect(textAscii).toContain("->");
		});

		it("renders TUI Box for breadcrumbs and LiveLog.breadcrumbs emits entry", () => {
			const trail = new MilestoneTrail();
			const box = renderBreadcrumbs(trail.getMilestones());
			expect(box).toBeDefined();

			const rec = recordingUi();
			const log = new LiveLog(rec.ui, "pipeline", rec.appendEntry);
			log.breadcrumbs(trail);

			expect(rec.entries.length).toBe(1);
			expect(rec.entries[0]?.customType).toBe("kaioken-breadcrumbs");
			expect((rec.entries[0]?.data as any)?.milestones).toHaveLength(6);
		});
	});

	describe("Pi Custom Entry Renderers for Step 17", () => {
		it("registers and executes all custom entry renderers via fake Pi harness", () => {
			const fake = createFakePi();
			registerProgressRenderer(fake.pi);

			expect(fake.entryRenderers.has("kaioken-progress")).toBe(true);
			expect(fake.entryRenderers.has("kaioken-diff")).toBe(true);
			expect(fake.entryRenderers.has("kaioken-snippet")).toBe(true);
			expect(fake.entryRenderers.has("kaioken-breadcrumbs")).toBe(true);

			const progressRenderer = fake.entryRenderers.get("kaioken-progress");
			const diffRenderer = fake.entryRenderers.get("kaioken-diff");
			const snippetRenderer = fake.entryRenderers.get("kaioken-snippet");
			const breadcrumbsRenderer = fake.entryRenderers.get("kaioken-breadcrumbs");

			// Test kaioken-progress with progressState
			const r1 = progressRenderer(
				{ data: { progressState: { scope: "test", title: "Test", phase: "P1", status: "running" } } },
				{ expanded: true },
				undefined,
			);
			expect(r1).toBeDefined();

			// Test kaioken-diff
			const r2 = diffRenderer(
				{ data: { diffText: "diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n" } },
				{ expanded: true },
				undefined,
			);
			expect(r2).toBeDefined();

			// Test kaioken-snippet
			const r3 = snippetRenderer(
				{ data: { code: "const x = 1;", language: "typescript" } },
				{ expanded: false },
				undefined,
			);
			expect(r3).toBeDefined();

			// Test kaioken-breadcrumbs
			const r4 = breadcrumbsRenderer(
				{ data: { milestones: [{ id: "m1", label: "M1", status: "active" }] } },
				{ expanded: false },
				undefined,
			);
			expect(r4).toBeDefined();
		});
	});
});


