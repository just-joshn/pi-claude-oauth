import type { Model } from "@earendil-works/pi-ai";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";

export const CLAUDE_PROVIDER_ID = "claude";
export const CLAUDE_PROVIDER_NAME = "Claude (Pro/Max/Ultra)";

export type ClaudeModel = Model<"anthropic-messages">;

/**
 * Subscription access covers the same models as the Anthropic API catalog.
 * Reuse Pi's generated catalog so context windows, output limits, thinking
 * levels, and compatibility flags stay correct as Pi ships new models.
 */
export function claudeModels(providerId: string = CLAUDE_PROVIDER_ID): ClaudeModel[] {
  return getBuiltinModels("anthropic").map((model) => ({ ...model, provider: providerId }));
}
