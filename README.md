# pi-claude-oauth

Use a Claude Pro, Max, or Ultra subscription from [Pi](https://github.com/earendil-works/pi) through Anthropic's OAuth
tokens.

The extension registers a native Pi provider, `claude`, that:

- signs in with OAuth and PKCE, or accepts a `claude setup-token` token,
- refreshes access tokens through Anthropic's token endpoint with Pi's locked, single-flight refresh path,
- streams through Pi's built-in Anthropic Messages implementation, so message conversion, tool calls, prompt caching,
  usage accounting, thinking, cancellation, and retries behave exactly like the built-in `anthropic` provider,
- reads a `sk-ant-oat` setup token from `CLAUDE_CODE_OAUTH_TOKEN` when no credential is stored.

## Requirements

- Pi 1.6.0 or newer.
- A Claude Pro, Max, Ultra, Team, or Enterprise subscription with Claude Code access.

## Install

```bash
pi install npm:pi-claude-oauth
```

To try it for one run without saving it to your Pi settings:

```bash
pi -e npm:pi-claude-oauth
```

## Sign in

```
/login claude
```

Pi first asks how to sign in. **Sign in with an API key** asks you to paste a `claude setup-token` token and saves it
in Pi. **Sign in with a Claude subscription** offers three methods:

| Method                              | What it does                                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser sign-in                     | Authorizes in your browser and returns through `http://localhost:53692/callback`. If the browser runs on another machine, paste the final redirect URL instead. |
| Copy code (headless)                | Uses Anthropic's manual redirect and asks you to paste the `code#state` value it shows. No local server.                                                        |
| Import setup token from environment | Saves the `claude setup-token` token from `CLAUDE_CODE_OAUTH_TOKEN`. Pi never asks you to type or paste it.                                                     |

Prefer the browser flow interactively. For containers, CI, or any environment without a browser, export a setup token
before starting Pi. Pi uses it directly, or `/login claude` can save it:

```bash
export CLAUDE_CODE_OAUTH_TOKEN="$(claude setup-token)"
```

When a credential is stored, it wins over the environment variable. A setup token cannot be refreshed: when it expires,
run `/login claude` and paste a new one with **Sign in with an API key**, or export it, restart Pi, and import it with
**Sign in with a Claude subscription** → **Import setup token from environment**.

## Use it

```
/model claude/claude-opus-5-5
/claude status
/claude usage
```

- `/claude status` renders a card with the sign-in source, the number of registered models, and the active model.
- `/claude usage` shows the subscription's rolling usage windows with reset times.
- `/claude login` and `/claude logout` point at the built-in `/login` and `/logout` commands.

Model entries reuse the Anthropic catalog built into the installed Pi version, including context windows, output limits,
thinking levels, compatibility flags, and per-token costs. New Claude models appear when you update Pi. Pi's live
pi.dev catalog updates reach the built-in `anthropic` provider only, not this one.

## Billing and terms

This extension does not bypass anything. It performs the same OAuth client, scopes, and token refresh that Claude Code
uses, and it sends the tokens to Anthropic's API.

Pi's built-in billing warning applies only to its `anthropic` provider, not this extension's `claude` provider. The
`/login claude` sign-in prompts show the equivalent warning instead: third-party harness usage is billed per token as
extra usage, outside your Claude plan limits. Manage extra usage at https://claude.ai/settings/usage.

Treat subscription OAuth as an account-level credential, not as a way to move plan limits into another harness. Review
Anthropic's consumer terms and usage settings before relying on it for daily work.

## Security

- Pi stores the credential in `~/.pi/agent/auth.json`. The extension never writes tokens anywhere else.
- Access and refresh tokens are never logged. Error messages include the HTTP status and Anthropic's OAuth error code
  and description, with the submitted code, state, PKCE verifier, or refresh token redacted.
- The loopback callback accepts only requests with the matching `state` nonce. The PKCE verifier is published to
  neither the browser nor the callback URL; it goes directly to the token endpoint.
- Refresh rotates the refresh token under Pi's credential-store lock, so concurrent requests and concurrent Pi processes
  refresh once.
- The extension deliberately does not import the refresh token from Claude Code's own credential store. Anthropic rotates
  refresh tokens, so copying that token and refreshing it here would invalidate your Claude Code login.
- The OAuth client id is Claude Code's public PKCE client id. It is not a secret.

## Protocol reference

The constants in `src/oauth.ts` mirror Claude Code 2.1.331:

| Item            | Value                                                                               |
| --------------- | ----------------------------------------------------------------------------------- |
| Authorize       | `https://claude.com/cai/oauth/authorize`                                            |
| Token           | `https://platform.claude.com/v1/oauth/token`                                        |
| Manual redirect | `https://platform.claude.com/oauth/code/callback`                                   |
| Client id       | `9d1c250a-e61b-44d9-88ed-5944d1962f5e`                                              |
| Scopes          | `user:profile user:inference user:sessions:claude_code`                             |
| PKCE            | `S256`, independent `state` nonce, `code=true`                                      |
| Grants          | `authorization_code`, `refresh_token` with JSON bodies                              |
| Inference beta  | `oauth-2025-04-20` (added by Pi's Anthropic implementation for `sk-ant-oat` tokens) |

Documentation this follows:

- [Authentication](https://code.claude.com/docs/en/authentication): credential storage, precedence, long-lived tokens
- [CLI reference](https://code.claude.com/docs/en/cli-reference): `claude setup-token`
- [Environment variables](https://code.claude.com/docs/en/env-vars): `CLAUDE_CODE_OAUTH_TOKEN`
- [GitHub Actions](https://code.claude.com/docs/en/github-actions): plans whose subscriptions issue these tokens
- Pi extension API: `docs/extensions.md` and `docs/custom-provider.md` in the Pi install, specifically native
  `Provider` registration, `OAuthAuth`, `AuthInteraction`, and `registerEntryRenderer`

## Development

Use Bun 1.4.5 to install and format, and Node 22.19 or later to run the tests. Pi loads the
TypeScript sources directly, so there is no build step.

```bash
bun install --frozen-lockfile
bun run test           # Vitest; use bun run test:watch while editing
bun run test:coverage  # 80% minimum statement/branch/function/line coverage per source file
bun run format         # apply formatting; use bun run format:check to check only
bun run lint           # type-aware Oxlint
bun run typecheck      # tsc --noEmit
bun run check          # all of the checks above, as CI runs them
pi -e .                # load this checkout in Pi
```

Layout:

```
src/
  index.ts            extension entry: provider, card renderer, /claude command
  provider.ts         native Pi provider with OAuth and ambient token auth
  login.ts            browser, copy-code, and setup-token login methods
  oauth.ts            endpoints, PKCE, authorize URL, token exchange, refresh
  callback-server.ts  loopback redirect handler with manual fallback
  credential.ts       credential shaping and setup-token rules
  models.ts           Claude catalog derived from Pi's Anthropic catalog
  usage.ts            /api/oauth/usage lookup and formatting
  commands.ts         /claude status and usage cards
  ui.ts               durable card renderer
```

## Limitations

- Anthropic does not publish a long-term stability contract for this OAuth flow. If Claude Code changes endpoints,
  scopes, or headers, the constants in `oauth.ts` need the same change.
- Usage windows come from Claude's internal usage endpoint. When that endpoint is unavailable, `/claude usage` reports
  the HTTP status instead of guessing.
- A setup token expires after a year and cannot be refreshed.
