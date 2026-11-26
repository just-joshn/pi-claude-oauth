import { createHash } from "node:crypto";

import type { AuthEvent, AuthPrompt, ProviderAuthInteraction } from "@earendil-works/pi-ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startLoopbackServer } from "../src/callback-server.ts";
import { login, type LoginDependencies } from "../src/login.ts";
import {
  buildAuthorizeUrl,
  CLAUDE_AUTHORIZE_URL,
  CLAUDE_COPY_CODE_REDIRECT_URI,
  ClaudeAuthError,
} from "../src/oauth.ts";

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

function pastingOnce(method: string, paste: (state: string) => string) {
  const fake = interaction(method);
  let pasted = false;
  const value: ProviderAuthInteraction = {
    ...fake.interaction,
    prompt: async (prompt) => {
      if (prompt.type !== "manual_code") {
        return fake.interaction.prompt(prompt);
      }
      fake.prompts.push(prompt);
      if (pasted) {
        throw new Error("Login cancelled");
      }
      pasted = true;
      return paste(authUrl(fake.events).searchParams.get("state") ?? "");
    },
  };
  return { ...fake, interaction: value };
}

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
  expect(state).toBeTruthy();
  expect(call).toMatchObject({ state });
  expect(url.href).not.toContain(call.code_verifier);
  expect(url.searchParams.get("code_challenge")).toBe(
    createHash("sha256").update(call.code_verifier).digest("base64url"),
  );
}

