import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  CLAUDE_AUTHORIZE_URL,
  CLAUDE_CLIENT_ID,
  CLAUDE_COPY_CODE_REDIRECT_URI,
  CLAUDE_SCOPES,
  CLAUDE_TOKEN_URL,
  ClaudeAuthError,
  createPkce,
  exchangeAuthorizationCode,
  parseAuthorizationInput,
  parseTokenPayload,
  refreshAccessToken,
} from "../extensions/claude-oauth/oauth";

const signal = () => new AbortController().signal;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const tokenBody = {
  access_token: "sk-ant-oat01-access",
  refresh_token: "sk-ant-ort01-refresh",
  expires_in: 3600,
  token_type: "Bearer",
};

describe("buildAuthorizeUrl", () => {
  it("carries every documented parameter", () => {
    const url = new URL(
      buildAuthorizeUrl({ redirectUri: "http://localhost:53692/callback", state: "state-1", challenge: "challenge-1" }),
    );

    expect(`${url.origin}${url.pathname}`).toBe(CLAUDE_AUTHORIZE_URL);
    expect(url.searchParams.get("code")).toBe("true");
    expect(url.searchParams.get("client_id")).toBe(CLAUDE_CLIENT_ID);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:53692/callback");
    expect(url.searchParams.get("scope")).toBe(CLAUDE_SCOPES.join(" "));
    expect(url.searchParams.get("code_challenge")).toBe("challenge-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state-1");
  });

  it("honours an explicit scope override", () => {
    const url = new URL(
      buildAuthorizeUrl({ redirectUri: "https://example.test/cb", state: "s", challenge: "c", scopes: ["user:inference"] }),
    );
    expect(url.searchParams.get("scope")).toBe("user:inference");
  });
});

describe("createPkce", () => {
  it("creates a verifier and a matching S256 challenge", async () => {
    const { verifier, challenge } = await createPkce();

    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(challenge).toBe(expected);
  });

  it("does not reuse a verifier", async () => {
    const first = await createPkce();
    const second = await createPkce();
    expect(first.verifier).not.toBe(second.verifier);
  });
});

describe("parseAuthorizationInput", () => {
  it("reads a full redirect URL", () => {
    expect(parseAuthorizationInput("https://platform.claude.com/oauth/code/callback?code=abc&state=def")).toEqual({
      code: "abc",
      state: "def",
    });
  });

  it("reads the code#state form Claude shows", () => {
    expect(parseAuthorizationInput("abc#def")).toEqual({ code: "abc", state: "def" });
  });

  it("reads a query string without a path", () => {
    expect(parseAuthorizationInput("code=abc&state=def")).toEqual({ code: "abc", state: "def" });
  });

  it("reads a bare code", () => {
    expect(parseAuthorizationInput("  abc  ")).toEqual({ code: "abc" });
  });

  it("returns nothing for empty input", () => {
    expect(parseAuthorizationInput("   ")).toEqual({});
  });
});

describe("parseTokenPayload", () => {
  it("accepts a bearer token response", () => {
    expect(parseTokenPayload(tokenBody)).toEqual({
      access: "sk-ant-oat01-access",
      refresh: "sk-ant-ort01-refresh",
      expiresIn: 3600,
    });
  });

  it("allows a refresh response without a new refresh token", () => {
    expect(parseTokenPayload({ access_token: "a", expires_in: 60 })).toEqual({
      access: "a",
      refresh: undefined,
      expiresIn: 60,
    });
  });

  it("assumes an hour when expiry is missing", () => {
    expect(parseTokenPayload({ access_token: "a" }).expiresIn).toBe(3600);
  });

  it("rejects a non-object response", () => {
    expect(() => parseTokenPayload("nope")).toThrow(ClaudeAuthError);
  });

  it("rejects a response without an access token", () => {
    expect(() => parseTokenPayload({ refresh_token: "r" })).toThrow(/access token/);
  });

  it("rejects an unsupported token type", () => {
    expect(() => parseTokenPayload({ access_token: "a", token_type: "mac" })).toThrow(/unsupported token type/);
  });
});

