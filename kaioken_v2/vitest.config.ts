import { defineConfig } from "vitest/config";

// Phase 1 is fully deterministic and offline. If a test in this project needs a
// network or an API key, the stage under test is designed wrong.
export default defineConfig({
	test: {
		include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
		environment: "node",
		testTimeout: 20_000,
	},
});
