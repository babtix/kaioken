import { describe, expect, it } from "vitest";
import {
	createExtensionPort,
	wrapExtensionTool,
	type ExtensionInstance,
	type ExtensionToolDefinition,
} from "../dist/index.js";

describe("wrapExtensionTool & ExtensionPort", () => {
	const mockToolDef: ExtensionToolDefinition = {
		name: "query_database",
		description: "Query a database",
		inputSchema: {
			type: "object",
			properties: { query: { type: "string" } },
			required: ["query"],
		},
		execute: async (args) => ({
			text: `result for: ${args["query"]}`,
			details: { ok: true },
		}),
	};

	it("wraps an extension tool with original name when no collision", () => {
		const existingNames = new Set(["read", "edit", "bash"]);
		const wrapped = wrapExtensionTool("sql-plugin", mockToolDef, existingNames);

		expect(wrapped.name).toBe("query_database");
		expect(wrapped.label).toBe("sql-plugin: query_database");
		expect(wrapped.description).toBe("Query a database");
		expect(existingNames.has("query_database")).toBe(true);
	});

	it("resolves collisions by prefixing with mcp_<extId>_<toolName>", () => {
		const existingNames = new Set(["query_database"]);
		const wrapped = wrapExtensionTool("sql-plugin", mockToolDef, existingNames);

		// Must prefix with mcp_<extId>_<toolName>
		expect(wrapped.name).toBe("mcp_sql_plugin_query_database");
		expect(existingNames.has("mcp_sql_plugin_query_database")).toBe(true);
	});

	it("resolves multi-collision by appending underscore", () => {
		const existingNames = new Set([
			"query_database",
			"mcp_sql_plugin_query_database",
		]);
		const wrapped = wrapExtensionTool("sql-plugin", mockToolDef, existingNames);

		expect(wrapped.name).toBe("mcp_sql_plugin_query_database_");
		expect(existingNames.has("mcp_sql_plugin_query_database_")).toBe(true);
	});

	it("executes the underlying tool implementation correctly", async () => {
		const existingNames = new Set<string>();
		const wrapped = wrapExtensionTool("test-ext", mockToolDef, existingNames);

		const result = await wrapped.run({ query: "SELECT 1" });
		expect(result.text).toBe("result for: SELECT 1");
		expect(result.details).toEqual({ ok: true });
	});

	it("createExtensionPort returns tools ONLY from trusted extensions and handles collisions", async () => {
		const trustedExt: ExtensionInstance = {
			id: "postgres",
			manifest: { name: "postgres", version: "1.0.0", trusted: true },
			trusted: true,
			tools: [
				{
					name: "query",
					description: "Postgres query",
					inputSchema: { type: "object" },
					execute: async () => ({ text: "pg results" }),
				},
			],
		};

		const untrustedExt: ExtensionInstance = {
			id: "malicious",
			manifest: { name: "malicious", version: "1.0.0", trusted: false },
			trusted: false,
			tools: [
				{
					name: "steal_data",
					description: "Steal data",
					inputSchema: { type: "object" },
					execute: async () => ({ text: "stolen" }),
				},
			],
		};

		// Fake runner with both trusted and untrusted
		const fakeRunner = {
			start: async () => {},
			stop: async () => {},
			emit: async () => {},
			getActiveExtensions: () => [trustedExt, untrustedExt],
			getTrustedTools: () => [{ extId: trustedExt.id, tool: trustedExt.tools[0] }],
		};

		// Existing tools have "query"
		const existingToolNames = new Set(["query"]);
		const port = createExtensionPort(fakeRunner as any, { existingToolNames });

		const tools = await port.discoverTools();

		// MUST only have 1 tool (trusted), untrusted tool "steal_data" MUST NOT exist
		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("mcp_postgres_query"); // collision resolved!
		const out = await tools[0].run({});
		expect(out.text).toBe("pg results");
	});
});
