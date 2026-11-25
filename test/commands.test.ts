import {
  deepStrictEqual,
  match,
  ok,
  partialDeepStrictEqual,
  strictEqual,
} from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";

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
      strictEqual(type, CLAUDE_CARD_TYPE);
      cards.push(data);
    },
    registerCommand: (_name, options) => {
      commands.push(options);
    },
  };

  registerClaudeCommand(host);
  const [command] = commands;
  if (!command) throw new Error("command was not registered");

  return { cards, notifications: [] as Notification[], command };
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

afterEach(() => mock.restoreAll());

await describe("statusCard", async () => {
  await it("shows the saved sign-in and the active model", () => {
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

    strictEqual(card.title, "Claude (Pro/Max/Ultra)");
    deepStrictEqual(
      card.lines.map((line) => line.text),
      [
        "Signed in via saved credential",
        "18 Claude (Pro/Max/Ultra) models in the catalog",
        "Active model: claude-opus-5-5",
      ],
    );
    strictEqual(card.timestamp, 1);
  });

  await it("tells a signed-out user how to sign in", () => {
    const card = statusCard({ configured: false, envToken: false, modelCount: 18 });
    deepStrictEqual(card.lines[0], { text: "Not signed in", tone: "warning" });
    strictEqual(card.lines.at(-1)?.text, "Run /login claude to sign in with a Claude subscription");
  });

  await it("explains that the environment token could not be used", () => {
    const card = statusCard({ configured: false, envToken: true, modelCount: 18 });
    strictEqual(card.lines.at(-1)?.text, "CLAUDE_CODE_OAUTH_TOKEN is set but Pi could not use it");
  });

  await it("shows an unknown source verbatim", () => {
    const card = statusCard({
      configured: true,
      source: "models_json_key",
      envToken: false,
      modelCount: 1,
    });
    strictEqual(card.lines[0]?.text, "Signed in via models_json_key");
  });
});

await describe("usageCard", async () => {
  await it("turns a report into card lines", () => {
    const card = usageCard(parseUsage({ five_hour: { utilization: 12 } }), 5);
    strictEqual(card.title, "Claude (Pro/Max/Ultra) usage");
    deepStrictEqual(card.lines, [{ text: "5-hour window: 12%", tone: "muted" }]);
    strictEqual(card.timestamp, 5);
  });
});

await describe("/claude command", async () => {
  await it("appends a status card by default", async () => {
    const { cards, notifications, command } = harness();
    await command.handler("", context(notifications));

    strictEqual(cards.length, 1);
    ok(
      cards[0]?.lines
        .map((line) => line.text)
        .includes("2 Claude (Pro/Max/Ultra) models in the catalog"),
    );
  });

  await it("shows the active Claude model only when Claude is selected", async () => {
    const { cards, notifications, command } = harness();
    await command.handler(
      "status",
      context(notifications, { model: getBuiltinModels("anthropic")[0] }),
    );
    strictEqual(
      cards[0]?.lines.some((line) => line.text.startsWith("Active model")),
      false,
    );
  });

  await it("shows usage from the stored token", async () => {
    mock.method(globalThis, "fetch", async () => Response.json({ five_hour: { utilization: 30 } }));
    const { cards, notifications, command } = harness();
    await command.handler("usage", context(notifications));

    strictEqual(cards.length, 1);
    deepStrictEqual(cards[0]?.lines, [{ text: "5-hour window: 30%", tone: "muted" }]);
  });

  await it("asks for a sign-in before usage without a token", async () => {
    const { cards, notifications, command } = harness();
    await command.handler("usage", context(notifications, { accessToken: undefined }));

    strictEqual(cards.length, 0);
    deepStrictEqual(notifications.at(-1), {
      message: "No Claude sign-in found. Run /login claude first.",
      level: "warning",
    });
  });

  await it("reports why the saved sign-in could not be used", async () => {
    const authError = new Error("OAuth refresh failed for claude", {
      cause: new Error("This Claude token cannot be refreshed."),
    });
    const { cards, notifications, command } = harness();
    await command.handler("usage", context(notifications, { authError }));

    strictEqual(cards.length, 0);
    deepStrictEqual(notifications.at(-1), {
      message: "OAuth refresh failed for claude: This Claude token cannot be refreshed.",
      level: "error",
    });
  });

  await it("reports usage failures", async () => {
    mock.method(globalThis, "fetch", async () => Response.json({}, { status: 401 }));
    const { cards, notifications, command } = harness();
    await command.handler("usage", context(notifications));

    strictEqual(cards.length, 0);
    strictEqual(notifications.at(-1)?.level, "error");
    match(notifications.at(-1)?.message ?? "", /\/login claude/);
  });

  await it("points login and logout at the built-in commands", async () => {
    const { command, notifications } = harness();
    await command.handler("login", context(notifications));
    await command.handler("logout", context(notifications));

    deepStrictEqual(
      notifications.map((entry) => entry.message),
      [
        "Run /login claude, then choose a Claude sign-in method.",
        "Run /logout, then choose Claude (Pro/Max/Ultra).",
      ],
    );
  });

  await it("rejects an unknown subcommand", async () => {
    const { command, notifications } = harness();
    await command.handler("bogus", context(notifications));
    strictEqual(notifications.at(-1)?.level, "error");
  });

  await it("completes subcommands by prefix", () => {
    const { command } = harness();
    partialDeepStrictEqual(command.getArgumentCompletions?.("lo"), [
      { value: "login" },
      { value: "logout" },
    ]);
    strictEqual(command.getArgumentCompletions?.("zzz"), null);
  });
});
