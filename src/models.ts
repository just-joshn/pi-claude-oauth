import type { Model } from "@earendil-works/pi-ai";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";

export const CLAUDE_PROVIDER_ID = "claude";
export const CLAUDE_PROVIDER_NAME = "Claude (Pro/Max/Ultra)";

function withClaudeProvider<T extends { provider: string }>(entry: T) {
  return { ...entry, provider: CLAUDE_PROVIDER_ID };
}

/** Reuses Pi's Anthropic catalog so limits and compatibility flags track Pi releases. */
export function claudeModels(): Model<"anthropic-messages">[] {
  return getBuiltinModels("anthropic").map((model) => {
    const copy = withClaudeProvider(model);
    const fallbacks = model.compat?.allowedFallbackModels;
    if (fallbacks) {
      // Pi prices a fallback by matching its provider against the model's.
      copy.compat = { ...model.compat, allowedFallbackModels: fallbacks.map(withClaudeProvider) };
    }
    return copy;
  });
}
