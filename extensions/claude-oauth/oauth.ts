/**
 * Claude subscription OAuth protocol.
 *
 * Constants mirror the current Claude Code client (2.1.331) and the flows that
 * Anthropic documents:
 * - https://code.claude.com/docs/en/authentication
 * - https://code.claude.com/docs/en/cli-reference (`claude setup-token`)
 * - https://code.claude.com/docs/en/env-vars (`CLAUDE_CODE_OAUTH_TOKEN`)
 */

export const CLAUDE_AUTHORIZE_URL = "https://claude.com/cai/oauth/authorize";
export const CLAUDE_TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
export const CLAUDE_COPY_CODE_REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";

/** Public PKCE client id that Claude Code itself uses. It is not a secret. */
export const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

/** Minimum Claude Code scope set that covers inference and account lookup. */
export const CLAUDE_SCOPES = ["user:profile", "user:inference", "user:sessions:claude_code"] as const;

/** Beta flag the Messages API requires for OAuth access tokens. */
export const CLAUDE_OAUTH_BETA = "oauth-2025-04-20";

/** Every Claude subscription token, including `claude setup-token` output, starts with this. */
export const CLAUDE_TOKEN_PREFIX = "sk-ant-oat";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TOKEN_LIFETIME_SECONDS = 3_600;

export type FetchLike = typeof fetch;

export class ClaudeAuthError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ClaudeAuthError";
  }
}

export interface TokenPayload {
  readonly access: string;
  readonly refresh?: string;
  readonly expiresIn: number;
}

export interface AuthorizationCode {
  readonly code: string;
  readonly state: string;
  readonly verifier: string;
  readonly redirectUri: string;
}

export interface AuthorizeUrlOptions {
  readonly redirectUri: string;
  readonly state: string;
  readonly challenge: string;
  readonly scopes?: readonly string[];
}

export interface Pkce {
  readonly verifier: string;
  readonly challenge: string;
}

export interface TokenRequestOptions {
  readonly signal: AbortSignal;
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createPkce(): Promise<Pkce> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export function buildAuthorizeUrl(options: AuthorizeUrlOptions): string {
  const params = new URLSearchParams({
    code: "true",
    client_id: CLAUDE_CLIENT_ID,
    response_type: "code",
    redirect_uri: options.redirectUri,
    scope: (options.scopes ?? CLAUDE_SCOPES).join(" "),
    code_challenge: options.challenge,
    code_challenge_method: "S256",
    state: options.state,
  });
  return `${CLAUDE_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Accepts what a browser redirect, the Claude Code success page, or a terminal
 * user can hand over: a full redirect URL, `code#state`, a query string, or a
 * bare authorization code.
 */
export function parseAuthorizationInput(input: string): { code?: string; state?: string } {
  const value = input.trim();
  if (!value) return {};

  try {
    const url = new URL(value);
    return {
      code: url.searchParams.get("code") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
    };
  } catch {
    // Not a URL; try the other shapes below.
  }

  if (value.includes("#")) {
    const [code, state] = value.split("#", 2);
    return { code: code || undefined, state: state || undefined };
  }

  if (value.includes("code=")) {
    const params = new URLSearchParams(value);
    return {
      code: params.get("code") ?? undefined,
      state: params.get("state") ?? undefined,
    };
  }

  return { code: value };
}

export function parseTokenPayload(value: unknown): TokenPayload {
  if (!isRecord(value)) throw new ClaudeAuthError("Claude returned an unexpected token response.");

  const access = value.access_token;
  if (typeof access !== "string" || access.length === 0) {
    throw new ClaudeAuthError("Claude token response did not include an access token.");
  }

  const tokenType = value.token_type;
  if (typeof tokenType === "string" && tokenType.toLowerCase() !== "bearer") {
    throw new ClaudeAuthError(`Claude token response used unsupported token type "${tokenType}".`);
  }

  const expiresIn =
    typeof value.expires_in === "number" && Number.isFinite(value.expires_in) && value.expires_in > 0
      ? value.expires_in
      : DEFAULT_TOKEN_LIFETIME_SECONDS;

  const refresh =
    typeof value.refresh_token === "string" && value.refresh_token.length > 0 ? value.refresh_token : undefined;

  return { access, refresh, expiresIn };
}

function failureDetails(payload: unknown): { code?: string; description?: string } {
  if (!isRecord(payload)) return {};
  const description =
    typeof payload.error_description === "string" ? payload.error_description : undefined;
  const error = payload.error;

  if (typeof error === "string") return { code: error, description };
  if (isRecord(error)) {
    return {
      code: typeof error.type === "string" ? error.type : undefined,
      description: typeof error.message === "string" ? error.message : description,
    };
  }
  return { description };
}

function describeFailure(status: number, payload: unknown): string {
  const { code, description } = failureDetails(payload);

  if (code === "invalid_grant") {
    return "Claude rejected the saved sign-in (invalid_grant). Run `/login claude` to sign in again.";
  }
  if (status === 429) {
    return "Claude is rate limiting sign-in (HTTP 429). Wait a moment and try again.";
  }
  const detail = [code, description].filter((part): part is string => Boolean(part)).join(": ");
  return `Claude sign-in failed (HTTP ${status})${detail ? `: ${detail}` : ""}.`;
}

async function requestToken(body: Record<string, string>, options: TokenRequestOptions): Promise<TokenPayload> {
  const fetchImpl = options.fetch ?? fetch;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(CLAUDE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([options.signal, timeout]),
    });
  } catch (error) {
    if (options.signal.aborted) throw new ClaudeAuthError("Claude sign-in was cancelled.", { cause: error });
    if (timeout.aborted) {
      throw new ClaudeAuthError(`Claude did not answer ${CLAUDE_TOKEN_URL} in time. Try again.`, { cause: error });
    }
    throw new ClaudeAuthError(`Could not reach ${CLAUDE_TOKEN_URL}.`, { cause: error });
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    payload = undefined;
  }

  if (!response.ok) throw new ClaudeAuthError(describeFailure(response.status, payload));
  return parseTokenPayload(payload);
}

export function exchangeAuthorizationCode(input: AuthorizationCode, options: TokenRequestOptions): Promise<TokenPayload> {
  return requestToken(
    {
      grant_type: "authorization_code",
      client_id: CLAUDE_CLIENT_ID,
      code: input.code,
      state: input.state,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
    },
    options,
  );
}

export function refreshAccessToken(refreshToken: string, options: TokenRequestOptions): Promise<TokenPayload> {
  return requestToken(
    { grant_type: "refresh_token", client_id: CLAUDE_CLIENT_ID, refresh_token: refreshToken },
    options,
  );
}
