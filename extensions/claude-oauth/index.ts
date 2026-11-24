import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CLAUDE_CARD_TYPE, registerClaudeCommand, type CardData } from "./commands";
import { claudeProvider } from "./provider";
import { renderClaudeCard } from "./ui";

export default function claudeExtension(pi: ExtensionAPI): void {
  pi.registerProvider(claudeProvider());

  pi.registerEntryRenderer<CardData>(CLAUDE_CARD_TYPE, (entry, _options, theme) =>
    renderClaudeCard(entry.data, theme),
  );

  registerClaudeCommand(pi);
}
