import type { ProviderAuthInteraction } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CLAUDE_CODE_OAUTH_TOKEN_ENV } from "../src/credential.ts";
import { claudeProvider } from "../src/provider.ts";

const signal = () => new AbortController().signal;

const authContext = (value: string | undefined) => ({
  env: async () => value,
  fileExists: async () => false,
});

const aborted = () => AbortSignal.abort(new Error("Login cancelled"));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("claudeProvider", () => {
  it("registers a subscription provider with the Anthropic streaming implementation", () => {
    const provider = claudeProvider();
    expect(provider.id).toBe("claude");
    expect(provider.name).toBe("Claude (Pro/Max/Ultra)");
    expect(provider.baseUrl).toBe("https://api.anthropic.com");
    expect(provider.auth.oauth?.isSubscription).toBe(true);
    expect(provider.auth.oauth?.name).toBe("Claude (Pro/Max/Ultra)");
    expect(provider.getModels().length).toBeGreaterThan(10);
  });

  it("resolves the documented CLAUDE_CODE_OAUTH_TOKEN variable", async () => {
    const apiKey = claudeProvider().auth.apiKey;
    expect(typeof apiKey?.resolve).toBe("function");

    const resolved = await apiKey?.resolve?.({
      ctx: authContext("sk-ant-oat01-token"),
      signal: signal(),
    });
    expect(resolved).toEqual({
      auth: { apiKey: "sk-ant-oat01-token" },
      source: CLAUDE_CODE_OAUTH_TOKEN_ENV,
    });
  });

  it.each([undefined, "ambient-fixture"])(
    "uses Pi's supplied key before the environment (%s)",
    async (ambient) => {
      const env = vi.fn(async () => ambient);
      const resolved = await claudeProvider().auth.apiKey?.resolve({
        ctx: { ...authContext(ambient), env },
        credential: { type: "api_key", key: "explicit-fixture" },
        signal: signal(),
      });
      expect(resolved?.auth.apiKey).toBe("explicit-fixture");
      expect(env).not.toHaveBeenCalled();
    },
  );

  it("forwards the provider env saved with Pi's credential", async () => {
    const resolved = await claudeProvider().auth.apiKey?.resolve({
      ctx: authContext("ambient-fixture"),
      credential: { type: "api_key", key: "explicit-fixture", env: { REGION: "eu" } },
      signal: signal(),
    });
    expect(resolved).toStrictEqual({
      auth: { apiKey: "explicit-fixture" },
      env: { REGION: "eu" },
      source: "Pi credential",
    });
  });

  it("leaves env out when Pi's credential has none", async () => {
    const resolved = await claudeProvider().auth.apiKey?.resolve({
      ctx: authContext("ambient-fixture"),
      credential: { type: "api_key", key: "explicit-fixture" },
      signal: signal(),
    });
    expect(resolved).toStrictEqual({
      auth: { apiKey: "explicit-fixture" },
      source: "Pi credential",
    });
    expect(resolved).not.toHaveProperty("env");
  });

  it("does not read the environment once the lookup is cancelled", async () => {
    const env = vi.fn(async () => "sk-ant-oat01-token");
    await expect(
      claudeProvider().auth.apiKey?.resolve({
        ctx: { ...authContext(undefined), env },
        signal: aborted(),
      }),
    ).rejects.toThrow(/Login cancelled/);
    expect(env).not.toHaveBeenCalled();
  });

  it("discards an environment token that arrives after cancellation", async () => {
    const controller = new AbortController();
    const env = vi.fn(async () => {
      controller.abort(new Error("Login cancelled"));
      return "sk-ant-oat01-token";
    });
    await expect(
      claudeProvider().auth.apiKey?.resolve({
        ctx: { ...authContext(undefined), env },
        signal: controller.signal,
      }),
    ).rejects.toThrow(/Login cancelled/);
    expect(env).toHaveBeenCalledOnce();
  });

  it("does not silently replace an empty Pi credential with an environment token", async () => {
    const resolved = await claudeProvider().auth.apiKey?.resolve({
      ctx: authContext("ambient-fixture"),
      credential: { type: "api_key", key: "" },
      signal: signal(),
    });
    expect(resolved).toBeUndefined();
  });

  it("stays unconfigured without a stored credential or environment token", async () => {
    const resolved = await claudeProvider().auth.apiKey?.resolve?.({
      ctx: authContext(undefined),
      signal: signal(),
    });
    expect(resolved).toBeUndefined();
  });

  it("signs in through the Claude login flow", async () => {
    vi.stubEnv(CLAUDE_CODE_OAUTH_TOKEN_ENV, "sk-ant-oat01-env-fixture");
    const prompt = vi.fn<ProviderAuthInteraction["prompt"]>(async () => "setup_token");
    const oauth = claudeProvider().auth.oauth;
    expect(oauth?.loginLabel).toBe("Sign in with a Claude subscription");

    const credential = await oauth?.login({ signal: signal(), prompt, notify: () => {} });

    expect(prompt).toHaveBeenCalledOnce();
    expect(prompt.mock.calls[0]?.[0].type).toBe("select");
    expect(credential).toMatchObject({
      type: "oauth",
      access: "sk-ant-oat01-env-fixture",
      refresh: "",
    });
  });

  it("hands the OAuth access token to Pi as an API key", async () => {
    const oauth = claudeProvider().auth.oauth;
    const auth = await oauth?.toAuth({
      type: "oauth",
      access: "sk-ant-oat01-token",
      refresh: "r",
      expires: Date.now() + 1,
    });
    expect(auth).toEqual({ apiKey: "sk-ant-oat01-token" });
  });

  it("refreshes a rotating Claude OAuth credential", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        access_token: "sk-ant-oat01-next",
        refresh_token: "refresh-2",
        expires_in: 3600,
      }),
    );

    const oauth = claudeProvider().auth.oauth;
    const credential = await oauth?.refresh(
      { type: "oauth", access: "sk-ant-oat01-old", refresh: "refresh-1", expires: Date.now() - 1 },
      signal(),
    );

    expect(credential).toMatchObject({
      type: "oauth",
      access: "sk-ant-oat01-next",
      refresh: "refresh-2",
    });
    expect(credential?.expires).toBeGreaterThan(Date.now());
  });

  it("retains the existing refresh token when the response omits a replacement", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ access_token: "sk-ant-oat01-next", expires_in: 3600 }),
    );
    const credential = await claudeProvider().auth.oauth?.refresh(
      { type: "oauth", access: "sk-ant-oat01-old", refresh: "refresh-1", expires: Date.now() - 1 },
      signal(),
    );

    expect(credential).toMatchObject({ access: "sk-ant-oat01-next", refresh: "refresh-1" });
  });

  it("sends the saved refresh token and stops when Pi cancels the refresh", async () => {
    const sent: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      sent.push(await new Request(url, init).json());
      init?.signal?.throwIfAborted();
      return Response.json({ access_token: "sk-ant-oat01-next", expires_in: 3600 });
    });
    const credential = {
      type: "oauth" as const,
      access: "sk-ant-oat01-old",
      refresh: "refresh-1",
      expires: Date.now() - 1,
    };

    await expect(claudeProvider().auth.oauth?.refresh(credential, aborted())).rejects.toThrow(
      /cancelled/,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ grant_type: "refresh_token", refresh_token: "refresh-1" });
  });

  it("explains that setup tokens cannot be refreshed", async () => {
    const credential = {
      type: "oauth" as const,
      access: "sk-ant-oat01-token",
      refresh: "",
      expires: Date.now() - 1,
    };
    const oauth = claudeProvider().auth.oauth;
    await expect(oauth?.refresh(credential, signal())).rejects.toThrow(/cannot be refreshed/);
  });
});
