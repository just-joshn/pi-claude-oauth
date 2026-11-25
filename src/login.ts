import type { OAuthCredential, ProviderAuthInteraction } from "@earendil-works/pi-ai";

import { DEFAULT_REDIRECT_URI, type LoopbackServer, startLoopbackServer } from "./callback-server";
import { CLAUDE_CODE_OAUTH_TOKEN_ENV, setupTokenCredential, toOAuthCredential } from "./credential";
import {
  type AuthorizationGrant,
  buildAuthorizeUrl,
  CLAUDE_COPY_CODE_REDIRECT_URI,
  ClaudeAuthError,
  createAuthorizationSession,
  exchangeAuthorizationCode,
  type FetchLike,
  parseAuthorizationInput,
} from "./oauth";

export interface LoginDependencies {
  readonly fetch?: FetchLike;
  readonly startServer?: typeof startLoopbackServer;
}

function requireCode(input: string, expectedState: string): string {
  const parsed = parseAuthorizationInput(input);
  if (parsed.state !== undefined && parsed.state !== expectedState) {
    throw new ClaudeAuthError(
      "The pasted sign-in result belongs to a different request. Start the login again.",
    );
  }
  if (!parsed.code)
    throw new ClaudeAuthError("No authorization code was found in that sign-in result.");
  return parsed.code;
}

async function readBrowserCode(
  interaction: ProviderAuthInteraction,
  server: LoopbackServer | undefined,
  placeholder: string,
): Promise<string> {
  const dismissPrompt = new AbortController();
  const pasted = interaction.prompt({
    type: "manual_code",
    message:
      "Complete sign-in in the browser, or paste the authorization code or redirect URL here:",
    placeholder,
    signal: AbortSignal.any([interaction.signal, dismissPrompt.signal]),
  });
  if (!server) return pasted;

  try {
    return await Promise.race([server.waitForCode(), pasted]);
  } finally {
    dismissPrompt.abort();
  }
}

async function exchangeCode(
  interaction: ProviderAuthInteraction,
  dependencies: LoginDependencies,
  grant: AuthorizationGrant,
): Promise<OAuthCredential> {
  interaction.notify({
    type: "progress",
    message: "Exchanging the authorization code for tokens...",
  });
  const token = await exchangeAuthorizationCode(grant, {
    signal: interaction.signal,
    fetch: dependencies.fetch,
  });
  return toOAuthCredential(token);
}

async function loginWithBrowser(
  interaction: ProviderAuthInteraction,
  dependencies: LoginDependencies,
): Promise<OAuthCredential> {
  const { state, verifier, challenge } = await createAuthorizationSession();
  const startServer = dependencies.startServer ?? startLoopbackServer;
  const server = await startServer({ state, signal: interaction.signal }).catch(() => undefined);
  const redirectUri = server?.redirectUri ?? DEFAULT_REDIRECT_URI;

  let code: string;
  try {
    if (interaction.signal.aborted) throw new ClaudeAuthError("Claude sign-in was cancelled.");
    interaction.notify({
      type: "auth_url",
      url: buildAuthorizeUrl({ redirectUri, state, challenge }),
      instructions:
        "Complete sign-in in your browser. If the browser runs on another machine, paste the final redirect URL here.",
    });

    const raw = await readBrowserCode(interaction, server, redirectUri);
    code = requireCode(raw, state);
  } finally {
    server?.close();
  }
  return exchangeCode(interaction, dependencies, { code, state, verifier, redirectUri });
}

async function loginWithCopyCode(
  interaction: ProviderAuthInteraction,
  dependencies: LoginDependencies,
): Promise<OAuthCredential> {
  const { state, verifier, challenge } = await createAuthorizationSession();
  const redirectUri = CLAUDE_COPY_CODE_REDIRECT_URI;

  interaction.notify({
    type: "auth_url",
    url: buildAuthorizeUrl({ redirectUri, state, challenge }),
    instructions: "Complete sign-in, then copy the code Anthropic shows and paste it here.",
  });

  const pasted = await interaction.prompt({
    type: "manual_code",
    message: "Paste the code Anthropic shows after signing in:",
    placeholder: "code#state",
    signal: interaction.signal,
  });
  const code = requireCode(pasted, state);
  return exchangeCode(interaction, dependencies, { code, state, verifier, redirectUri });
}

export async function login(
  interaction: ProviderAuthInteraction,
  dependencies: LoginDependencies = {},
): Promise<OAuthCredential> {
  const method = await interaction.prompt({
    type: "select",
    message:
      "Sign in to Claude. Third-party harness usage is billed per token as extra usage, outside your plan limits.",
    options: [
      {
        id: "browser",
        label: "Browser sign-in",
        description: "Sign in with a Claude Pro, Max, or Ultra account",
      },
      {
        id: "copy_code",
        label: "Copy code (headless)",
        description: "Paste the code Anthropic shows; no local callback server",
      },
      {
        id: "setup_token",
        label: "Import setup token from environment",
        description: `Save the token from ${CLAUDE_CODE_OAUTH_TOKEN_ENV} in Pi`,
      },
    ],
  });

  switch (method) {
    case "browser":
      return loginWithBrowser(interaction, dependencies);
    case "copy_code":
      return loginWithCopyCode(interaction, dependencies);
    case "setup_token":
      interaction.signal.throwIfAborted();
      return setupTokenCredential(process.env[CLAUDE_CODE_OAUTH_TOKEN_ENV]);
    default:
      throw new ClaudeAuthError(`Unknown Claude login method "${method}".`);
  }
}
