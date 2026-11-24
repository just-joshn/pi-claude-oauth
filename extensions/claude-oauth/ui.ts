import { Box, Text } from "@earendil-works/pi-tui";
import type { CardData, CardTone } from "./commands";

export interface CardTheme {
  bold(text: string): string;
  fg(color: CardTone, text: string): string;
  bg(color: "customMessageBg", text: string): string;
}

export function renderClaudeCard(data: CardData | undefined, theme: CardTheme): Box {
  const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));

  if (!data) {
    box.addChild(new Text(theme.fg("dim", "Claude status unavailable"), 0, 0));
    return box;
  }

  box.addChild(new Text(theme.bold(data.title), 0, 0));
  for (const line of data.lines) {
    box.addChild(new Text(line.tone ? theme.fg(line.tone, line.text) : line.text, 0, 0));
  }
  return box;
}
