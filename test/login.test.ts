import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { rejects } from "node:assert/strict";
import { createHash } from "node:crypto";

import type { AuthEvent, AuthPrompt, ProviderAuthInteraction } from "@earendil-works/pi-ai";

import { login, type LoginDependencies } from "../src/login";
import {
  CLAUDE_AUTHORIZE_URL,
  CLAUDE_COPY_CODE_REDIRECT_URI,
} from "../src/oauth";

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

    it.each([undefined, "invalid"])(
      "explains how to supply a valid environment token (%s)",
      async (value) => {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
        const { interaction: fake, prompts } = interaction("setup_token", ["sk-ant-oat01-decoy"]);
        await rejects(login(fake), /CLAUDE_CODE_OAUTH_TOKEN/);
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

    await rejects(
      login(fake, {
        fetch: async () => Response.json({ access_token: "fixture", expires_in: 3600 }),
      }),
      /did not include a refresh token/,
    );
  });

  it("rejects a copy-code result from another sign-in request", () => {
    const { interaction: fake } = interaction("copy_code", ["the-code#other-state"]);
    expect(login(fake)).rejects.toThrow(/different request/);
  });

  it("rejects an empty copy-code result", () => {
    const { interaction: fake } = interaction("copy_code", ["   "]);
    expect(login(fake)).rejects.toThrow(/No authorization code/);
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

  it("releases the listener before exchanging a manually entered browser code", async () => {
    const { interaction: fake } = interaction("browser", ["pasted-code"]);
    const close = mock(() => {});
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
    await rejects(pending, /cancelled/i);
    expect(events.some((event) => event.type === "auth_url")).toBe(false);
  });

  it("rejects an unknown method", () => {
    const { interaction: fake } = interaction("bogus");
    expect(login(fake)).rejects.toThrow(/Unknown Claude login method/);
  });
});
