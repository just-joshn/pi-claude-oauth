import { stripVTControlCharacters } from "node:util";

export function terminalText(text: string): string {
	return stripVTControlCharacters(text).replace(/\p{Cc}/gu, "");
}
