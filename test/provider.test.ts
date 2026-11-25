import {
  deepStrictEqual,
  ok,
  partialDeepStrictEqual,
  rejects,
  strictEqual,
} from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import { CLAUDE_CODE_OAUTH_TOKEN_ENV } from "../src/credential.ts";
import { claudeProvider } from "../src/provider.ts";

const signal = () => new AbortController().signal;

const authContext = (value: string | undefined) => ({
  env: async () => value,
  fileExists: async () => false,
});

afterEach(() => mock.restoreAll());

await describe("claudeProvider", async () => {
  await it("registers a subscription provider with the Anthropic streaming implementation", () => {
    const provider = claudeProvider();
    strictEqual(provider.id, "claude");
    strictEqual(provider.name, "Claude (Pro/Max/Ultra)");
    strictEqual(provider.baseUrl, "https://api.anthropic.com");
    strictEqual(provider.auth.oauth?.isSubscription, true);
    strictEqual(provider.auth.oauth.name, "Claude (Pro/Max/Ultra)");
    ok(provider.getModels().length > 10);
  });

  await it("resolves the documented CLAUDE_CODE_OAUTH_TOKEN variable", async () => {
    const apiKey = claudeProvider().auth.apiKey;
    strictEqual(typeof apiKey?.resolve, "function");

    const resolved = await apiKey?.resolve({
      ctx: authContext("sk-ant-oat01-token"),
      signal: signal(),
    });
    deepStrictEqual(resolved, {
      auth: { apiKey: "sk-ant-oat01-token" },
      source: CLAUDE_CODE_OAUTH_TOKEN_ENV,
    });
  });

  for (const ambient of [undefined, "ambient-fixture"]) {
    // oxlint-disable-next-line no-await-in-loop -- Registering a test inside a suite resolves immediately.
    await it(`uses Pi's supplied key before the environment (${String(ambient)})`, async () => {
      const env = mock.fn(async () => ambient);
      const resolved = await claudeProvider().auth.apiKey?.resolve({
        ctx: { ...authContext(ambient), env },
        credential: { type: "api_key", key: "explicit-fixture" },
        signal: signal(),
      });
      strictEqual(resolved?.auth.apiKey, "explicit-fixture");
      strictEqual(env.mock.callCount(), 0);
    });
  }

  await it("does not silently replace an empty Pi credential with an environment token", async () => {
    const resolved = await claudeProvider().auth.apiKey?.resolve({
      ctx: authContext("ambient-fixture"),
      credential: { type: "api_key", key: "" },
      signal: signal(),
    });
    strictEqual(resolved, undefined);
  });

  await it("stays unconfigured without a stored credential or environment token", async () => {
    const resolved = await claudeProvider().auth.apiKey?.resolve({
      ctx: authContext(undefined),
      signal: signal(),
    });
    strictEqual(resolved, undefined);
  });

  await it("hands the OAuth access token to Pi as an API key", async () => {
    const oauth = claudeProvider().auth.oauth;
    const auth = await oauth?.toAuth({
      type: "oauth",
      access: "sk-ant-oat01-token",
      refresh: "r",
      expires: Date.now() + 1,
    });
    deepStrictEqual(auth, { apiKey: "sk-ant-oat01-token" });
  });

  await it("refreshes a rotating Claude OAuth credential", async () => {
    mock.method(globalThis, "fetch", async () =>
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

    partialDeepStrictEqual(credential, {
      type: "oauth",
      access: "sk-ant-oat01-next",
      refresh: "refresh-2",
    });
    ok((credential?.expires ?? 0) > Date.now());
  });

  await it("retains the existing refresh token when the response omits a replacement", async () => {
    mock.method(globalThis, "fetch", async () =>
      Response.json({ access_token: "sk-ant-oat01-next", expires_in: 3600 }),
    );
    const credential = await claudeProvider().auth.oauth?.refresh(
      { type: "oauth", access: "sk-ant-oat01-old", refresh: "refresh-1", expires: Date.now() - 1 },
      signal(),
    );

    partialDeepStrictEqual(credential, { access: "sk-ant-oat01-next", refresh: "refresh-1" });
  });

  await it("explains that setup tokens cannot be refreshed", async () => {
    const credential = {
      type: "oauth" as const,
      access: "sk-ant-oat01-token",
      refresh: "",
      expires: Date.now() - 1,
    };
    const oauth = claudeProvider().auth.oauth;
    if (!oauth) throw new Error("expected OAuth auth");
    await rejects(oauth.refresh(credential, signal()), /cannot be refreshed/);
  });
});
