import { afterEach, describe, expect, it, vi } from "vitest";
import { claudeProvider, CLAUDE_CODE_OAUTH_TOKEN_ENV } from "../extensions/claude-oauth/provider";
import { isSetupTokenCredential } from "../extensions/claude-oauth/credential";

const signal = () => new AbortController().signal;

const authContext = (value: string | undefined) => ({
  env: async () => value,
  fileExists: async () => false,
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    const resolve = claudeProvider().auth.apiKey?.resolve;
    expect(resolve).toBeDefined();

    const resolved = await resolve?.({ ctx: authContext("sk-ant-oat01-token"), signal: signal() });
    expect(resolved).toEqual({ auth: { apiKey: "sk-ant-oat01-token" }, source: CLAUDE_CODE_OAUTH_TOKEN_ENV });
  });

  it("stays unconfigured without a stored credential or environment token", async () => {
    const resolved = await claudeProvider().auth.apiKey?.resolve?.({ ctx: authContext(undefined), signal: signal() });
    expect(resolved).toBeUndefined();
  });

  it("hands the OAuth access token to Pi as an API key", async () => {
    const oauth = claudeProvider().auth.oauth;
    const auth = await oauth?.toAuth({ type: "oauth", access: "sk-ant-oat01-token", refresh: "r", expires: Date.now() + 1 });
    expect(auth).toEqual({ apiKey: "sk-ant-oat01-token" });
  });

  it("refreshes a rotating Claude OAuth credential", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ access_token: "sk-ant-oat01-next", refresh_token: "refresh-2", expires_in: 3600 }),
          { status: 200 },
        ),
      ),
    );

    const oauth = claudeProvider().auth.oauth;
    const credential = await oauth?.refresh(
      { type: "oauth", access: "sk-ant-oat01-old", refresh: "refresh-1", expires: Date.now() - 1 },
      signal(),
    );

    expect(credential).toMatchObject({ type: "oauth", access: "sk-ant-oat01-next", refresh: "refresh-2" });
    expect(credential?.expires).toBeGreaterThan(Date.now());
  });

  it("explains that setup tokens cannot be refreshed", async () => {
    const credential = { type: "oauth" as const, access: "sk-ant-oat01-token", refresh: "", expires: Date.now() - 1 };
    expect(isSetupTokenCredential(credential)).toBe(true);

    const oauth = claudeProvider().auth.oauth;
    await expect(oauth?.refresh(credential, signal())).rejects.toThrow(/cannot be refreshed/);
  });
});
