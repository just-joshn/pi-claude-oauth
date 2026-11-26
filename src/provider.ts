import type { ApiKeyAuth, OAuthAuth, OAuthCredential, Provider } from "@earendil-works/pi-ai";
import { createProvider } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/compat";

import {
	CLAUDE_CODE_OAUTH_TOKEN_ENV,
	isSetupTokenCredential,
	parseSetupToken,
	setupTokenRefreshError,
	toOAuthCredential,
} from "./credential.ts";
import { BILLING_WARNING, login } from "./login.ts";
import { CLAUDE_PROVIDER_ID, CLAUDE_PROVIDER_NAME, claudeModels } from "./models.ts";
import { CLAUDE_TOKEN_PREFIX, ClaudeAuthError, refreshAccessToken } from "./oauth.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com";

function claudeOAuth(): OAuthAuth {
	return {
		name: CLAUDE_PROVIDER_NAME,
		isSubscription: true,
		loginLabel: "Sign in with a Claude subscription",
		login: (interaction) => login(interaction),
		async refresh(credential: OAuthCredential, signal: AbortSignal): Promise<OAuthCredential> {
			if (isSetupTokenCredential(credential)) {
				throw setupTokenRefreshError();
			}
			const token = await refreshAccessToken(credential.refresh, { signal });
			return toOAuthCredential({ ...token, refresh: token.refresh ?? credential.refresh });
		},
		async toAuth(credential: OAuthCredential) {
			// Pi's Anthropic API sends `sk-ant-oat` keys as Bearer tokens with the OAuth beta and Claude Code headers.
			if (!isSetupTokenCredential(credential)) {
				return { apiKey: credential.access };
			}
			const token = parseSetupToken(credential.access);
			if (!token) {
				throw new ClaudeAuthError(
					"The saved Claude setup token is malformed. Run /login claude to sign in again or save a valid token from `claude setup-token`.",
				);
			}
			return { apiKey: token };
		},
	};
}

function claudeEnvToken(): ApiKeyAuth {
	return {
		name: `${CLAUDE_CODE_OAUTH_TOKEN_ENV} environment variable`,
		async login(interaction) {
			const pasted = await interaction.prompt({
				type: "secret",
				message: `${BILLING_WARNING} Paste a token from \`claude setup-token\`:`,
				placeholder: `${CLAUDE_TOKEN_PREFIX}01-...`,
				signal: interaction.signal,
			});
			const key = parseSetupToken(pasted);
			if (!key) {
				throw new ClaudeAuthError(
					`That is not a single-line ${CLAUDE_TOKEN_PREFIX} token from \`claude setup-token\`.`,
				);
			}
			return { type: "api_key", key };
		},
		async resolve({ ctx, credential, signal }) {
			signal.throwIfAborted();
			if (credential) {
				if (!credential.key) {
					return undefined;
				}
				return {
					auth: { apiKey: credential.key },
					...(credential.env && { env: credential.env }),
					source: "Pi credential",
				};
			}
			const token = parseSetupToken(await ctx.env(CLAUDE_CODE_OAUTH_TOKEN_ENV));
			signal.throwIfAborted();
			return token ? { auth: { apiKey: token }, source: CLAUDE_CODE_OAUTH_TOKEN_ENV } : undefined;
		},
	};
}

export function claudeProvider(): Provider<"anthropic-messages"> {
	return createProvider({
		id: CLAUDE_PROVIDER_ID,
		name: CLAUDE_PROVIDER_NAME,
		baseUrl: ANTHROPIC_API_URL,
		auth: { apiKey: claudeEnvToken(), oauth: claudeOAuth() },
		models: claudeModels(),
		api: anthropicMessagesApi(),
	});
}
