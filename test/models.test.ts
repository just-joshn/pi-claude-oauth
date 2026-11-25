import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";

import { CLAUDE_PROVIDER_ID, claudeModels } from "../src/models.ts";

await describe("claudeModels", async () => {
  await it("copies the Anthropic catalog so limits and thinking support stay current", () => {
    const models = claudeModels();
    ok(models.length > 10);
    strictEqual(
      models.some((model) => model.id === "claude-opus-5-5"),
      true,
    );
  });

  await it("stamps the Claude subscription provider id", () => {
    strictEqual(
      claudeModels().every((model) => model.provider === CLAUDE_PROVIDER_ID),
      true,
    );
  });

  await it("re-keys fallback models so Pi prices a fallback response under this provider", () => {
    const fallbacks = claudeModels().flatMap((model) => model.compat?.allowedFallbackModels ?? []);
    ok(fallbacks.length > 0);
    deepStrictEqual(
      new Set(fallbacks.map((fallback) => fallback.provider)),
      new Set([CLAUDE_PROVIDER_ID]),
    );
  });

  await it("keeps the fields Pi needs to stream and price a request", () => {
    for (const model of claudeModels()) {
      ok(model.id.length > 0);
      ok(model.name.length > 0);
      strictEqual(model.api, "anthropic-messages");
      ok(model.contextWindow > 0);
      ok(model.maxTokens > 0);
      ok(model.input.length > 0);
      ok(model.cost.input >= 0);
    }
  });
});
