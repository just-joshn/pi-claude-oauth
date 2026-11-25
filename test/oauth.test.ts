import {
  deepStrictEqual,
  match,
  notStrictEqual,
  partialDeepStrictEqual,
  rejects,
  strictEqual,
  throws,
} from "node:assert/strict";
import { describe, it } from "node:test";

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
  type FetchLike,
  parseAuthorizationInput,
  parseTokenPayload,
  refreshAccessToken,
} from "../src/oauth.ts";

/** Like a real request, the pending socket keeps the process alive until the abort; Node unrefs `AbortSignal.timeout`. */
const hangUntilAborted: FetchLike = (_url, { signal }) =>
  new Promise((_resolve, reject) => {
    const socket = setTimeout(() => {}, 60_000);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(socket);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });

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

await describe("buildAuthorizeUrl", async () => {
  await it("carries every documented parameter", () => {
    const url = new URL(
      buildAuthorizeUrl({
        redirectUri: "http://localhost:53692/callback",
        state: "state-1",
        challenge: "challenge-1",
      }),
    );

    strictEqual(`${url.origin}${url.pathname}`, CLAUDE_AUTHORIZE_URL);
    strictEqual(url.searchParams.get("code"), "true");
    strictEqual(url.searchParams.get("client_id"), CLAUDE_CLIENT_ID);
    strictEqual(url.searchParams.get("response_type"), "code");
    strictEqual(url.searchParams.get("redirect_uri"), "http://localhost:53692/callback");
    strictEqual(url.searchParams.get("scope"), CLAUDE_SCOPES.join(" "));
    strictEqual(url.searchParams.get("code_challenge"), "challenge-1");
    strictEqual(url.searchParams.get("code_challenge_method"), "S256");
    strictEqual(url.searchParams.get("state"), "state-1");
  });
});

await describe("createAuthorizationSession", async () => {
  await it("creates a verifier and a matching S256 challenge", async () => {
    const { verifier, challenge } = await createAuthorizationSession();

    match(verifier, /^[A-Za-z0-9_-]{43}$/);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    strictEqual(challenge, expected);
  });

  await it("does not reuse a verifier", async () => {
    const first = await createAuthorizationSession();
    const second = await createAuthorizationSession();
    notStrictEqual(first.state, second.state);
    notStrictEqual(first.verifier, second.verifier);
  });
});

await describe("parseAuthorizationInput", async () => {
  await it("reads a full redirect URL", () => {
    deepStrictEqual(
      parseAuthorizationInput("https://platform.claude.com/oauth/code/callback?code=abc&state=def"),
      { code: "abc", state: "def" },
    );
  });

  await it("reads the code#state form Claude shows", () => {
    deepStrictEqual(parseAuthorizationInput("abc#def"), { code: "abc", state: "def" });
  });

  await it("reads a query string without a path", () => {
    deepStrictEqual(parseAuthorizationInput("code=abc&state=def"), { code: "abc", state: "def" });
  });

  await it("reads a bare code", () => {
    deepStrictEqual(parseAuthorizationInput("  abc  "), { code: "abc" });
  });

  await it("returns nothing for empty input", () => {
    deepStrictEqual(parseAuthorizationInput("   "), {});
  });
});

await describe("parseTokenPayload", async () => {
  await it("accepts a bearer token response", () => {
    deepStrictEqual(parseTokenPayload(tokenBody), {
      access: "sk-ant-oat01-access",
      refresh: "sk-ant-ort01-refresh",
      expiresIn: 3600,
    });
  });

  await it("allows a refresh response without a new refresh token", () => {
    deepStrictEqual(parseTokenPayload({ access_token: "a", expires_in: 60 }), {
      access: "a",
      refresh: undefined,
      expiresIn: 60,
    });
  });

  await it("assumes an hour when expiry is missing", () => {
    strictEqual(parseTokenPayload({ access_token: "a" }).expiresIn, 3600);
  });

  await it("rejects a non-object response", () => {
    throws(() => parseTokenPayload("nope"), ClaudeAuthError);
  });

  await it("rejects a response without an access token", () => {
    throws(() => parseTokenPayload({ refresh_token: "r" }), /access token/);
  });

  await it("rejects an unsupported token type", () => {
    throws(
      () => parseTokenPayload({ access_token: "a", token_type: "mac" }),
      /unsupported token type/,
    );
  });
});

