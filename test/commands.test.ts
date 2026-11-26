import { ModelsError } from "@earendil-works/pi-ai/models";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type CardData,
  CLAUDE_CARD_TYPE,
  type CommandContext,
  type CommandHost,
  registerClaudeCommand,
  statusCard,
  usageCard,
} from "../src/commands.ts";
import { claudeModels } from "../src/models.ts";
import { ClaudeAuthError } from "../src/oauth.ts";
import { parseUsage } from "../src/usage.ts";

type Notification = { message: string; level: string };
type Command = Parameters<CommandHost["registerCommand"]>[1];

interface CtxOverrides {
  readonly accessToken?: string | undefined;
  readonly authError?: Error;
  readonly model?: CommandContext["model"];
}

const CATALOG = [...claudeModels().slice(0, 2), ...getBuiltinModels("anthropic").slice(0, 1)];

function harness() {
  const cards: CardData[] = [];
  const commands: Command[] = [];

  const host: CommandHost = {
    appendEntry: (type, data) => {
      expect(type).toBe(CLAUDE_CARD_TYPE);
      cards.push(data);
    },
    registerCommand: (_name, options) => {
      commands.push(options);
    },
  };

  registerClaudeCommand(host);
  const [command] = commands;
  if (!command) throw new Error("command was not registered");

  const notifications: Notification[] = [];
  return { cards, notifications, command };
}

function context(notifications: Notification[], overrides: CtxOverrides = {}): CommandContext {
  return {
    modelRegistry: {
      getProviderAuthStatus: () => ({ configured: true, source: "stored" }),
      getAll: () => CATALOG,
      getProviderAuth: async () => {
        if (overrides.authError) throw overrides.authError;
        const apiKey = "accessToken" in overrides ? overrides.accessToken : "sk-ant-oat01-token";
        return apiKey ? { auth: { apiKey } } : undefined;
      },
    },
    model: overrides.model,
    ui: {
      notify: (message, level = "info") => {
        notifications.push({ message, level });
      },
      setStatus: () => {},
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("statusCard", () => {
  it("shows the saved sign-in and the active model", () => {
    const card = statusCard(
      {
        configured: true,
        source: "stored",
        envToken: false,
        modelCount: 18,
        activeModel: "claude-opus-5-5",
      },
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

  it("labels a key or command configured in models.json", () => {
    const headlines = (["models_json_key", "models_json_command"] as const).map(
      (source) =>
        statusCard({ configured: true, source, envToken: false, modelCount: 1 }).lines[0]?.text,
    );

    expect(headlines).toEqual([
      "Signed in via models.json key",
      "Signed in via models.json command",
    ]);
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
    expect(cards[0]?.lines.map((line) => line.text)).toContain(
      "2 Claude (Pro/Max/Ultra) models in the catalog",
    );
  });

  it("shows the active Claude model only when Claude is selected", async () => {
    const { cards, notifications, command } = harness();
    await command.handler(
      "status",
      context(notifications, { model: getBuiltinModels("anthropic")[0] }),
    );
    expect(cards[0]?.lines.some((line) => line.text.startsWith("Active model"))).toBe(false);
  });

  it("shows usage from the stored token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ five_hour: { utilization: 30 } }),
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
    expect(notifications.at(-1)).toEqual({
      message: "No Claude sign-in found. Run /login claude first.",
      level: "warning",
    });
  });

  it("reports why the saved sign-in could not be used", async () => {
    const authError = new Error("OAuth refresh failed for claude", {
      cause: new Error("This Claude token cannot be refreshed."),
    });
    const { cards, notifications, command } = harness();
    await command.handler("usage", context(notifications, { authError }));

    expect(cards).toHaveLength(0);
    expect(notifications.at(-1)).toEqual({
      message: "OAuth refresh failed for claude: This Claude token cannot be refreshed.",
      level: "error",
    });
  });

  it("states a refresh failure once when Pi already folds the cause into the message", async () => {
    const authError = new ModelsError("oauth", "OAuth refresh failed for claude", {
      cause: new Error("This Claude token cannot be refreshed."),
    });
    const { notifications, command } = harness();
    await command.handler("usage", context(notifications, { authError }));

    expect(notifications.at(-1)).toEqual({
      message: "OAuth refresh failed for claude: This Claude token cannot be refreshed.",
      level: "error",
    });
  });

  it("states each message once when the folded cause has its own cause", async () => {
    const url = "https://platform.claude.com/v1/oauth/token";
    const authError = new ModelsError("oauth", "OAuth refresh failed for claude", {
      cause: new ClaudeAuthError(`Could not reach ${url}.`, {
        cause: new TypeError("fetch failed", { cause: new Error("bad port") }),
      }),
    });
    const { notifications, command } = harness();
    await command.handler("usage", context(notifications, { authError }));

    expect(notifications.at(-1)).toEqual({
      message: `OAuth refresh failed for claude: Could not reach ${url}.: fetch failed: bad port`,
      level: "error",
    });
  });

  it("reports usage failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}, { status: 401 }));
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
    expect(command.getArgumentCompletions?.("lo")).toMatchObject([
      { value: "login" },
      { value: "logout" },
    ]);
    expect(command.getArgumentCompletions?.("zzz")).toBeNull();
  });
});
