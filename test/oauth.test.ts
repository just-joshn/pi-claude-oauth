import { describe, expect, it } from "vitest";

import {
  buildAuthorizeUrl,
  CLAUDE_AUTHORIZE_URL,
  CLAUDE_CLIENT_ID,
  CLAUDE_COPY_CODE_REDIRECT_URI,
  CLAUDE_SCOPES,
  CLAUDE_TOKEN_URL,
  ClaudeAuthError,
  createAuthorizationSession,
  exchangeAuthorizationCode,
  parseAuthorizationInput,
  parseTokenPayload,
  refreshAccessToken,
} from "../src/oauth.ts";

const signal = () => new AbortController().signal;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const grant = {
  code: "auth-code-123",
  state: "state-123",
  verifier: "pkce-verifier-123",
  redirectUri: "http://localhost:1/callback",
};

const tokenBody = {
  access_token: "sk-ant-oat01-access",
  refresh_token: "sk-ant-ort01-refresh",
  expires_in: 3600,
  token_type: "Bearer",
};

describe("buildAuthorizeUrl", () => {
  it("carries every documented parameter", () => {
    const url = new URL(
      buildAuthorizeUrl({
        redirectUri: "http://localhost:53692/callback",
        state: "state-1",
        challenge: "challenge-1",
      }),
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
});

describe("createAuthorizationSession", () => {
  it("creates a verifier and a matching S256 challenge", async () => {
    const { verifier, challenge } = await createAuthorizationSession();

    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(challenge).toBe(expected);
  });

  it("does not reuse a verifier", async () => {
    const first = await createAuthorizationSession();
    const second = await createAuthorizationSession();
    expect(first.state).not.toBe(second.state);
    expect(first.verifier).not.toBe(second.verifier);
  });
});

describe("parseAuthorizationInput", () => {
  it("reads a full redirect URL", () => {
    expect(
      parseAuthorizationInput("https://platform.claude.com/oauth/code/callback?code=abc&state=def"),
    ).toEqual({
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
    expect(() => parseTokenPayload({ access_token: "a", token_type: "mac" })).toThrow(
      /unsupported token type/,
    );
  });
});

describe("exchangeAuthorizationCode", () => {
  it("posts the documented authorization_code grant", async () => {
    let captured: { url: string; body: unknown; headers: unknown } | undefined;
    const payload = await exchangeAuthorizationCode(
      {
        code: "abc",
        state: "state-123",
        verifier: "verifier",
        redirectUri: "http://localhost:1/callback",
      },
      {
        signal: signal(),
        fetch: async (url, init) => {
          captured = { url, body: await new Request(url, init).json(), headers: init.headers };
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
      state: "state-123",
      redirect_uri: "http://localhost:1/callback",
      code_verifier: "verifier",
    });
    expect(captured?.headers).toMatchObject({
      "content-type": "application/json",
      accept: "application/json",
    });
  });

  it("explains an invalid_grant so the user knows to sign in again", async () => {
    await expect(
      exchangeAuthorizationCode(grant, {
        signal: signal(),
        fetch: async () => json({ error: "invalid_grant" }, 400),
      }),
    ).rejects.toThrow(/invalid_grant.*\/login claude/s);
  });

  it("reports rate limiting", async () => {
    await expect(
      exchangeAuthorizationCode(grant, { signal: signal(), fetch: async () => json({}, 429) }),
    ).rejects.toThrow(/rate limiting/);
  });

  it("includes the provider error description without echoing the body", async () => {
    await expect(
      exchangeAuthorizationCode(grant, {
        signal: signal(),
        fetch: async () =>
          json({ error: "invalid_request", error_description: "bad redirect" }, 400),
      }),
    ).rejects.toThrow("Claude sign-in failed (HTTP 400): invalid_request: bad redirect.");
  });

  it("reads Anthropic's object-shaped error payloads", async () => {
    await expect(
      exchangeAuthorizationCode(grant, {
        signal: signal(),
        fetch: async () =>
          json({ error: { type: "invalid_grant", message: "Refresh token is invalid" } }, 400),
      }),
    ).rejects.toThrow(/invalid_grant.*\/login claude/s);
  });

  it("survives a non-JSON error body", async () => {
    await expect(
      exchangeAuthorizationCode(grant, {
        signal: signal(),
        fetch: async () => new Response("<html>oops</html>", { status: 500 }),
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("reports an unreachable token endpoint", async () => {
    await expect(
      exchangeAuthorizationCode(grant, {
        signal: signal(),
        fetch: async () => {
          throw new Error("getaddrinfo ENOTFOUND");
        },
      }),
    ).rejects.toThrow(/Could not reach/);
  });

  it("reports cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      exchangeAuthorizationCode(grant, {
        signal: controller.signal,
        fetch: async () => {
          throw new Error("aborted");
        },
      }),
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
  it("reports the caller's timeout signal as a timeout, not a cancellation", async () => {
    await expect(
      refreshAccessToken("refresh", {
        signal: AbortSignal.timeout(5),
        fetch: (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      }),
    ).rejects.toThrow(/did not answer/);
  });

  it("redacts submitted secrets that the server echoes in an error", async () => {
    await expect(
      refreshAccessToken("sk-ant-ort01-refresh", {
        signal: signal(),
        fetch: async () =>
          json(
            {
              error: "invalid_request",
              error_description: "bad refresh_token=sk-ant-ort01-refresh",
            },
            400,
          ),
      }),
    ).rejects.toThrow(
      "Claude sign-in failed (HTTP 400): invalid_request: bad refresh_token=[redacted].",
    );
  });
});

describe("copy code redirect", () => {
  it("matches the Claude Code manual redirect", () => {
    expect(CLAUDE_COPY_CODE_REDIRECT_URI).toBe("https://platform.claude.com/oauth/code/callback");
  });
});
