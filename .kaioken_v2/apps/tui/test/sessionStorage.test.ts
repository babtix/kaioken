import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	generateSessionId,
	deriveTitle,
	saveSession,
	loadSession,
	listSessions,
	deleteSession,
	sessionPath,
	type SavedSession,
} from "../src/sessionStorage.js";

describe("sessionStorage", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = join(tmpdir(), `kaioken-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await fs.mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch {}
	});

	it("generates time-ordered session IDs", () => {
		const id1 = generateSessionId();
		const id2 = generateSessionId();
		expect(id1).toMatch(/^\d{8}-\d{6}-\d{4}$/);
		expect(id2).toMatch(/^\d{8}-\d{6}-\d{4}$/);
	});

	it("derives clean titles from conversation messages", () => {
		expect(deriveTitle([])).toBe("New conversation");
		expect(
			deriveTitle([
				{ role: "assistant", content: "hi" },
				{ role: "user", content: "How do I configure Vite?" },
			]),
		).toBe("How do I configure Vite?");

		expect(
			deriveTitle([
				{
					role: "user",
					content: [{ type: "text", text: "Multi-part content test prompt" }],
				},
			]),
		).toBe("Multi-part content test prompt");
	});

	it("saves and loads sessions by exact ID and prefix", async () => {
		const id = "20260831-120000-1111";
		const session: SavedSession = {
			id,
			title: "Test session",
			created: "2026-08-31T12:00:00.000Z",
			updated: "2026-08-31T12:05:00.000Z",
			model: "openrouter/z-ai/glm-5.3-flash",
			provider: "openrouter",
			mode: "build",
			thinking: "off",
			turns: 2,
			messages: [{ role: "user", content: "test" }],
			transcript: ["› test", "reply"],
		};

		await saveSession(testDir, session);

		// Exact ID load
		const loadedExact = await loadSession(testDir, id);
		expect(loadedExact).not.toBeNull();
		expect(loadedExact?.id).toBe(id);
		expect(loadedExact?.title).toBe("Test session");
		expect(loadedExact?.transcript).toEqual(["› test", "reply"]);

		// Prefix load
		const loadedPrefix = await loadSession(testDir, "20260831-12");
		expect(loadedPrefix).not.toBeNull();
		expect(loadedPrefix?.id).toBe(id);

		// Non-existent load
		const loadedNone = await loadSession(testDir, "nonexistent");
		expect(loadedNone).toBeNull();
	});

	it("lists sessions ordered newest first", async () => {
		const s1: SavedSession = {
			id: "20260831-100000-0001",
			title: "Older session",
			created: "2026-08-31T10:00:00.000Z",
			updated: "2026-08-31T10:00:00.000Z",
			model: "openrouter/m1",
			provider: "openrouter",
			mode: "build",
			thinking: "off",
			turns: 1,
			messages: [],
		};
		const s2: SavedSession = {
			id: "20260831-110000-0002",
			title: "Newer session",
			created: "2026-08-31T11:00:00.000Z",
			updated: "2026-08-31T11:00:00.000Z",
			model: "openrouter/m2",
			provider: "openrouter",
			mode: "plan",
			thinking: "high",
			turns: 3,
			messages: [],
		};

		await saveSession(testDir, s1);
		await saveSession(testDir, s2);

		const list = await listSessions(testDir);
		expect(list).toHaveLength(2);
		expect(list[0]?.id).toBe(s2.id);
		expect(list[1]?.id).toBe(s1.id);
	});

	it("deletes a saved session", async () => {
		const id = "20260831-150000-9999";
		const session: SavedSession = {
			id,
			title: "To delete",
			created: new Date().toISOString(),
			updated: new Date().toISOString(),
			model: "m",
			provider: "p",
			mode: "build",
			thinking: "off",
			turns: 0,
			messages: [],
		};

		await saveSession(testDir, session);
		expect(await loadSession(testDir, id)).not.toBeNull();

		const deleted = await deleteSession(testDir, id);
		expect(deleted).toBe(true);
		expect(await loadSession(testDir, id)).toBeNull();
	});
});
