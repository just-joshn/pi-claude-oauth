import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { CLAUDE_CODE_OAUTH_TOKEN_ENV } from "./credential.ts";
import { CLAUDE_PROVIDER_ID, CLAUDE_PROVIDER_NAME } from "./models.ts";
import { isRecord } from "./oauth.ts";
import { terminalText } from "./terminal-text.ts";
import { fetchUsage, formatUsage, type UsageReport } from "./usage.ts";

export const CLAUDE_CARD_TYPE = "claude-card";

export interface CommandContext {
	readonly hasUI: ExtensionCommandContext["hasUI"];
	readonly model: ExtensionCommandContext["model"];
	readonly modelRegistry: Pick<
		ExtensionCommandContext["modelRegistry"],
		"getProviderAuthStatus" | "getAll" | "getProviderAuth"
	>;
	readonly ui: Pick<ExtensionCommandContext["ui"], "notify" | "setStatus">;
}

type PiCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
interface CommandOptions extends Omit<PiCommand, "handler"> {
	handler(args: string, ctx: CommandContext): Promise<void>;
}

export interface CommandHost {
	registerCommand(name: string, options: CommandOptions): void;
	appendEntry(customType: string, data: CardData): void;
}

const SUBCOMMANDS = {
	status: "Show sign-in status and available models",
	usage: "Show subscription usage windows",
	login: "How to sign in",
	logout: "How to remove the saved sign-in",
};

const CARD_TONES = ["accent", "success", "warning", "error", "dim", "muted"] as const;
export type CardTone = (typeof CARD_TONES)[number];

interface CardLine {
	readonly text: string;
	readonly tone?: CardTone;
}

export interface CardData {
	readonly title: string;
	readonly lines: readonly CardLine[];
	readonly timestamp: number;
}

export function isRenderableCard(value: unknown): value is Pick<CardData, "title" | "lines"> {
	return (
		isRecord(value) &&
		typeof value.title === "string" &&
		Array.isArray(value.lines) &&
		value.lines.every(
			(line: unknown) =>
				isRecord(line) &&
				typeof line.text === "string" &&
				(line.tone === undefined || CARD_TONES.some((tone) => tone === line.tone)),
		)
	);
}

interface StatusInput {
	readonly configured: boolean;
	readonly source?: AuthSource | undefined;
	readonly envToken: boolean;
	readonly modelCount: number;
	readonly activeModel?: string | undefined;
}

type AuthSource = NonNullable<ReturnType<CommandContext["modelRegistry"]["getProviderAuthStatus"]>["source"]>;

const SOURCE_LABELS: Readonly<Record<AuthSource, string>> = {
	stored: "saved credential",
	environment: "environment token",
	runtime: "runtime key",
	fallback: "extension key",
	models_json_key: "models.json key",
	models_json_command: "models.json command",
};

export function statusCard(input: StatusInput, now = Date.now()): CardData {
	const source = input.source ? SOURCE_LABELS[input.source] : undefined;
	const lines: CardLine[] = [
		{
			text: input.configured ? `Signed in via ${source ?? "Claude OAuth"}` : "Not signed in",
			tone: input.configured ? "success" : "warning",
		},
		{ text: `${input.modelCount} ${CLAUDE_PROVIDER_NAME} models in the catalog`, tone: "muted" },
	];

	if (input.activeModel) lines.push({ text: `Active model: ${input.activeModel}`, tone: "accent" });
	if (!input.configured) {
		lines.push({
			text: input.envToken
				? `${CLAUDE_CODE_OAUTH_TOKEN_ENV} is set but Pi could not use it`
				: `Run /login ${CLAUDE_PROVIDER_ID} to sign in with a Claude subscription`,
			tone: "dim",
		});
	}

	return { title: CLAUDE_PROVIDER_NAME, lines, timestamp: now };
}

export function usageCard(report: UsageReport, now = Date.now()): CardData {
	return {
		title: `${CLAUDE_PROVIDER_NAME} usage`,
		lines: formatUsage(report).map((text) => ({ text, tone: "muted" as const })),
		timestamp: now,
	};
}

function describeError(error: unknown): string {
	let text = "";
	let current: unknown = error;
	do {
		const message = terminalText(current instanceof Error ? current.message : String(current));
		if (!text.includes(message)) {
			text = text ? `${text}: ${message}` : message;
		}
		current = current instanceof Error ? current.cause : undefined;
	} while (current !== undefined);
	return text;
}

function showStatus(pi: CommandHost, ctx: CommandContext): void {
	const status = ctx.modelRegistry.getProviderAuthStatus(CLAUDE_PROVIDER_ID);
	pi.appendEntry(
		CLAUDE_CARD_TYPE,
		statusCard({
			configured: status.configured,
			source: status.source,
			envToken: Boolean(process.env[CLAUDE_CODE_OAUTH_TOKEN_ENV]),
			modelCount: ctx.modelRegistry.getAll().filter((model) => model.provider === CLAUDE_PROVIDER_ID).length,
			activeModel: ctx.model?.provider === CLAUDE_PROVIDER_ID ? ctx.model.id : undefined,
		}),
	);
}

async function showUsage(
	pi: CommandHost,
	registry: CommandContext["modelRegistry"],
	ui: CommandContext["ui"] | undefined,
): Promise<void> {
	ui?.setStatus("claude-usage", "Fetching Claude usage...");
	try {
		// `getApiKeyForProvider` swallows refresh errors and would report "not signed in".
		const accessToken = (await registry.getProviderAuth(CLAUDE_PROVIDER_ID))?.auth.apiKey;
		if (!accessToken) {
			const message = `No Claude sign-in found. Run /login ${CLAUDE_PROVIDER_ID} first.`;
			if (!ui) throw new Error(message);
			ui.notify(message, "warning");
			return;
		}
		pi.appendEntry(CLAUDE_CARD_TYPE, usageCard(await fetchUsage(accessToken)));
	} catch (error) {
		const message = describeError(error);
		if (!ui) throw new Error(message, { cause: error });
		ui.notify(message, "error");
	} finally {
		ui?.setStatus("claude-usage", undefined);
	}
}

export function registerClaudeCommand(pi: CommandHost): void {
	pi.registerCommand("claude", {
		description: "Claude subscription sign-in status and usage",
		getArgumentCompletions: (prefix) => {
			const matches = Object.entries(SUBCOMMANDS)
				.filter(([value]) => value.startsWith(prefix))
				.map(([value, description]) => ({ value, label: value, description }));
			return matches.length > 0 ? matches : null;
		},
		handler: async (args, ctx) => {
			const [first] = args.trim().split(/\s+/);
			const subcommand = first || "status";
			const ui = ctx.hasUI ? ctx.ui : undefined;

			switch (subcommand) {
				case "status":
					showStatus(pi, ctx);
					return;
				case "usage":
					await showUsage(pi, ctx.modelRegistry, ui);
					return;
				case "login":
					ui?.notify(`Run /login ${CLAUDE_PROVIDER_ID}, then choose a Claude sign-in method.`, "info");
					return;
				case "logout":
					ui?.notify(`Run /logout, then choose ${CLAUDE_PROVIDER_NAME}.`, "info");
					return;
				default: {
					const message = `Unknown /claude subcommand "${terminalText(subcommand)}". Use status, usage, login, or logout.`;
					if (!ui) throw new Error(message);
					ui.notify(message, "error");
				}
			}
		},
	});
}
