export const CLAUDE_AUTHORIZE_URL = "https://claude.com/cai/oauth/authorize";
export const CLAUDE_TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
export const CLAUDE_COPY_CODE_REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";

export const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

export const CLAUDE_SCOPES = [
  "user:profile",
  "user:inference",
  "user:sessions:claude_code",
] as const;

export const CLAUDE_OAUTH_BETA = "oauth-2025-04-20";

export const CLAUDE_TOKEN_PREFIX = "sk-ant-oat";

const AUTHORIZE_PATH = "/oauth/authorize";
const TOKEN_TIMEOUT_MS = 30_000;
const DEFAULT_TOKEN_LIFETIME_SECONDS = 3_600;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class ClaudeAuthError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ClaudeAuthError";
  }
}

export class InvalidPasteError extends ClaudeAuthError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPasteError";
  }
}

interface TokenPayload {
  readonly access: string;
  readonly refresh?: string | undefined;
  readonly expiresIn: number;
}

export type RefreshableTokenPayload = TokenPayload & { readonly refresh: string };

export interface AuthorizationGrant {
  readonly code: string;
  readonly state: string;
  readonly verifier: string;
  readonly redirectUri: string;
}

interface AuthorizeUrlOptions {
  readonly redirectUri: string;
  readonly state: string;
  readonly challenge: string;
}

interface RequestOptions {
  readonly signal?: AbortSignal;
  readonly fetch?: FetchLike | undefined;
  readonly timeoutMs: number;
  readonly includeErrorBody?: boolean;
}

