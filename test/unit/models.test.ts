import { describe, expect, it } from "vitest";

import { CLAUDE_PROVIDER_ID, claudeModels } from "../../src/models.ts";

describe("claudeModels", () => {
	it("copies the Anthropic catalog so limits and thinking support stay current", () => {
		const models = claudeModels();
		expect(models.length).toBeGreaterThan(10);
		expect(models.some((model) => model.id === "claude-opus-5-5")).toBe(true);
	});

	it("lists the model Pi defaults to for Anthropic first, so a fresh Pi starts on it", () => {
		expect(claudeModels()[0]?.id).toBe("claude-opus-5-5");
	});

	it("stamps the Claude subscription provider id", () => {
		expect(claudeModels().every((model) => model.provider === CLAUDE_PROVIDER_ID)).toBe(true);
	});

	it("re-keys fallback models so Pi prices a fallback response under this provider", () => {
		const fallbacks = claudeModels().flatMap((model) => model.compat?.allowedFallbackModels ?? []);
		expect(fallbacks.length).toBeGreaterThan(0);
		expect(new Set(fallbacks.map((fallback) => fallback.provider))).toEqual(new Set([CLAUDE_PROVIDER_ID]));
	});

	it("keeps the fields Pi needs to stream and price a request", () => {
		for (const model of claudeModels()) {
			expect(model.id.length).toBeGreaterThan(0);
			expect(model.name.length).toBeGreaterThan(0);
			expect(model.api).toBe("anthropic-messages");
			expect(model.contextWindow).toBeGreaterThan(0);
			expect(model.maxTokens).toBeGreaterThan(0);
			expect(model.input.length).toBeGreaterThan(0);
			expect(model.cost.input).toBeGreaterThanOrEqual(0);
		}
	});
});
