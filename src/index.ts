import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { CLAUDE_CARD_TYPE, registerClaudeCommand } from "./commands.ts";
import { claudeProvider } from "./provider.ts";
import { renderClaudeCard } from "./ui.ts";

export default function claudeExtension(pi: ExtensionAPI): void {
  pi.registerProvider(claudeProvider());

  pi.registerEntryRenderer(CLAUDE_CARD_TYPE, renderClaudeCard);

  registerClaudeCommand(pi);
}
