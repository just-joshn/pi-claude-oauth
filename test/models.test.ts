import { describe, expect, it } from "vitest";
import { claudeModels, CLAUDE_PROVIDER_ID } from "../extensions/claude-oauth/models";

describe("claudeModels", () => {
  it("copies the Anthropic catalog so limits and thinking support stay current", () => {
    const models = claudeModels();
    expect(models.length).toBeGreaterThan(10);
    expect(models.some((model) => model.id === "claude-opus-5-5")).toBe(true);
  });

  it("stamps the Claude subscription provider id", () => {
    expect(claudeModels().every((model) => model.provider === CLAUDE_PROVIDER_ID)).toBe(true);
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

  it("supports an alternate provider id for tests and forks", () => {
    expect(claudeModels("claude-copy").every((model) => model.provider === "claude-copy")).toBe(true);
  });
});
