import type { OAuthCredential } from "@earendil-works/pi-ai";

import { CLAUDE_TOKEN_PREFIX, ClaudeAuthError, type RefreshableTokenPayload } from "./oauth.ts";

export const CLAUDE_CODE_OAUTH_TOKEN_ENV = "CLAUDE_CODE_OAUTH_TOKEN";

/** `claude setup-token` issues a one-year token that cannot be refreshed. */
export const SETUP_TOKEN_LIFETIME_MS = 365 * 24 * 60 * 60_000;

/** Stores the server's own deadline: Pi already refreshes five minutes before `expires`. */
export function toOAuthCredential(
  token: RefreshableTokenPayload,
  now = Date.now(),
): OAuthCredential {
  return {
    type: "oauth",
    access: token.access,
    refresh: token.refresh,
    expires: now + token.expiresIn * 1_000,
  };
}

export function setupTokenCredential(token: string | undefined, now = Date.now()): OAuthCredential {
  const access = token?.trim();
  if (!access?.startsWith(CLAUDE_TOKEN_PREFIX)) {
    throw new ClaudeAuthError(
      `Set ${CLAUDE_CODE_OAUTH_TOKEN_ENV} to a token from \`claude setup-token\` before starting Pi.`,
    );
  }
  return { type: "oauth", access, refresh: "", expires: now + SETUP_TOKEN_LIFETIME_MS };
}

export function isSetupTokenCredential(credential: OAuthCredential): boolean {
  return credential.refresh.length === 0;
}

export function setupTokenRefreshError(): ClaudeAuthError {
  return new ClaudeAuthError(
    `This Claude token cannot be refreshed. Set ${CLAUDE_CODE_OAUTH_TOKEN_ENV} to a new setup token, restart Pi and run /login claude to import it.`,
  );
}
