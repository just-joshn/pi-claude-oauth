import type { OAuthCredential } from "@earendil-works/pi-ai";

import { CLAUDE_TOKEN_PREFIX, ClaudeAuthError, type RefreshableTokenPayload } from "./oauth.ts";

export const CLAUDE_CODE_OAUTH_TOKEN_ENV = "CLAUDE_CODE_OAUTH_TOKEN";

export const SETUP_TOKEN_LIFETIME_MS = 365 * 24 * 60 * 60_000;

const SETUP_TOKEN_PATTERN = new RegExp(`^${CLAUDE_TOKEN_PREFIX}[A-Za-z0-9_-]+$`);

/** Stores the server's own deadline: Pi refreshes at least five minutes before `expires`. */
export function toOAuthCredential(token: RefreshableTokenPayload, now = Date.now()): OAuthCredential {
	return {
		type: "oauth",
		access: token.access,
		refresh: token.refresh,
		expires: now + token.expiresIn * 1_000,
	};
}

export function parseSetupToken(value: string | undefined): string | undefined {
	const token = value?.trim();
	return token !== undefined && SETUP_TOKEN_PATTERN.test(token) ? token : undefined;
}

export function setupTokenCredential(token: string | undefined, now = Date.now()): OAuthCredential {
	if (!token?.trim()) {
		throw new ClaudeAuthError(
			`Set ${CLAUDE_CODE_OAUTH_TOKEN_ENV} to a token from \`claude setup-token\` before starting Pi.`,
		);
	}
	const access = parseSetupToken(token);
	if (!access) {
		throw new ClaudeAuthError(
			`${CLAUDE_CODE_OAUTH_TOKEN_ENV} is set, but it is not a single-line ${CLAUDE_TOKEN_PREFIX} token from \`claude setup-token\`. Fix the value and restart Pi.`,
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
