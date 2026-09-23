import { describe, expect, it } from "vitest";
import { paramsToJsonSchema, type ToolParam } from "../dist/index.js";

describe("paramsToJsonSchema", () => {
	it("converts string params", () => {
		const schema = paramsToJsonSchema({
			name: { type: "string", description: "A name" },
		});
		expect(schema).toEqual({
			type: "object",
			properties: {
				name: { type: "string", description: "A name" },
			},
		});
	});

	it("converts all four param types", () => {
		const params: Record<string, ToolParam> = {
			query: { type: "string", description: "Search query", required: true },
			limit: { type: "number", description: "Max results" },
			exported: { type: "boolean", description: "Exported only" },
			paths: { type: "string[]", description: "File paths" },
		};
		const schema = paramsToJsonSchema(params) as {
			properties: Record<string, { type: unknown }>;
			required: string[];
		};
		expect(schema.properties["query"]).toMatchObject({ type: "string" });
		expect(schema.properties["limit"]).toMatchObject({ type: "number" });
		expect(schema.properties["exported"]).toMatchObject({ type: "boolean" });
		expect(schema.properties["paths"]).toMatchObject({
			type: "array",
			items: { type: "string" },
		});
		expect(schema.required).toEqual(["query"]);
	});

	it("bakes choices into the description", () => {
		const schema = paramsToJsonSchema({
			kind: {
				type: "string",
				description: "Restrict to one tenant.",
				choices: ["wiki", "card", "skill"],
			},
		});
		const props = (schema as { properties: Record<string, { description: string }> }).properties;
		expect(props["kind"]!.description).toContain("wiki, card, skill");
	});

	it("omits required array when nothing is required", () => {
		const schema = paramsToJsonSchema({
			name: { type: "string", description: "A name" },
		});
		expect("required" in schema).toBe(false);
	});
});
