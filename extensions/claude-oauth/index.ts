import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { CLAUDE_CARD_TYPE, registerClaudeCommand } from "./commands";
import { claudeProvider } from "./provider";
import { renderClaudeCard } from "./ui";

export default function claudeExtension(pi: ExtensionAPI): void {
  pi.registerProvider(claudeProvider());

  pi.registerEntryRenderer(CLAUDE_CARD_TYPE, renderClaudeCard);

  registerClaudeCommand(pi);
}