describe("login", () => {
  describe("setup-token import", () => {
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

    it("offers browser, headless, and long-lived token methods", async () => {
      const { interaction: fake, prompts } = interaction("setup_token", ["sk-ant-oat01-token"]);
      await login(fake);

      const select = prompts[0];
      expect(select?.type).toBe("select");
      if (select?.type !== "select") throw new Error("expected select");
      expect(select.message).toContain("extra usage");
      expect(select.options.map((option) => option.id)).toEqual([
        "browser",
        "copy_code",
        "setup_token",
      ]);
    });

    it("imports the environment token without asking for it or displaying it", async () => {
      const { interaction: fake, prompts, events } = interaction("setup_token", ["wrong-input"]);
      const credential = await login(fake);
      expect(credential).toMatchObject({
        type: "oauth",
        access: "sk-ant-oat01-env-fixture",
        refresh: "",
      });
      expect(prompts.map((p) => p.type)).toEqual(["select"]);
      expect(JSON.stringify([prompts, events])).not.toContain("sk-ant-oat01-env-fixture");
    });

    it.each([undefined, "", "  "])(
      "asks for the environment token when it is unset (%j)",
      async (value) => {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
        const { interaction: fake, prompts } = interaction("setup_token", ["sk-ant-oat01-decoy"]);
        await expect(login(fake)).rejects.toThrow(/Set CLAUDE_CODE_OAUTH_TOKEN/);
        expect(prompts).toHaveLength(1);
      },
    );

    it.each(['"sk-ant-oat01-AAAA"', "sk-ant-oat01-AAAA\nBBBB", "sk-ant-api03-AAAA"])(
      "says the environment token is set but unusable without echoing it (%j)",
      async (value) => {
        process.env[name] = value;
        const { interaction: fake, prompts } = interaction("setup_token", ["sk-ant-oat01-decoy"]);
        const attempt = login(fake);
        await expect(attempt).rejects.toThrow(ClaudeAuthError);
        await expect(attempt).rejects.toThrow(/CLAUDE_CODE_OAUTH_TOKEN is set/);
        await expect(attempt).rejects.not.toThrow(/AAAA/);
        expect(prompts).toHaveLength(1);
      },
    );
  });

  it("exchanges a pasted copy-code result", async () => {
    const { interaction: fake, events } = interaction("copy_code", ["the-code"]);
    const { calls, dependencies } = recordExchange();

    const credential = await login(fake, dependencies);

    expect(credential.access).toBe("sk-ant-oat01-access");
    expect(credential.refresh).toBe("refresh");
    expect(calls[0]).toMatchObject({
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: CLAUDE_COPY_CODE_REDIRECT_URI,
    });
    expectPkceExchange(calls[0], authUrl(events));
    expect(authUrl(events).searchParams.get("redirect_uri")).toBe(CLAUDE_COPY_CODE_REDIRECT_URI);
    expect(authUrl(events).searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("rejects an initial exchange that cannot produce a refreshable credential", async () => {
    const { interaction: fake } = interaction("copy_code", ["the-code"]);

    await expect(
      login(fake, {
        fetch: async () => Response.json({ access_token: "fixture", expires_in: 3600 }),
      }),
    ).rejects.toThrow(/did not include a refresh token/);
  });

  it("asks again after a blank copy-code paste", async () => {
    const { interaction: fake, prompts } = interaction("copy_code", ["", "   ", "the-code"]);
    const { calls, dependencies } = recordExchange();

    await login(fake, dependencies);

    expect(prompts.map((prompt) => prompt.type)).toEqual([
      "select",
      "manual_code",
      "manual_code",
      "manual_code",
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ code: "the-code" });
  });

  it.each([
    [
      "the sign-in link",
      buildAuthorizeUrl({
        redirectUri: CLAUDE_COPY_CODE_REDIRECT_URI,
        state: "state",
        challenge: "challenge",
      }),
      "That is the sign-in link. Paste the address you land on after signing in.",
    ],
    ["a result from another request", "the-code#other-state", "belongs to a different request"],
    ["a result without a code", "/callback?scope=user", "No authorization code was found"],
  ])("explains why %s was refused and asks again", async (_name, paste, reason) => {
    const { interaction: fake, events, prompts } = interaction("copy_code", [paste, "the-code"]);
    const { calls, dependencies } = recordExchange();

    await login(fake, dependencies);

    const notices = events.flatMap((event) => (event.type === "info" ? [event.message] : []));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain(reason);
    expect(prompts.filter((prompt) => prompt.type === "manual_code")).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ code: "the-code" });
  });

  it("ends the sign-in when the pasted result reports a denial", async () => {
    const { interaction: fake, prompts } = interaction("copy_code", [
      "/callback?error=access_denied",
      "the-code",
    ]);
    const { calls, dependencies } = recordExchange();

    const attempt = login(fake, dependencies);
    await expect(attempt).rejects.toThrow(ClaudeAuthError);
    await expect(attempt).rejects.toThrow(/declined/);
    expect(prompts.filter((prompt) => prompt.type === "manual_code")).toHaveLength(1);
    expect(calls).toHaveLength(0);
  });

  it("ends the sign-in with the provider's reason when this request was denied", async () => {
    const { interaction: fake, prompts } = pastingOnce(
      "copy_code",
      (state) => `/callback?error=access_denied&error_description=User%20denied&state=${state}`,
    );
    const { calls, dependencies } = recordExchange();

    const attempt = login(fake, dependencies);
    await expect(attempt).rejects.toThrow(ClaudeAuthError);
    await expect(attempt).rejects.toThrow("Claude sign-in was declined: User denied");
    expect(prompts.filter((prompt) => prompt.type === "manual_code")).toHaveLength(1);
    expect(calls).toHaveLength(0);
  });

  it("exchanges a copy-code result wrapped in backticks", async () => {
    const { interaction: fake } = pastingOnce("copy_code", (state) => `\`the-code#${state}\``);
    const { calls, dependencies } = recordExchange();

    await login(fake, dependencies);

    expect(calls[0]).toMatchObject({ code: "the-code" });
  });

  it("asks again when a denial from another browser sign-in is pasted", async () => {
    const {
      interaction: fake,
      events,
      prompts,
    } = interaction("browser", [
      "http://localhost:53692/callback?error=access_denied&error_description=The+user+denied+access&state=other-state",
      "pasted-code",
    ]);
    const { calls, dependencies } = recordExchange();

    await login(fake, {
      ...dependencies,
      startServer: async () => {
        throw new Error("port in use");
      },
    });

    const notices = events.flatMap((event) => (event.type === "info" ? [event.message] : []));
    expect(notices).toEqual(["The pasted sign-in result belongs to a different request."]);
    expect(prompts.filter((prompt) => prompt.type === "manual_code")).toHaveLength(2);
    expect(calls[0]).toMatchObject({ code: "pasted-code" });
  });

  it("exchanges the code from the local browser callback", async () => {
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

    expect(credential.access).toBe("sk-ant-oat01-access");
    const url = authUrl(events);
    expectPkceExchange(calls[0], url);
    expect(calls[0]).toMatchObject({ code: "callback-code", redirect_uri: redirectUri });
    expect(url.origin + url.pathname).toBe(CLAUDE_AUTHORIZE_URL);
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(url.searchParams.get("code")).toBe("true");
  });

  it("keeps waiting for the browser after a blank paste", async () => {
    const { interaction: fake, prompts } = interaction("browser", [""]);
    const { calls, dependencies } = recordExchange();
    const close = vi.fn(() => {});

    await login(fake, {
      ...dependencies,
      startServer: async () => ({
        redirectUri: "http://localhost:1234/callback",
        waitForCode: () =>
          new Promise<string>((resolve) => setTimeout(resolve, 0, "callback-code")),
        close,
      }),
    });

    const pastePrompts = prompts.filter((prompt) => prompt.type === "manual_code");
    expect(pastePrompts).toHaveLength(2);
    expect(pastePrompts.at(-1)?.signal?.aborted).toBe(true);
    expect(close).toHaveBeenCalled();
    expect(calls[0]).toMatchObject({ code: "callback-code" });
  });

  it("accepts the browser redirect after an invalid paste", async () => {
    const { interaction: fake, events, prompts } = interaction("browser", ["the-code#other-state"]);
    const { calls, dependencies } = recordExchange();
    const pastePrompts = () => prompts.filter((prompt) => prompt.type === "manual_code");

    const pending = login(fake, {
      ...dependencies,
      startServer: (options) => startLoopbackServer({ ...options, ports: [0] }),
    });
    await vi.waitFor(() => expect(pastePrompts()).toHaveLength(2));

    const url = authUrl(events);
    const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
    redirect.searchParams.set("code", "callback-code");
    redirect.searchParams.set("state", url.searchParams.get("state") ?? "");
    const response = await fetch(redirect);
    await response.body?.cancel();

    expect(response.status).toBe(200);
    await pending;
    expect(events.some((event) => event.type === "info")).toBe(true);
    expect(pastePrompts().at(-1)?.signal?.aborted).toBe(true);
    expect(calls[0]).toMatchObject({ code: "callback-code" });
  });

  it("releases the listener before exchanging a manually entered browser code", async () => {
    const { interaction: fake } = interaction("browser", ["pasted-code"]);
    const close = vi.fn(() => {});
    await login(fake, {
      startServer: async () => ({
        redirectUri: "http://localhost:1234/callback",
        waitForCode: () => new Promise<string>(() => {}),
        close,
      }),
      fetch: async () => {
        expect(close).toHaveBeenCalled();
        return tokenResponse();
      },
    });
  });

  it("accepts a pasted redirect after the browser listener times out", async () => {
    const fake = interaction("browser");
    const { calls, dependencies } = recordExchange();
    const value: ProviderAuthInteraction = {
      ...fake.interaction,
      prompt: async (prompt) => {
        if (prompt.type !== "manual_code") {
          return fake.interaction.prompt(prompt);
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        const url = authUrl(fake.events);
        const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
        redirect.searchParams.set("code", "pasted-code");
        redirect.searchParams.set("state", url.searchParams.get("state") ?? "");
        await expect(fetch(redirect)).rejects.toThrow();
        return redirect.href;
      },
    };

    await login(value, {
      ...dependencies,
      startServer: (options) => startLoopbackServer({ ...options, ports: [0], timeoutMs: 10 }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ code: "pasted-code" });
  });

  it("accepts a pasted redirect URL when no callback server can start", async () => {
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

    expect(calls[0]).toMatchObject({
      code: "pasted-code",
      redirect_uri: "http://localhost:53692/callback",
    });
  });

  it("cancels the login when the user aborts", async () => {
    const { interaction: fake, controller, events } = interaction("browser");
    const pending = login(fake, {
      startServer: async () => {
        throw new Error("no server");
      },
    });

    controller.abort();
    await expect(pending).rejects.toThrow(/cancelled/i);
    expect(events.some((event) => event.type === "auth_url")).toBe(false);
  });

  it("rejects an unknown method", async () => {
    const { interaction: fake } = interaction("bogus");
    await expect(login(fake)).rejects.toThrow(/Unknown Claude login method/);
  });
});