describe("exchangeAuthorizationCode", () => {
  it("posts the documented authorization_code grant", async () => {
    let captured: { url: string; body: unknown; headers: unknown } | undefined;
    const payload = await exchangeAuthorizationCode(
      { code: "abc", state: "state", verifier: "verifier", redirectUri: "http://localhost:1/callback" },
      {
        signal: signal(),
        fetch: async (input, init) => {
          captured = { url: String(input), body: JSON.parse(String(init?.body)), headers: init?.headers };
          return json(tokenBody);
        },
      },
    );

    expect(payload.access).toBe("sk-ant-oat01-access");
    expect(captured?.url).toBe(CLAUDE_TOKEN_URL);
    expect(captured?.body).toEqual({
      grant_type: "authorization_code",
      client_id: CLAUDE_CLIENT_ID,
      code: "abc",
      state: "state",
      redirect_uri: "http://localhost:1/callback",
      code_verifier: "verifier",
    });
    expect(captured?.headers).toMatchObject({ "content-type": "application/json", accept: "application/json" });
  });

  it("explains an invalid_grant so the user knows to sign in again", async () => {
    await expect(
      exchangeAuthorizationCode(
        { code: "abc", state: "s", verifier: "v", redirectUri: "http://localhost:1/callback" },
        { signal: signal(), fetch: async () => json({ error: "invalid_grant" }, 400) },
      ),
    ).rejects.toThrow(/invalid_grant.*\/login claude/s);
  });

  it("reports rate limiting", async () => {
    await expect(
      exchangeAuthorizationCode(
        { code: "abc", state: "s", verifier: "v", redirectUri: "http://localhost:1/callback" },
        { signal: signal(), fetch: async () => json({}, 429) },
      ),
    ).rejects.toThrow(/rate limiting/);
  });

  it("includes the provider error description without echoing the body", async () => {
    await expect(
      exchangeAuthorizationCode(
        { code: "abc", state: "s", verifier: "v", redirectUri: "http://localhost:1/callback" },
        {
          signal: signal(),
          fetch: async () => json({ error: "invalid_request", error_description: "bad redirect" }, 400),
        },
      ),
    ).rejects.toThrow("Claude sign-in failed (HTTP 400): invalid_request: bad redirect.");
  });

  it("reads Anthropic's object-shaped error payloads", async () => {
    await expect(
      exchangeAuthorizationCode(
        { code: "abc", state: "s", verifier: "v", redirectUri: "http://localhost:1/callback" },
        {
          signal: signal(),
          fetch: async () => json({ error: { type: "invalid_grant", message: "Refresh token is invalid" } }, 400),
        },
      ),
    ).rejects.toThrow(/invalid_grant.*\/login claude/s);
  });

  it("survives a non-JSON error body", async () => {
    await expect(
      exchangeAuthorizationCode(
        { code: "abc", state: "s", verifier: "v", redirectUri: "http://localhost:1/callback" },
        { signal: signal(), fetch: async () => new Response("<html>oops</html>", { status: 500 }) },
      ),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("reports an unreachable token endpoint", async () => {
    await expect(
      exchangeAuthorizationCode(
        { code: "abc", state: "s", verifier: "v", redirectUri: "http://localhost:1/callback" },
        {
          signal: signal(),
          fetch: async () => {
            throw new Error("getaddrinfo ENOTFOUND");
          },
        },
      ),
    ).rejects.toThrow(/Could not reach/);
  });

  it("reports cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      exchangeAuthorizationCode(
        { code: "abc", state: "s", verifier: "v", redirectUri: "http://localhost:1/callback" },
        {
          signal: controller.signal,
          fetch: async () => {
            throw new Error("aborted");
          },
        },
      ),
    ).rejects.toThrow(/cancelled/);
  });

  it("reports a timeout", async () => {
    await expect(
      refreshAccessToken("refresh", {
        signal: signal(),
        timeoutMs: 5,
        fetch: (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      }),
    ).rejects.toThrow(/did not answer/);
  });
});

describe("refreshAccessToken", () => {
  it("posts the documented refresh_token grant", async () => {
    let body: unknown;
    await refreshAccessToken("sk-ant-ort01-refresh", {
      signal: signal(),
      fetch: async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return json({ access_token: "next", expires_in: 60 });
      },
    });

    expect(body).toEqual({ grant_type: "refresh_token", client_id: CLAUDE_CLIENT_ID, refresh_token: "sk-ant-ort01-refresh" });
  });
});

describe("copy code redirect", () => {
  it("matches the Claude Code manual redirect", () => {
    expect(CLAUDE_COPY_CODE_REDIRECT_URI).toBe("https://platform.claude.com/oauth/code/callback");
  });
});
