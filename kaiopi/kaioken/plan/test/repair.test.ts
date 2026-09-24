import { describe, expect, it } from "vitest";
import {
	extractRepairJson,
	parseSelfRepairJson,
	repairJson,
} from "../src/repair.ts";

describe("plan: repairJson self-repair JSON parser (UX-1211 - UX-1220)", () => {
	it("strips markdown fences and prose preamble", () => {
		const raw = `Here is the module decomposition plan:
\`\`\`json
{
  "modules": [
    { "id": "auth", "name": "Auth", "purpose": "User auth", "files": ["src/auth.ts"] }
  ]
}
\`\`\`
Hope this helps!`;
		const { repaired, fixes } = repairJson(raw);
		expect(fixes).toContain("stripped_markdown_fence");
		const parsed = JSON.parse(repaired);
		expect(parsed.modules[0].id).toBe("auth");
	});

	it("strips single-line and block comments", () => {
		const raw = `{
  // Module definition
  "modules": [
    /* Primary core */
    { "id": "core", "name": "Core", "purpose": "Kernel logic", "files": ["src/core.ts"] }
  ]
}`;
		const { repaired, fixes } = repairJson(raw);
		expect(fixes).toContain("stripped_line_comment");
		expect(fixes).toContain("stripped_block_comment");
		const parsed = JSON.parse(repaired);
		expect(parsed.modules[0].id).toBe("core");
	});

	it("removes trailing commas in objects and arrays", () => {
		const raw = `{
  "modules": [
    {
      "id": "db",
      "name": "Database",
      "purpose": "ORM and models",
      "files": ["src/db.ts",],
    },
  ],
}`;
		const { repaired, fixes } = repairJson(raw);
		expect(fixes).toContain("stripped_trailing_comma");
		const parsed = JSON.parse(repaired);
		expect(parsed.modules[0].files).toEqual(["src/db.ts"]);
	});

	it("quotes unquoted object keys and converts single-quoted values", () => {
		const raw = `{
  modules: [
    { id: 'api', name: 'API Routes', purpose: 'Backend endpoints', files: ['src/routes.ts'] }
  ]
}`;
		const { repaired, fixes } = repairJson(raw);
		expect(fixes).toContain("quoted_unquoted_key");
		expect(fixes).toContain("converted_single_quotes");
		const parsed = JSON.parse(repaired);
		expect(parsed.modules[0].id).toBe("api");
		expect(parsed.modules[0].files).toEqual(["src/routes.ts"]);
	});

	it("normalizes Python literals True, False, None", () => {
		const raw = `{
  "ok": True,
  "disabled": False,
  "parent": None
}`;
		const { repaired, fixes } = repairJson(raw);
		expect(fixes).toContain("normalized_python_true");
		expect(fixes).toContain("normalized_python_false");
		expect(fixes).toContain("normalized_python_none");
		const parsed = JSON.parse(repaired);
		expect(parsed).toEqual({ ok: true, disabled: false, parent: null });
	});

	it("auto-closes truncated completions where token budget cut off the stream", () => {
		const truncated = `{"modules": [{"id": "auth", "name": "Auth", "purpose": "User authentication and session security", "files": ["src/auth.ts"]`;
		const res = parseSelfRepairJson<{ modules: Array<{ id: string }> }>(truncated);
		expect(res.data).not.toBeNull();
		expect(res.data?.modules[0]?.id).toBe("auth");
		expect(res.fixes).toContain("closed_unclosed_bracket");
		expect(res.fixes).toContain("closed_unclosed_brace");
	});

	it("recovers completed array items when stream cut off with corrupted trailing token", () => {
		const truncatedMidObject = `{"modules": [
			{"id": "auth", "name": "Auth", "purpose": "Authentication", "files": ["src/auth.ts"]},
			<unclosed token and random gibberish`;
		const res = parseSelfRepairJson<{ modules: Array<{ id: string }> }>(truncatedMidObject);
		expect(res.data).not.toBeNull();
		expect(res.data?.modules).toHaveLength(1);
		expect(res.data?.modules[0]?.id).toBe("auth");
	});

	it("throws on completely unparseable input with extractRepairJson", () => {
		expect(() => extractRepairJson("No code or JSON here at all.")).toThrow(
			/model reply contained no parseable or repairable JSON/,
		);
	});
});