await describe("exchangeAuthorizationCode", async () => {
  await it("posts the documented authorization_code grant", async () => {
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

    strictEqual(payload.access, "sk-ant-oat01-access");
    strictEqual(captured?.url, CLAUDE_TOKEN_URL);
    deepStrictEqual(captured.body, {
      grant_type: "authorization_code",
      client_id: CLAUDE_CLIENT_ID,
      code: "abc",
      state: "state-123",
      redirect_uri: "http://localhost:1/callback",
      code_verifier: "verifier",
    });
    partialDeepStrictEqual(captured.headers, {
      "content-type": "application/json",
      accept: "application/json",
    });
  });

  await it("explains an invalid_grant so the user knows to sign in again", async () => {
    await rejects(
      exchangeAuthorizationCode(grant, {
        signal: signal(),
        fetch: async () => json({ error: "invalid_grant" }, 400),
      }),
      /invalid_grant.*\/login claude/s,
    );
  });

  await it("reports rate limiting", async () => {
    await rejects(
      exchangeAuthorizationCode(grant, { signal: signal(), fetch: async () => json({}, 429) }),
      /rate limiting/,
    );
  });

  await it("includes the provider error description without echoing the body", async () => {
    await rejects(
      exchangeAuthorizationCode(grant, {
        signal: signal(),
        fetch: async () =>
          json({ error: "invalid_request", error_description: "bad redirect" }, 400),
      }),
      { message: "Claude sign-in failed (HTTP 400): invalid_request: bad redirect." },
    );
  });

  await it("reads Anthropic's object-shaped error payloads", async () => {
    await rejects(
      exchangeAuthorizationCode(grant, {
        signal: signal(),
        fetch: async () =>
          json({ error: { type: "invalid_grant", message: "Refresh token is invalid" } }, 400),
      }),
      /invalid_grant.*\/login claude/s,
    );
  });

  await it("survives a non-JSON error body", async () => {
    await rejects(
      exchangeAuthorizationCode(grant, {
        signal: signal(),
        fetch: async () => new Response("<html>oops</html>", { status: 500 }),
      }),
      /HTTP 500/,
    );
  });

  await it("reports an unreachable token endpoint", async () => {
    await rejects(
      exchangeAuthorizationCode(grant, {
        signal: signal(),
        fetch: async () => {
          throw new Error("getaddrinfo ENOTFOUND");
        },
      }),
      /Could not reach/,
    );
  });

  await it("reports cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await rejects(
      exchangeAuthorizationCode(grant, {
        signal: controller.signal,
        fetch: async () => {
          throw new Error("aborted");
        },
      }),
      /cancelled/,
    );
  });

  await it("reports a timeout", async () => {
    await rejects(
      refreshAccessToken("refresh", {
        signal: signal(),
        timeoutMs: 5,
        fetch: hangUntilAborted,
      }),
      /did not answer/,
    );
  });
});

await describe("refreshAccessToken", async () => {
  await it("reports the caller's timeout signal as a timeout, not a cancellation", async () => {
    await rejects(
      refreshAccessToken("refresh", {
        signal: AbortSignal.timeout(5),
        fetch: hangUntilAborted,
      }),
      /did not answer/,
    );
  });

  await it("redacts submitted secrets that the server echoes in an error", async () => {
    await rejects(
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
      {
        message: "Claude sign-in failed (HTTP 400): invalid_request: bad refresh_token=[redacted].",
      },
    );
  });
});

await describe("copy code redirect", async () => {
  await it("matches the Claude Code manual redirect", () => {
    strictEqual(CLAUDE_COPY_CODE_REDIRECT_URI, "https://platform.claude.com/oauth/code/callback");
  });
});
