import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
		globals: true,
		restoreMocks: true,
		setupFiles: ["./tests/setup-env.ts", "./tests/setup-mocks.ts"],
	},
})