import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { CLAUDE_CODE_OAUTH_TOKEN_ENV } from "./provider";
import { CLAUDE_PROVIDER_ID, CLAUDE_PROVIDER_NAME } from "./models";
import { fetchUsage, formatUsage, type UsageReport } from "./usage";

export const CLAUDE_CARD_TYPE = "claude-card";

const SUBCOMMANDS = [
  { value: "status", label: "status", description: "Show sign-in status and available models" },
  { value: "usage", label: "usage", description: "Show subscription usage windows" },
  { value: "login", label: "login", description: "How to sign in" },
  { value: "logout", label: "logout", description: "How to remove the saved sign-in" },
] as const;

export type CardTone = "accent" | "success" | "warning" | "error" | "dim" | "muted";

export interface CardLine {
  readonly text: string;
  readonly tone?: CardTone;
}

export interface CardData {
  readonly title: string;
  readonly lines: readonly CardLine[];
  readonly timestamp: number;
}

export interface StatusInput {
  readonly configured: boolean;
  readonly source?: string;
  readonly envToken: boolean;
  readonly modelCount: number;
  readonly activeModel?: string;
}

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  stored: "saved credential",
  environment: "environment token",
  runtime: "runtime key",
};

export function statusCard(input: StatusInput, now = Date.now()): CardData {
  const source = input.source ? (SOURCE_LABELS[input.source] ?? input.source) : undefined;
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

async function showStatus(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  const status = ctx.modelRegistry.getProviderAuthStatus(CLAUDE_PROVIDER_ID);
  pi.appendEntry<CardData>(
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

async function showUsage(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  const accessToken = await ctx.modelRegistry.getApiKeyForProvider(CLAUDE_PROVIDER_ID);
  if (!accessToken) {
    ctx.ui.notify(`No Claude sign-in found. Run /login ${CLAUDE_PROVIDER_ID} first.`, "warning");
    return;
  }

  ctx.ui.setStatus("claude-usage", "Fetching Claude usage...");
  try {
    const report = await fetchUsage(accessToken, { signal: AbortSignal.timeout(15_000) });
    pi.appendEntry<CardData>(CLAUDE_CARD_TYPE, usageCard(report));
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
  } finally {
    ctx.ui.setStatus("claude-usage", undefined);
  }
}

export function registerClaudeCommand(pi: ExtensionAPI): void {
  pi.registerCommand("claude", {
    description: "Claude subscription sign-in status and usage",
    getArgumentCompletions: (prefix) => {
      const matches = SUBCOMMANDS.filter((command) => command.value.startsWith(prefix));
      return matches.length > 0 ? matches.map((command) => ({ ...command })) : null;
    },
    handler: async (args, ctx) => {
      const [first] = args.trim().split(/\s+/);
      const subcommand = first || "status";

      switch (subcommand) {
        case "status":
          await showStatus(pi, ctx);
          return;
        case "usage":
          await showUsage(pi, ctx);
          return;
        case "login":
          ctx.ui.notify(`Run /login ${CLAUDE_PROVIDER_ID}, then choose a Claude sign-in method.`, "info");
          return;
        case "logout":
          ctx.ui.notify(`Run /logout, then choose ${CLAUDE_PROVIDER_NAME}.`, "info");
          return;
        default:
          ctx.ui.notify(`Unknown /claude subcommand "${subcommand}". Use status, usage, login, or logout.`, "error");
      }
    },
  });
}