interface TokenRequestOptions {
  readonly signal: AbortSignal;
  readonly fetch?: FetchLike | undefined;
  readonly timeoutMs?: number;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const randomNonce = (): string => base64Url(crypto.getRandomValues(new Uint8Array(32)));

export async function createAuthorizationSession() {
  const verifier = randomNonce();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { state: randomNonce(), verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export function buildAuthorizeUrl(options: AuthorizeUrlOptions): string {
  const params = new URLSearchParams({
    code: "true",
    client_id: CLAUDE_CLIENT_ID,
    response_type: "code",
    redirect_uri: options.redirectUri,
    scope: CLAUDE_SCOPES.join(" "),
    code_challenge: options.challenge,
    code_challenge_method: "S256",
    state: options.state,
  });
  return `${CLAUDE_AUTHORIZE_URL}?${params.toString()}`;
}

const CLOSING_WRAPPERS: Readonly<Record<string, string>> = {
  "<": ">",
  '"': '"',
  "'": "'",
  "`": "`",
};

function unwrap(value: string): string {
  const close = CLOSING_WRAPPERS[value.charAt(0)];
  if (close && value.length > 1 && value.endsWith(close)) {
    return value.slice(1, -1);
  }
  return value;
}

export function authorizationFailure(
  params: URLSearchParams,
): { title: string; detail: string; message: string } | undefined {
  const error = params.get("error");
  if (!error) {
    return undefined;
  }
  const detail = params.get("error_description") || error;
  if (error === "access_denied") {
    return { title: "Sign-in declined", detail, message: `Claude sign-in was declined: ${detail}` };
  }
  return { title: "Sign-in failed", detail, message: `Claude sign-in failed: ${detail}` };
}

export function parseAuthorizationInput(input: string): {
  code?: string | undefined;
  state?: string | undefined;
  failure?: string | undefined;
} {
  const value = unwrap(input.replace(/\s+/g, ""));
  if (!value) return {};

  const queryStart = value.indexOf("?");
  if (queryStart !== -1 || /(^|&)(code|error)=/.test(value)) {
    const [query = ""] = value.slice(queryStart + 1).split("#", 1);
    const params = new URLSearchParams(query);
    if (params.has("client_id") || value.slice(0, queryStart).endsWith(AUTHORIZE_PATH)) {
      throw new InvalidPasteError(
        "That is the sign-in link. Paste the address you land on after signing in.",
      );
    }
    return {
      code: params.get("code") ?? undefined,
      state: params.get("state") ?? undefined,
      failure: authorizationFailure(params)?.message,
    };
  }

  if (value.includes("#")) {
    const [code, state] = value.split("#", 2);
    return { code: code || undefined, state: state || undefined };
  }

  return { code: value };
}

export function parseTokenPayload(value: unknown): TokenPayload {
  if (!isRecord(value)) throw new ClaudeAuthError("Claude returned an unexpected token response.");

  const access = value["access_token"];
  if (typeof access !== "string" || access.length === 0) {
    throw new ClaudeAuthError("Claude token response did not include an access token.");
  }

  const tokenType = value["token_type"];
  if (typeof tokenType === "string" && tokenType.toLowerCase() !== "bearer") {
    throw new ClaudeAuthError(`Claude token response used unsupported token type "${tokenType}".`);
  }

  const expiresIn =
    typeof value["expires_in"] === "number" &&
    Number.isFinite(value["expires_in"]) &&
    value["expires_in"] > 0
      ? value["expires_in"]
      : DEFAULT_TOKEN_LIFETIME_SECONDS;

  const refresh =
    typeof value["refresh_token"] === "string" && value["refresh_token"].length > 0
      ? value["refresh_token"]
      : undefined;

  return { access, refresh, expiresIn };
}

function failureDetails(payload: unknown): {
  code?: string | undefined;
  description?: string | undefined;
} {
  if (!isRecord(payload)) return {};
  const description =
    typeof payload["error_description"] === "string" ? payload["error_description"] : undefined;
  const error = payload["error"];

  if (typeof error === "string") return { code: error, description };
  if (isRecord(error)) {
    return {
      code: typeof error["type"] === "string" ? error["type"] : undefined,
      description: typeof error["message"] === "string" ? error["message"] : description,
    };
  }
  return { description };
}

const SECRET_FIELDS = ["code", "state", "code_verifier", "refresh_token"] as const;

function redact(serverText: string, sent: Record<string, string>): string {
  return SECRET_FIELDS.reduce((text, field) => {
    const secret = sent[field];
    return secret ? text.replaceAll(secret, "[redacted]") : text;
  }, serverText);
}

function describeFailure(status: number, payload: unknown, sent: Record<string, string>): string {
  const { code, description } = failureDetails(payload);

  if (code === "invalid_grant") {
    return sent["grant_type"] === "authorization_code"
      ? "Claude rejected the authorization code (invalid_grant). It may have expired or already been used. Run `/login claude` to try again."
      : "Claude rejected the saved sign-in (invalid_grant). Run `/login claude` to sign in again.";
  }
  if (status === 429) {
    return "Claude is rate limiting sign-in (HTTP 429). Wait a moment and try again.";
  }
  const detail = redact(
    [code, description].filter((part): part is string => Boolean(part)).join(": "),
    sent,
  );
  return `Claude sign-in failed (HTTP ${status})${detail ? `: ${detail}` : ""}.`;
}

const isTimeout = (signal: AbortSignal): boolean =>
  signal.reason instanceof Error && signal.reason.name === "TimeoutError";

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function fetchJsonWithDeadline(
  url: string,
  init: RequestInit,
  options: RequestOptions,
): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const deadline = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  try {
    const response = await (options.fetch ?? fetch)(url, { ...init, signal });
    if (!response.ok && !options.includeErrorBody) {
      void response.body?.cancel().catch(() => {});
      return { ok: false, status: response.status, payload: undefined };
    }
    return { ok: response.ok, status: response.status, payload: parseJson(await response.text()) };
  } catch (error) {
    if (!signal.aborted) throw new ClaudeAuthError(`Could not reach ${url}.`, { cause: error });
    // Pi bounds a refresh with `AbortSignal.timeout`, so an aborted caller signal is not always a user cancel.
    if (isTimeout(signal)) {
      throw new ClaudeAuthError(`Claude did not answer ${url} in time. Try again.`, {
        cause: error,
      });
    }
    throw new ClaudeAuthError("Claude sign-in was cancelled.", { cause: error });
  }
}

async function requestToken(
  body: Record<string, string>,
  options: TokenRequestOptions,
): Promise<TokenPayload> {
  const { ok, status, payload } = await fetchJsonWithDeadline(
    CLAUDE_TOKEN_URL,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    },
    { ...options, timeoutMs: options.timeoutMs ?? TOKEN_TIMEOUT_MS, includeErrorBody: true },
  );

  if (!ok) throw new ClaudeAuthError(describeFailure(status, payload, body));
  if (payload === undefined) {
    throw new ClaudeAuthError("Claude returned a token response that was not valid JSON.");
  }
  return parseTokenPayload(payload);
}

export async function exchangeAuthorizationCode(
  grant: AuthorizationGrant,
  options: TokenRequestOptions,
): Promise<RefreshableTokenPayload> {
  const token = await requestToken(
    {
      grant_type: "authorization_code",
      client_id: CLAUDE_CLIENT_ID,
      code: grant.code,
      state: grant.state,
      redirect_uri: grant.redirectUri,
      code_verifier: grant.verifier,
    },
    options,
  );
  if (!token.refresh) {
    throw new ClaudeAuthError("Claude token response did not include a refresh token.");
  }
  return { ...token, refresh: token.refresh };
}

export function refreshAccessToken(
  refreshToken: string,
  options: TokenRequestOptions,
): Promise<TokenPayload> {
  return requestToken(
    { grant_type: "refresh_token", client_id: CLAUDE_CLIENT_ID, refresh_token: refreshToken },
    options,
  );
}
