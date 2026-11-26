import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import type { ProviderAuthInteraction } from "@earendil-works/pi-ai";

import { login } from "../src/login.ts";
import { CLAUDE_TOKEN_URL } from "../src/oauth.ts";

const WARMUP_LOGINS = 50;
const SAMPLE_LOGINS = 500;
const ACCESS = "synthetic-access";
const REFRESH = "synthetic-refresh";

const scenarios = [
	{ name: "copy code", pastes: ["fixture-code"] },
	{ name: "invalid paste retries", pastes: ["wrong-code#other-state", "/callback?scope=user", "fixture-code"] },
];

for (const scenario of scenarios) {
	const samples: number[] = [];
	for (let iteration = 0; iteration < WARMUP_LOGINS + SAMPLE_LOGINS; iteration++) {
		let prompts = 0;
		let exchanges = 0;
		let attemptedCallback = false;
		const interaction: ProviderAuthInteraction = {
			signal: new AbortController().signal,
			notify: () => {},
			prompt: async (prompt) => {
				prompts++;
				if (prompt.type === "select") return "copy_code";
				assert.equal(prompt.type, "manual_code");
				const paste = scenario.pastes[prompts - 2];
				assert.ok(paste !== undefined, "Unexpected extra prompt");
				return paste;
			},
		};
		const started = performance.now();
		const credential = await login(interaction, {
			startServer: async () => {
				attemptedCallback = true;
				throw new Error("The benchmark does not open a callback server");
			},
			fetch: async (url, init) => {
				exchanges++;
				assert.equal(url, CLAUDE_TOKEN_URL);
				assert.ok(typeof init.body === "string");
				const grant: unknown = JSON.parse(init.body);
				assert.ok(grant && typeof grant === "object" && "code" in grant);
				assert.equal(grant.code, "fixture-code");
				return Response.json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 });
			},
		});
		const elapsedMs = performance.now() - started;
		assert.equal(attemptedCallback, false);
		assert.equal(prompts, scenario.pastes.length + 1);
		assert.equal(exchanges, 1);
		assert.equal(credential.type, "oauth");
		assert.equal(credential.access, ACCESS);
		assert.equal(credential.refresh, REFRESH);
		if (iteration >= WARMUP_LOGINS) samples.push(elapsedMs);
	}
	samples.sort((a, b) => a - b);
	const percentiles = [50, 95, 99].map((percentile) => {
		const ms = samples[Math.ceil((samples.length * percentile) / 100) - 1];
		assert.ok(ms !== undefined);
		return `p${percentile} ${ms.toFixed(3)} ms/login`;
	});
	process.stdout.write(
		`${scenario.name}: ${SAMPLE_LOGINS} logins, ${WARMUP_LOGINS} warmups; ${percentiles.join(", ")}\n`,
	);
}
