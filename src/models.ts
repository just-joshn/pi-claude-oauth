import type { Model } from "@earendil-works/pi-ai";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";

export const CLAUDE_PROVIDER_ID = "claude";
export const CLAUDE_PROVIDER_NAME = "Claude (Pro/Max/Ultra)";
const PI_ANTHROPIC_DEFAULT_MODEL_ID = "claude-opus-5-5";

function withClaudeProvider<T extends { provider: string }>(entry: T) {
  return { ...entry, provider: CLAUDE_PROVIDER_ID };
}

export function claudeModels(): Model<"anthropic-messages">[] {
  const models = getBuiltinModels("anthropic").map((model) => {
    const copy = withClaudeProvider(model);
    const fallbacks = model.compat?.allowedFallbackModels;
    if (fallbacks) {
      // Pi prices a fallback by matching its provider against the model's.
      copy.compat = { ...model.compat, allowedFallbackModels: fallbacks.map(withClaudeProvider) };
    }
    return copy;
  });
  const isDefault = (model: { id: string }) => model.id === PI_ANTHROPIC_DEFAULT_MODEL_ID;
  return [...models.filter(isDefault), ...models.filter((model) => !isDefault(model))];
}
