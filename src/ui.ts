import type { CustomEntry, EntryRenderOptions } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";

import { type CardTone, isRenderableCard } from "./commands.ts";

export interface CardTheme {
	bold(text: string): string;
	fg(color: CardTone, text: string): string;
	bg(color: "customMessageBg", text: string): string;
}

export function renderClaudeCard(
	{ data }: Pick<CustomEntry, "data">,
	_options: EntryRenderOptions,
	theme: CardTheme,
): Box {
	const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));

	if (!isRenderableCard(data)) {
		box.addChild(new Text(theme.fg("dim", "Claude status unavailable"), 0, 0));
		return box;
	}

	box.addChild(new Text(theme.bold(data.title), 0, 0));
	for (const line of data.lines) {
		box.addChild(new Text(line.tone ? theme.fg(line.tone, line.text) : line.text, 0, 0));
	}
	return box;
}
