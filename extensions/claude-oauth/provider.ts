import type { ApiKeyAuth, OAuthAuth, OAuthCredential, Provider } from "@earendil-works/pi-ai";
import { createProvider } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/compat";
import { refreshAccessToken } from "./oauth";
import { isSetupTokenCredential, setupTokenRefreshError, toOAuthCredential } from "./credential";
import { login } from "./login";
import { CLAUDE_PROVIDER_ID, CLAUDE_PROVIDER_NAME, claudeModels } from "./models";

/** Documented long-lived token variable for SDK and automated environments. */
export const CLAUDE_CODE_OAUTH_TOKEN_ENV = "CLAUDE_CODE_OAUTH_TOKEN";

const ANTHROPIC_API_URL = "https://api.anthropic.com";

function claudeOAuth(): OAuthAuth {
  return {
    name: CLAUDE_PROVIDER_NAME,
    isSubscription: true,
    loginLabel: "Sign in with a Claude subscription",
    login: (interaction) => login(interaction),
    async refresh(credential: OAuthCredential, signal: AbortSignal): Promise<OAuthCredential> {
      if (isSetupTokenCredential(credential)) throw setupTokenRefreshError();
      const token = await refreshAccessToken(credential.refresh, { signal });
      return toOAuthCredential(token, credential.refresh);
    },
    async toAuth(credential: OAuthCredential) {
      // A `sk-ant-oat` API key makes Pi's Anthropic implementation use
      // `Authorization: Bearer` with the OAuth beta header and Claude Code
      // identity headers.
      return { apiKey: credential.access };
    },
  };
}

function claudeEnvToken(): ApiKeyAuth {
  return {
    name: `${CLAUDE_CODE_OAUTH_TOKEN_ENV} environment variable`,
    async resolve({ ctx, signal }) {
      const token = await ctx.env(CLAUDE_CODE_OAUTH_TOKEN_ENV);
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
