# pi-claude-oauth

Use a Claude Pro, Max, or Ultra subscription from [Pi](https://github.com/earendil-works/pi) through Anthropic's OAuth
tokens.

The extension registers a native Pi provider, `claude`, that:

- signs in with the same PKCE flow Claude Code uses, or accepts a `claude setup-token` token,
- refreshes access tokens through Anthropic's token endpoint with Pi's locked, single-flight refresh path,
- streams through Pi's built-in Anthropic Messages implementation, so message conversion, tool calls, prompt caching,
  usage accounting, thinking, cancellation, and retries behave exactly like the built-in `anthropic` provider,
- reads `CLAUDE_CODE_OAUTH_TOKEN` when no credential is stored.

## Requirements

- Pi 1.6.0 or newer.
- A Claude Pro, Max, Ultra, Team, or Enterprise subscription with Claude Code access.

## Install

```bash
# From a git checkout
pi install git:github.com/<you>/pi-claude-oauth

# Or try a local checkout for one run
pi -e ./pi-claude-oauth
```

## Sign in

```
/login claude
```

Three methods are offered:

| Method | What it does |
| --- | --- |
| Browser sign-in | Authorizes in your browser and returns through `http://localhost:53692/callback`. If the browser runs on another machine, paste the final redirect URL instead. |
| Copy code (headless) | Uses Anthropic's manual redirect and asks you to paste the `code#state` value it shows. No local server. |
| Long-lived token | Prompts for the token printed by `claude setup-token` (one-year token, documented for CI and scripts). |

Prefer the browser flow interactively. For containers, CI, or any environment without a browser, use
`claude setup-token` and paste the result, or export it yourself:

```bash
export CLAUDE_CODE_OAUTH_TOKEN="$(claude setup-token)"
```

When a credential is stored, it wins over the environment variable. A setup token cannot be refreshed: when it expires,
generate another one and run `/login claude` again.

## Use it

```
/model claude/claude-opus-5-5
/claude status
/claude usage
```

- `/claude status` renders a card with the sign-in source, the number of registered models, and the active model.
- `/claude usage` shows the subscription's rolling usage windows with reset times.
- `/claude login` and `/claude logout` point at the built-in `/login` and `/logout` commands.

Model entries reuse Pi's generated Anthropic catalog, including context windows, output limits, thinking levels,
compatibility flags, and per-token costs, so new Claude models appear as soon as Pi ships a catalog update.

## Billing and terms

This extension does not bypass anything. It performs the same OAuth client, scopes, and token refresh that Claude Code
uses, and it sends the tokens to Anthropic's API.

Pi warns when an Anthropic subscription token is active:

> Anthropic subscription auth is active. Third-party harness usage draws from extra usage and is billed per token, not
> your Claude plan limits. Manage extra usage at https://claude.ai/settings/usage.

Treat subscription OAuth as an account-level credential, not as a way to move plan limits into another harness. Review
Anthropic's consumer terms and usage settings before relying on it for daily work.

## Security

- Pi stores the credential in `~/.pi/agent/auth.json`. The extension never writes tokens anywhere else.
- Access and refresh tokens are never logged. Error messages include HTTP status and OAuth error codes only.
- Refresh rotates the refresh token under Pi's credential-store lock, so concurrent requests and concurrent Pi processes
  refresh once.
- The extension deliberately does not import the refresh token from Claude Code's own credential store. Anthropic rotates
  refresh tokens, so copying that token and refreshing it here would invalidate your Claude Code login.
- The OAuth client id is Claude Code's public PKCE client id. It is not a secret.

## Protocol reference

The constants in `extensions/claude-oauth/oauth.ts` mirror Claude Code 2.1.331:

| Item | Value |
| --- | --- |
| Authorize | `https://claude.com/cai/oauth/authorize` |
| Token | `https://platform.claude.com/v1/oauth/token` |
| Manual redirect | `https://platform.claude.com/oauth/code/callback` |
| Client id | `9d1c250a-e61b-44d9-88ed-5944d1962f5e` |
| Scopes | `user:profile user:inference user:sessions:claude_code` |
| PKCE | `S256`, verifier also used as `state`, `code=true` |
| Grants | `authorization_code`, `refresh_token` with JSON bodies |
| Inference beta | `oauth-2025-04-20` (added by Pi's Anthropic implementation for `sk-ant-oat` tokens) |

Documentation this follows:

- [Authentication](https://code.claude.com/docs/en/authentication): credential storage, precedence, long-lived tokens
- [CLI reference](https://code.claude.com/docs/en/cli-reference): `claude setup-token`
- [Environment variables](https://code.claude.com/docs/en/env-vars): `CLAUDE_CODE_OAUTH_TOKEN`
- [GitHub Actions](https://code.claude.com/docs/en/github-actions): plans whose subscriptions issue these tokens
- Pi extension API: `docs/extensions.md` and `docs/custom-provider.md` in the Pi install, specifically native
  `Provider` registration, `OAuthAuth`, `AuthInteraction`, and `registerEntryRenderer`

## Development

```bash
npm install
npm test              # vitest
npm run coverage      # coverage thresholds: 80% lines, branches, functions, statements
npm run typecheck     # tsc --noEmit
pi -e .               # load this checkout in Pi
```

Layout:

```
extensions/claude-oauth/
  index.ts            extension entry: provider, card renderer, /claude command
  provider.ts         native Pi provider with OAuth and ambient token auth
  login.ts            browser, copy-code, and setup-token login methods
  oauth.ts            endpoints, PKCE, authorize URL, token exchange, refresh
  callback-server.ts  loopback redirect handler with manual fallback
  credential.ts       credential shaping, expiry skew, setup-token rules
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
