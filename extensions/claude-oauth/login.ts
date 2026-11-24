import type { OAuthCredential, ProviderAuthInteraction } from "@earendil-works/pi-ai";
import { startLoopbackServer, type LoopbackServer } from "./callback-server";
import { setupTokenCredential, toOAuthCredential } from "./credential";
import {
  buildAuthorizeUrl,
  CLAUDE_COPY_CODE_REDIRECT_URI,
  ClaudeAuthError,
  createPkce,
  exchangeAuthorizationCode,
  parseAuthorizationInput,
  type FetchLike,
} from "./oauth";

export const LOGIN_METHODS = ["browser", "copy_code", "setup_token"] as const;
export type LoginMethod = (typeof LOGIN_METHODS)[number];

const FALLBACK_REDIRECT_URI = "http://localhost:53692/callback";

export interface LoginDependencies {
  readonly fetch?: FetchLike;
  readonly startServer?: typeof startLoopbackServer;
}

function requireCode(input: string, expectedState: string): string {
  const parsed = parseAuthorizationInput(input);
  if (parsed.state !== undefined && parsed.state !== expectedState) {
    throw new ClaudeAuthError("The pasted sign-in result belongs to a different request. Start the login again.");
  }
  if (!parsed.code) throw new ClaudeAuthError("No authorization code was found in that sign-in result.");
  return parsed.code;
}

/**
 * Read the code from the local callback, or from a pasted redirect URL for
 * browsers that cannot reach the loopback server (SSH, containers, remote
 * machines). Whichever arrives first wins and cancels the other.
 */
async function readBrowserCode(
  interaction: ProviderAuthInteraction,
  server: LoopbackServer | undefined,
  placeholder: string,
): Promise<string> {
  const manualController = new AbortController();
  const manual = interaction
    .prompt({
      type: "manual_code",
      message: "Complete sign-in in the browser, or paste the authorization code or redirect URL here:",
      placeholder,
      signal: manualController.signal,
    })
    .then((value) => ({ source: "manual" as const, value }))
    .catch((error: unknown) => {
      if (manualController.signal.aborted) return new Promise<never>(() => {});
      throw error;
    });

  if (!server) {
    try {
      return (await manual).value;
    } finally {
      manualController.abort();
    }
  }

  const callback = server.waitForCode().then((code) => {
    if (code === undefined) throw new ClaudeAuthError("The local sign-in callback stopped before the browser returned.");
    return { source: "callback" as const, value: code };
  });

  try {
    return (await Promise.race([callback, manual])).value;
  } finally {
    manualController.abort();
    server.close();
  }
}

async function exchangeCode(
  interaction: ProviderAuthInteraction,
  dependencies: LoginDependencies,
  input: { code: string; verifier: string; redirectUri: string },
): Promise<OAuthCredential> {
  interaction.notify({ type: "progress", message: "Exchanging the authorization code for tokens..." });
  const token = await exchangeAuthorizationCode(
    { code: input.code, state: input.verifier, verifier: input.verifier, redirectUri: input.redirectUri },
    { signal: interaction.signal, fetch: dependencies.fetch },
  );
  return toOAuthCredential(token);
}

async function loginWithBrowser(
  interaction: ProviderAuthInteraction,
  dependencies: LoginDependencies,
): Promise<OAuthCredential> {
  const pkce = await createPkce();
  const startServer = dependencies.startServer ?? startLoopbackServer;
  const server = await startServer({ state: pkce.verifier, signal: interaction.signal }).catch(() => undefined);
  const redirectUri = server?.redirectUri ?? FALLBACK_REDIRECT_URI;

  try {
    interaction.notify({
      type: "auth_url",
      url: buildAuthorizeUrl({ redirectUri, state: pkce.verifier, challenge: pkce.challenge }),
      instructions:
        "Complete sign-in in your browser. If the browser runs on another machine, paste the final redirect URL here.",
    });

    const raw = await readBrowserCode(interaction, server, redirectUri);
    const code = requireCode(raw, pkce.verifier);
    return await exchangeCode(interaction, dependencies, { code, verifier: pkce.verifier, redirectUri });
  } finally {
    server?.close();
  }
}

async function loginWithCopyCode(
  interaction: ProviderAuthInteraction,
  dependencies: LoginDependencies,
): Promise<OAuthCredential> {
  const pkce = await createPkce();

  interaction.notify({
    type: "auth_url",
    url: buildAuthorizeUrl({
      redirectUri: CLAUDE_COPY_CODE_REDIRECT_URI,
      state: pkce.verifier,
      challenge: pkce.challenge,
    }),
    instructions: "Complete sign-in, then copy the code Anthropic shows and paste it here.",
  });

  const pasted = await interaction.prompt({
    type: "manual_code",
    message: "Paste the code Anthropic shows after signing in:",
    placeholder: "code#state",
    signal: interaction.signal,
  });
  const code = requireCode(pasted, pkce.verifier);
  return exchangeCode(interaction, dependencies, { code, verifier: pkce.verifier, redirectUri: CLAUDE_COPY_CODE_REDIRECT_URI });
}

async function loginWithSetupToken(interaction: ProviderAuthInteraction): Promise<OAuthCredential> {
  interaction.notify({
    type: "info",
    message: "Run `claude setup-token` in a terminal, then paste the token it prints.",
    links: [{ url: "https://code.claude.com/docs/en/authentication", label: "Claude Code authentication" }],
  });
  const token = await interaction.prompt({
    type: "secret",
    message: "Paste the Claude setup token:",
    placeholder: "sk-ant-oat01-...",
    signal: interaction.signal,
  });
  return setupTokenCredential(token);
}

export async function login(
  interaction: ProviderAuthInteraction,
  dependencies: LoginDependencies = {},
): Promise<OAuthCredential> {
  const method = (await interaction.prompt({
    type: "select",
    message: "Sign in to Claude:",
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
        label: "Long-lived token",
        description: "Paste the token printed by `claude setup-token`",
      },
    ],
  })) as LoginMethod;

  switch (method) {
    case "browser":
      return loginWithBrowser(interaction, dependencies);
    case "copy_code":
      return loginWithCopyCode(interaction, dependencies);
    case "setup_token":
      return loginWithSetupToken(interaction);
    default:
      throw new ClaudeAuthError(`Unknown Claude login method "${String(method)}".`);
  }
}
