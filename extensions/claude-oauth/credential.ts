import type { OAuthCredential } from "@earendil-works/pi-ai";
import { CLAUDE_TOKEN_PREFIX, ClaudeAuthError, type TokenPayload } from "./oauth";

/**
 * Claude OAuth access tokens live an hour. Pi refreshes five minutes before
 * expiry, so expire slightly early to keep refresh inside that window.
 */
export const EXPIRY_SKEW_MS = 5 * 60_000;

/** `claude setup-token` issues a one-year token that cannot be refreshed. */
export const SETUP_TOKEN_LIFETIME_MS = 365 * 24 * 60 * 60_000;

export function toOAuthCredential(token: TokenPayload, previousRefresh = "", now = Date.now()): OAuthCredential {
  return {
    type: "oauth",
    access: token.access,
    refresh: token.refresh ?? previousRefresh,
    expires: now + token.expiresIn * 1_000 - EXPIRY_SKEW_MS,
  };
}

export function isClaudeToken(value: string): boolean {
  return value.trim().startsWith(CLAUDE_TOKEN_PREFIX);
}

export function setupTokenCredential(token: string, now = Date.now()): OAuthCredential {
  const access = token.trim();
  if (!isClaudeToken(access)) {
    throw new ClaudeAuthError(
      "That value is not a Claude OAuth token. Run `claude setup-token` and paste the token it prints.",
    );
  }
  return { type: "oauth", access, refresh: "", expires: now + SETUP_TOKEN_LIFETIME_MS };
}

export function isSetupTokenCredential(credential: OAuthCredential): boolean {
  return credential.refresh.length === 0;
}

export function setupTokenRefreshError(): ClaudeAuthError {
  return new ClaudeAuthError(
    "This Claude token cannot be refreshed. Run `claude setup-token` again, then `/login claude` to store the new token.",
  );
}
