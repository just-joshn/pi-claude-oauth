import {
  deepStrictEqual,
  ok,
  partialDeepStrictEqual,
  rejects,
  strictEqual,
} from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import type { AuthEvent, AuthPrompt, ProviderAuthInteraction } from "@earendil-works/pi-ai";

import { login, type LoginDependencies } from "../src/login.ts";
import { CLAUDE_AUTHORIZE_URL, CLAUDE_COPY_CODE_REDIRECT_URI } from "../src/oauth.ts";

function interaction(method: string, answers: string[] = []) {
  const events: AuthEvent[] = [];
  const prompts: AuthPrompt[] = [];
  const controller = new AbortController();
  let next = 0;

  const value: ProviderAuthInteraction = {
    signal: controller.signal,
    notify: (event) => events.push(event),
    prompt: async (prompt) => {
      prompts.push(prompt);
      if (prompt.type === "select") return method;

      const answer = answers[next++];
      if (answer !== undefined) return answer;

      const signal = prompt.signal
        ? AbortSignal.any([controller.signal, prompt.signal])
        : controller.signal;
      return new Promise<string>((_resolve, reject) => {
        if (signal.aborted) reject(new Error("Login cancelled"));
        signal.addEventListener("abort", () => reject(new Error("Login cancelled")), {
          once: true,
        });
      });
    },
  };

  return { interaction: value, events, prompts, controller };
}

const tokenResponse = (): Response =>
  new Response(
    JSON.stringify({
      access_token: "sk-ant-oat01-access",
      refresh_token: "refresh",
      expires_in: 3600,
    }),
    { status: 200 },
  );

const recordExchange = () => {
  const calls: unknown[] = [];
  const dependencies: LoginDependencies = {
    fetch: async (url, init) => {
      calls.push(await new Request(url, init).json());
      return tokenResponse();
    },
  };
  return { calls, dependencies };
};

const authUrl = (events: AuthEvent[]): URL => {
  const event = events.find((entry) => entry.type === "auth_url");
  if (event?.type !== "auth_url") throw new Error("no auth_url event");
  return new URL(event.url);
};

function expectPkceExchange(call: unknown, url: URL): void {
  if (
    !call ||
    typeof call !== "object" ||
    !("code_verifier" in call) ||
    typeof call.code_verifier !== "string"
  ) {
    throw new Error("Expected a PKCE verifier in the exchange");
  }
  const state = url.searchParams.get("state");
  ok(state);
  partialDeepStrictEqual(call, { state });
  ok(!url.href.includes(call.code_verifier));
  strictEqual(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update(call.code_verifier).digest("base64url"),
  );
}

