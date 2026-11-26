import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		environment: "node",
		globals: false,
		pool: "forks",
		maxWorkers: "50%",
		isolate: true,
		clearMocks: true,
		restoreMocks: true,
		unstubEnvs: true,
		unstubGlobals: true,
		allowOnly: false,
		passWithNoTests: false,
		retry: 0,
		testTimeout: 10_000,
		hookTimeout: 10_000,
		teardownTimeout: 10_000,
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			reporter: ["text", "json-summary", "lcov"],
			reportsDirectory: "./coverage",
			clean: true,
			reportOnFailure: true,
			thresholds: {
				perFile: true,
				lines: 85,
				branches: 80,
				functions: 90,
				statements: 85,
			},
		},
	},
});
