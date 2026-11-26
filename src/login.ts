import type { AuthPrompt, OAuthCredential, ProviderAuthInteraction } from "@earendil-works/pi-ai";

import {
  DEFAULT_REDIRECT_URI,
  type LoopbackServer,
  startLoopbackServer,
} from "./callback-server.ts";
import {
  CLAUDE_CODE_OAUTH_TOKEN_ENV,
  setupTokenCredential,
  toOAuthCredential,
} from "./credential.ts";
import {
  type AuthorizationGrant,
  buildAuthorizeUrl,
  CLAUDE_COPY_CODE_REDIRECT_URI,
  ClaudeAuthError,
  createAuthorizationSession,
  exchangeAuthorizationCode,
  type FetchLike,
  InvalidPasteError,
  parseAuthorizationInput,
} from "./oauth.ts";

export const BILLING_WARNING =
  "Third-party harness usage is billed per token as extra usage, outside your plan limits.";

export interface LoginDependencies {
  readonly fetch?: FetchLike;
  readonly startServer?: typeof startLoopbackServer;
}

interface PendingSignIn {
  readonly state: string;
  readonly signInLink: string;
}

function requireCode(input: string, pending: PendingSignIn): string {
  const parsed = parseAuthorizationInput(input, pending.signInLink);
  if (parsed.state !== undefined && parsed.state !== pending.state) {
    throw new InvalidPasteError("The pasted sign-in result belongs to a different request.");
  }
  if (parsed.failure) {
    throw new ClaudeAuthError(parsed.failure);
  }
  if (!parsed.code) {
    throw new InvalidPasteError("No authorization code was found in that sign-in result.");
  }
  return parsed.code;
}

async function promptForCode(
  interaction: ProviderAuthInteraction,
  prompt: AuthPrompt,
  pending: PendingSignIn,
): Promise<string> {
  const pasted = await interaction.prompt(prompt);
  if (!pasted.trim()) {
    return promptForCode(interaction, prompt, pending);
  }
  try {
    return requireCode(pasted, pending);
  } catch (error) {
    if (!(error instanceof InvalidPasteError)) {
      throw error;
    }
    interaction.notify({ type: "info", message: error.message });
    return promptForCode(interaction, prompt, pending);
  }
}

async function readBrowserCode(
  interaction: ProviderAuthInteraction,
  server: LoopbackServer | undefined,
  placeholder: string,
  pending: PendingSignIn,
): Promise<string> {
  const dismissPrompt = new AbortController();
  const pasted = promptForCode(
    interaction,
    {
      type: "manual_code",
      message:
        "Complete sign-in in the browser, or paste the authorization code or redirect URL here:",
      placeholder,
      signal: AbortSignal.any([interaction.signal, dismissPrompt.signal]),
    },
    pending,
  );
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
    const signInLink = buildAuthorizeUrl({ redirectUri, state, challenge });
    interaction.notify({
      type: "auth_url",
      url: signInLink,
      instructions:
        "Complete sign-in in your browser. If the browser runs on another machine, paste the final redirect URL here.",
    });

    code = await readBrowserCode(interaction, server, redirectUri, { state, signInLink });
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
  const signInLink = buildAuthorizeUrl({ redirectUri, state, challenge });

  interaction.notify({
    type: "auth_url",
    url: signInLink,
    instructions: "Complete sign-in, then copy the code Anthropic shows and paste it here.",
  });

  const code = await promptForCode(
    interaction,
    {
      type: "manual_code",
      message: "Paste the code Anthropic shows after signing in:",
      placeholder: "code#state",
      signal: interaction.signal,
    },
    { state, signInLink },
  );
  return exchangeCode(interaction, dependencies, { code, state, verifier, redirectUri });
}

export async function login(
  interaction: ProviderAuthInteraction,
  dependencies: LoginDependencies = {},
): Promise<OAuthCredential> {
  const method = await interaction.prompt({
    type: "select",
    message: `Sign in to Claude. ${BILLING_WARNING}`,
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