await describe("login", async () => {
  await describe("setup-token import", async () => {
    const name = "CLAUDE_CODE_OAUTH_TOKEN";
    let previous: string | undefined;
    beforeEach(() => {
      previous = process.env[name];
      process.env[name] = "sk-ant-oat01-env-fixture";
    });
    afterEach(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });

    await it("offers browser, headless, and long-lived token methods", async () => {
      const { interaction: fake, prompts } = interaction("setup_token", ["sk-ant-oat01-token"]);
      await login(fake);

      const select = prompts[0];
      strictEqual(select?.type, "select");
      if (select?.type !== "select") throw new Error("expected select");
      ok(select.message.includes("extra usage"));
      deepStrictEqual(
        select.options.map((option) => option.id),
        ["browser", "copy_code", "setup_token"],
      );
    });

    await it("imports the environment token without asking for it or displaying it", async () => {
      const { interaction: fake, prompts, events } = interaction("setup_token", ["wrong-input"]);
      const credential = await login(fake);
      partialDeepStrictEqual(credential, {
        type: "oauth",
        access: "sk-ant-oat01-env-fixture",
        refresh: "",
      });
      deepStrictEqual(
        prompts.map((p) => p.type),
        ["select"],
      );
      ok(!JSON.stringify([prompts, events]).includes("sk-ant-oat01-env-fixture"));
    });

    for (const value of [undefined, "invalid"]) {
      // oxlint-disable-next-line no-await-in-loop -- Registering a test inside a suite resolves immediately.
      await it(`explains how to supply a valid environment token (${String(value)})`, async () => {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
        const { interaction: fake, prompts } = interaction("setup_token", ["sk-ant-oat01-decoy"]);
        await rejects(login(fake), /CLAUDE_CODE_OAUTH_TOKEN/);
        strictEqual(prompts.length, 1);
      });
    }
  });

  await it("exchanges a pasted copy-code result", async () => {
    const { interaction: fake, events } = interaction("copy_code", ["the-code"]);
    const { calls, dependencies } = recordExchange();

    const credential = await login(fake, dependencies);

    strictEqual(credential.access, "sk-ant-oat01-access");
    strictEqual(credential.refresh, "refresh");
    partialDeepStrictEqual(calls[0], {
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: CLAUDE_COPY_CODE_REDIRECT_URI,
    });
    expectPkceExchange(calls[0], authUrl(events));
    strictEqual(authUrl(events).searchParams.get("redirect_uri"), CLAUDE_COPY_CODE_REDIRECT_URI);
    strictEqual(authUrl(events).searchParams.get("code_challenge_method"), "S256");
  });

  await it("rejects an initial exchange that cannot produce a refreshable credential", async () => {
    const { interaction: fake } = interaction("copy_code", ["the-code"]);

    await rejects(
      login(fake, {
        fetch: async () => Response.json({ access_token: "fixture", expires_in: 3600 }),
      }),
      /did not include a refresh token/,
    );
  });

  await it("rejects a copy-code result from another sign-in request", async () => {
    const { interaction: fake } = interaction("copy_code", ["the-code#other-state"]);
    await rejects(login(fake), /different request/);
  });

  await it("rejects an empty copy-code result", async () => {
    const { interaction: fake } = interaction("copy_code", ["   "]);
    await rejects(login(fake), /No authorization code/);
  });

  await it("exchanges the code from the local browser callback", async () => {
    const { interaction: fake, events } = interaction("browser");
    const { calls, dependencies } = recordExchange();
    const redirectUri = "http://localhost:53692/callback";

    const credential = await login(fake, {
      ...dependencies,
      startServer: async () => ({
        redirectUri,
        waitForCode: async () => "callback-code",
        close: () => {},
      }),
    });

    strictEqual(credential.access, "sk-ant-oat01-access");
    const url = authUrl(events);
    expectPkceExchange(calls[0], url);
    partialDeepStrictEqual(calls[0], { code: "callback-code", redirect_uri: redirectUri });
    strictEqual(url.origin + url.pathname, CLAUDE_AUTHORIZE_URL);
    strictEqual(url.searchParams.get("redirect_uri"), redirectUri);
    strictEqual(url.searchParams.get("code"), "true");
  });

  await it("releases the listener before exchanging a manually entered browser code", async () => {
    const { interaction: fake } = interaction("browser", ["pasted-code"]);
    const close = mock.fn(() => {});
    await login(fake, {
      startServer: async () => ({
        redirectUri: "http://localhost:1234/callback",
        waitForCode: () => new Promise<string>(() => {}),
        close,
      }),
      fetch: async () => {
        ok(close.mock.callCount() > 0);
        return tokenResponse();
      },
    });
  });

  await it("accepts a pasted redirect URL when no callback server can start", async () => {
    const { interaction: fake } = interaction("browser", [
      "http://localhost:53692/callback?code=pasted-code",
    ]);
    const { calls, dependencies } = recordExchange();

    await login(fake, {
      ...dependencies,
      startServer: async () => {
        throw new Error("port in use");
      },
    });

    partialDeepStrictEqual(calls[0], {
      code: "pasted-code",
      redirect_uri: "http://localhost:53692/callback",
    });
  });

  await it("cancels the login when the user aborts", async () => {
    const { interaction: fake, controller, events } = interaction("browser");
    const pending = login(fake, {
      startServer: async () => {
        throw new Error("no server");
      },
    });

    controller.abort();
    await rejects(pending, /cancelled/i);
    strictEqual(
      events.some((event) => event.type === "auth_url"),
      false,
    );
  });

  await it("rejects an unknown method", async () => {
    const { interaction: fake } = interaction("bogus");
    await rejects(login(fake), /Unknown Claude login method/);
  });
});
