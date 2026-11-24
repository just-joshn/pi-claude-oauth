import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLAUDE_CARD_TYPE,
  registerClaudeCommand,
  statusCard,
  usageCard,
  type CardData,
} from "../extensions/claude-oauth/commands";
import { parseUsage } from "../extensions/claude-oauth/usage";

interface Harness {
  readonly pi: ExtensionAPI;
  readonly cards: CardData[];
  readonly notifications: Array<{ message: string; level: string }>;
  readonly command: {
    handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
    getArgumentCompletions?: (prefix: string) => unknown;
  };
}

interface CtxOverrides {
  readonly configured?: boolean;
  readonly source?: string;
  readonly accessToken?: string | undefined;
  readonly model?: { provider: string; id: string };
  readonly models?: Array<{ provider: string }>;
}

function harness(): Harness {
  const cards: CardData[] = [];
  const notifications: Array<{ message: string; level: string }> = [];
  let command: Harness["command"] | undefined;

  const pi = {
    appendEntry: (type: string, data: CardData) => {
      expect(type).toBe(CLAUDE_CARD_TYPE);
      cards.push(data);
    },
    registerCommand: (_name: string, options: Harness["command"]) => {
      command = options;
    },
  } as unknown as ExtensionAPI;

  registerClaudeCommand(pi);
  if (!command) throw new Error("command was not registered");

  return { pi, cards, notifications, command };
}

function context(notifications: Array<{ message: string; level: string }>, overrides: CtxOverrides = {}): ExtensionCommandContext {
  return {
    modelRegistry: {
      getProviderAuthStatus: () => ({
        configured: overrides.configured ?? true,
        source: overrides.source ?? "stored",
      }),
      getAll: () => overrides.models ?? [{ provider: "claude" }, { provider: "claude" }, { provider: "anthropic" }],
      getApiKeyForProvider: async () => ("accessToken" in overrides ? overrides.accessToken : "sk-ant-oat01-token"),
    },
    model: overrides.model,
    ui: {
      notify: (message: string, level = "info") => {
        notifications.push({ message, level });
        return { status: "shown" as const };
      },
      setStatus: () => {},
    },
  } as unknown as ExtensionCommandContext;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
});

describe("statusCard", () => {
  it("shows the saved sign-in and the active model", () => {
    const card = statusCard(
      { configured: true, source: "stored", envToken: false, modelCount: 18, activeModel: "claude-opus-5-5" },
      1,
    );

    expect(card.title).toBe("Claude (Pro/Max/Ultra)");
    expect(card.lines.map((line) => line.text)).toEqual([
      "Signed in via saved credential",
      "18 Claude (Pro/Max/Ultra) models in the catalog",
      "Active model: claude-opus-5-5",
    ]);
    expect(card.timestamp).toBe(1);
  });

  it("tells a signed-out user how to sign in", () => {
    const card = statusCard({ configured: false, envToken: false, modelCount: 18 });
    expect(card.lines[0]).toEqual({ text: "Not signed in", tone: "warning" });
    expect(card.lines.at(-1)?.text).toBe("Run /login claude to sign in with a Claude subscription");
  });

  it("explains that the environment token could not be used", () => {
    const card = statusCard({ configured: false, envToken: true, modelCount: 18 });
    expect(card.lines.at(-1)?.text).toBe("CLAUDE_CODE_OAUTH_TOKEN is set but Pi could not use it");
  });

  it("shows an unknown source verbatim", () => {
    const card = statusCard({ configured: true, source: "models_json_key", envToken: false, modelCount: 1 });
    expect(card.lines[0]?.text).toBe("Signed in via models_json_key");
  });
});

describe("usageCard", () => {
  it("turns a report into card lines", () => {
    const card = usageCard(parseUsage({ five_hour: { utilization: 12 } }), 5);
    expect(card.title).toBe("Claude (Pro/Max/Ultra) usage");
    expect(card.lines).toEqual([{ text: "5-hour window: 12%", tone: "muted" }]);
    expect(card.timestamp).toBe(5);
  });
});

describe("/claude command", () => {
  it("appends a status card by default", async () => {
    const { cards, notifications, command } = harness();
    await command.handler("", context(notifications));

    expect(cards).toHaveLength(1);
    expect(cards[0]?.lines.map((line) => line.text)).toContain("2 Claude (Pro/Max/Ultra) models in the catalog");
  });

  it("shows the active Claude model only when Claude is selected", async () => {
    const { cards, notifications, command } = harness();
    await command.handler("status", context(notifications, { model: { provider: "openai", id: "gpt" } }));
    expect(cards[0]?.lines.some((line) => line.text.startsWith("Active model"))).toBe(false);
  });

  it("shows usage from the stored token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ five_hour: { utilization: 30 } }), { status: 200 })),
    );
    const { cards, notifications, command } = harness();
    await command.handler("usage", context(notifications));

    expect(cards).toHaveLength(1);
    expect(cards[0]?.lines).toEqual([{ text: "5-hour window: 30%", tone: "muted" }]);
  });

  it("asks for a sign-in before usage without a token", async () => {
    const { cards, notifications, command } = harness();
    await command.handler("usage", context(notifications, { accessToken: undefined }));

    expect(cards).toHaveLength(0);
    expect(notifications.at(-1)).toEqual({ message: "No Claude sign-in found. Run /login claude first.", level: "warning" });
  });

  it("reports usage failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    const { cards, notifications, command } = harness();
    await command.handler("usage", context(notifications));

    expect(cards).toHaveLength(0);
    expect(notifications.at(-1)?.level).toBe("error");
    expect(notifications.at(-1)?.message).toMatch(/\/login claude/);
  });

  it("points login and logout at the built-in commands", async () => {
    const { command, notifications } = harness();
    await command.handler("login", context(notifications));
    await command.handler("logout", context(notifications));

    expect(notifications.map((entry) => entry.message)).toEqual([
      "Run /login claude, then choose a Claude sign-in method.",
      "Run /logout, then choose Claude (Pro/Max/Ultra).",
    ]);
  });

  it("rejects an unknown subcommand", async () => {
    const { command, notifications } = harness();
    await command.handler("bogus", context(notifications));
    expect(notifications.at(-1)?.level).toBe("error");
  });

  it("completes subcommands by prefix", () => {
    const { command } = harness();
    const matches = command.getArgumentCompletions?.("lo") as Array<{ value: string }> | null;
    expect(matches?.map((match) => match.value)).toEqual(["login", "logout"]);
    expect(command.getArgumentCompletions?.("zzz")).toBeNull();
  });
});
