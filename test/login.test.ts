import type { AuthEvent, AuthPrompt, ProviderAuthInteraction } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { LOGIN_METHODS, login, type LoginDependencies } from "../extensions/claude-oauth/login";
import { CLAUDE_AUTHORIZE_URL, CLAUDE_COPY_CODE_REDIRECT_URI } from "../extensions/claude-oauth/oauth";

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

      const signal = prompt.signal ? AbortSignal.any([controller.signal, prompt.signal]) : controller.signal;
      return new Promise<string>((_resolve, reject) => {
        if (signal.aborted) reject(new Error("Login cancelled"));
        signal.addEventListener("abort", () => reject(new Error("Login cancelled")), { once: true });
      });
    },
  };

  return { interaction: value, events, prompts, controller };
}

const tokenResponse = (): Response =>
  new Response(
    JSON.stringify({ access_token: "sk-ant-oat01-access", refresh_token: "refresh", expires_in: 3600 }),
    { status: 200 },
  );

const recordExchange = () => {
  const calls: Array<Record<string, string>> = [];
  const dependencies: LoginDependencies = {
    fetch: async (_input, init) => {
      calls.push(JSON.parse(String(init?.body)));
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

describe("login", () => {
  it("offers browser, headless, and long-lived token methods", async () => {
    const { interaction: fake, prompts } = interaction("setup_token", ["sk-ant-oat01-token"]);
    await login(fake);

    const select = prompts[0];
    expect(select?.type).toBe("select");
    if (select?.type !== "select") throw new Error("expected select");
    expect(select.options.map((option) => option.id)).toEqual([...LOGIN_METHODS]);
    expect(select.options[0]?.id).toBe("browser");
  });

  it("stores a pasted setup token without exchanging it", async () => {
    const { interaction: fake } = interaction("setup_token", [" sk-ant-oat01-token "]);
    const credential = await login(fake);

    expect(credential).toMatchObject({ type: "oauth", access: "sk-ant-oat01-token", refresh: "" });
  });

  it("rejects a pasted value that is not a Claude token", async () => {
    const { interaction: fake } = interaction("setup_token", ["nope"]);
    await expect(login(fake)).rejects.toThrow(/claude setup-token/);
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
    expect(authUrl(events).searchParams.get("redirect_uri")).toBe(CLAUDE_COPY_CODE_REDIRECT_URI);
    expect(authUrl(events).searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("rejects a copy-code result from another sign-in request", async () => {
    const { interaction: fake } = interaction("copy_code", ["the-code#other-state"]);
    await expect(login(fake)).rejects.toThrow(/different request/);
  });

  it("rejects an empty copy-code result", async () => {
    const { interaction: fake } = interaction("copy_code", ["   "]);
    await expect(login(fake)).rejects.toThrow(/No authorization code/);
  });

  it("exchanges the code from the local browser callback", async () => {
    const { interaction: fake, events } = interaction("browser");
    const { calls, dependencies } = recordExchange();
    const redirectUri = "http://localhost:53692/callback";

    const credential = await login(fake, {
      ...dependencies,
      startServer: async () => ({ redirectUri, waitForCode: async () => "callback-code", close: () => {} }),
    });

    expect(credential.access).toBe("sk-ant-oat01-access");
    expect(calls[0]).toMatchObject({ code: "callback-code", redirect_uri: redirectUri });
    expect(authUrl(events).origin + authUrl(events).pathname).toBe(CLAUDE_AUTHORIZE_URL);
    expect(authUrl(events).searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(authUrl(events).searchParams.get("code")).toBe("true");
    expect(authUrl(events).searchParams.get("state")).toBeTruthy();
  });

  it("accepts a pasted redirect URL when no callback server can start", async () => {
    const { interaction: fake } = interaction("browser", ["http://localhost:53692/callback?code=pasted-code"]);
    const { calls, dependencies } = recordExchange();

    await login(fake, {
      ...dependencies,
      startServer: async () => {
        throw new Error("port in use");
      },
    });

    expect(calls[0]).toMatchObject({ code: "pasted-code", redirect_uri: "http://localhost:53692/callback" });
  });

  it("cancels the login when the user aborts", async () => {
    const { interaction: fake, controller } = interaction("browser");
    const pending = login(fake, {
      startServer: async () => {
        throw new Error("no server");
      },
    });

    controller.abort();
    await expect(pending).rejects.toThrow(/Login cancelled/);
  });

  it("rejects an unknown method", async () => {
    const { interaction: fake } = interaction("bogus");
    await expect(login(fake)).rejects.toThrow(/Unknown Claude login method/);
  });
});
